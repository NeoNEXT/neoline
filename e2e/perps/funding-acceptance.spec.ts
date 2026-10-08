import { Transaction, parseUnits } from 'ethers';
import { test, expect } from './fixtures';
import { depositAbi } from './funding.fake';
import { amount, confirm, confirmRow, expectToast, openFunding, sheet, submit } from './funding.ui';

test('F2 portfolio margin withdraws only free spot USDC', async ({ page, hl }) => {
  hl.accountMode = 'portfolioMargin';
  hl.accountValue = '2000';
  hl.spotTotal = '300.123456'; hl.spotHold = '50.000001';
  hl.spotBalances = [
    { coin: 'USDC', token: 0, total: hl.spotTotal, hold: hl.spotHold, entryNtl: '0' },
    { coin: 'PURR', token: 1, total: '9000', hold: '0', entryNtl: '0' },
  ];
  await openFunding(page, 'Withdraw', '$250.12');
  await page.locator('.preset-row').getByText('Max', { exact: true }).click();
  await expect(amount(page)).toHaveValue('250.123455');
  await submit(page).click();
  await expect(confirm(page)).toBeEnabled();
  await confirm(page).click();
  await expect(amount(page)).toHaveValue('');
  await expect(page.locator('.balance-tip')).toContainText('$0');
  expect(hl.withdrawals).toHaveLength(1);
  expect(hl.withdrawals[0].action).toMatchObject({ amount: '250.123455', sourceDex: 'spot' });
});

for (const mode of ['unknown', 'unifiedAccount']) {
  test(`F2 ${mode} does not expose an unavailable or negative withdrawal balance`, async ({ page, hl }) => {
    hl.accountMode = mode;
    hl.spotTotal = '40'; hl.spotHold = '50';
    await openFunding(page, 'Withdraw', mode === 'unknown' ? 'N/A' : '$0');
    await amount(page).fill('10');
    await expect(submit(page)).toBeDisabled();
    expect(hl.withdrawals).toHaveLength(0);
  });
}

test('F2 standard withdrawal excludes HIP-3 margin and spot USDC', async ({ page, hl }) => {
  hl.coin = 'xyz:ETH';
  hl.accountValue = '2000';
  hl.spotTotal = '3000';
  hl.spotBalances = [{ coin: 'USDC', token: 0, total: '3000', hold: '0', entryNtl: '0' }];
  await openFunding(page, 'Withdraw', '$0');
  await page.locator('.preset-row').getByText('Max', { exact: true }).click();
  await expect(amount(page)).toHaveValue('0');
  await expect(submit(page)).toBeDisabled();
  expect(hl.infoRequests.some((request) => request.type === 'clearinghouseState' && request.dex === 'xyz')).toBe(true);
  expect(hl.withdrawals).toHaveLength(0);
});

test('F3 deposit floors percentages and preserves a large MAX in authorization and calldata', async ({ page, hl }) => {
  hl.funding.tokenBalance = parseUnits('10000000000.123457', 6);
  await openFunding(page, 'Deposit', '10,000,000,000.12');
  await amount(page).fill('10.1234567');
  await expect(amount(page)).toHaveValue('10.123456');
  await page.locator('.preset-row').getByText('25%', { exact: true }).click();
  await expect(amount(page)).toHaveValue('2500000000.030864');
  await page.locator('.preset-row').getByText('50%', { exact: true }).click();
  await expect(amount(page)).toHaveValue('5000000000.061728');
  await page.locator('.preset-row').getByText('Max', { exact: true }).click();
  await expect(amount(page)).toHaveValue('10000000000.123457');
  await submit(page).click();
  await expect(confirm(page)).toBeEnabled();
  await confirm(page).click();
  await expect(amount(page)).toHaveValue('');
  expect(hl.funding.broadcasts).toHaveLength(1);
  const tx = Transaction.from(hl.funding.broadcasts[0]);
  const [authorization, burn] = depositAbi.decodeFunctionData('batchDepositForBurnWithAuth', tx.data);
  expect(authorization.amount).toBe(10000000000123457n);
  expect(burn.amount).toBe(authorization.amount);
  expect(burn.maxFee).toBe(1400000200018n);
});

test('F3 withdrawal keeps six decimal units beyond Number safe integer precision', async ({ page, hl }) => {
  hl.accountValue = '10000000000.123457';
  await openFunding(page, 'Withdraw', '$10,000,000,000.12');
  await page.locator('.preset-row').getByText('25%', { exact: true }).click();
  await expect(amount(page)).toHaveValue('2500000000.030864');
  await page.locator('.preset-row').getByText('50%', { exact: true }).click();
  await expect(amount(page)).toHaveValue('5000000000.061728');
  await page.locator('.preset-row').getByText('Max', { exact: true }).click();
  await submit(page).click();
  await expect(confirm(page)).toBeEnabled();
  await confirm(page).click();
  await expect(amount(page)).toHaveValue('');
  expect(hl.withdrawals).toHaveLength(1);
  expect(hl.withdrawals[0].action.amount).toBe('10000000000.123457');
});

for (const invalid of ['missing fast', 'unreadable forward fee']) {
  test(`F4 deposit refuses ${invalid} instead of quoting a free transfer`, async ({ page, hl }) => {
    hl.funding.circleFees = invalid === 'missing fast'
      ? [{ finalityThreshold: 2000, minimumFee: 0, forwardFee: { high: 0 } }]
      : [{ finalityThreshold: 1000, minimumFee: 1.4, forwardFee: { high: 'invalid' } }];
    await openFunding(page, 'Deposit', '500.12');
    await amount(page).fill('10');
    await submit(page).click();
    await expectToast(page, invalid === 'missing fast' ? 'did not quote the fast transfer' : 'unreadable fee');
    await expect(sheet(page)).toHaveCount(0);
    expect(hl.funding.broadcasts).toHaveLength(0);
    expect(hl.funding.rpcRequests.some((request) => request.method === 'eth_estimateGas')).toBe(false);
  });
}

test('F4 known gap: deposit fee exceeding the amount should disable confirmation', async ({ page, hl }) => {
  hl.funding.circleFees[0].forwardFee.high = 20000000;
  await openFunding(page, 'Deposit', '500.12');
  await amount(page).fill('10');
  await submit(page).click();
  await expect(confirmRow(page, 'Transaction fee')).toContainText('$20');
  await expect(confirmRow(page, 'You receive')).toHaveText('$0');
  expect(hl.funding.broadcasts).toHaveLength(0);
  test.fail(true, 'README 7.4: the current gate permits a deposit entirely consumed by its quote');
  await expect(confirm(page)).toBeDisabled({ timeout: 500 });
});

for (const short of [false, true]) {
  test(`F6 ETH gas balance ${short ? 'one wei below' : 'exactly at'} the estimate`, async ({ page, hl }) => {
    hl.funding.nativeBalance = 360000000000000n - (short ? 1n : 0n);
    await openFunding(page, 'Deposit', '500.12');
    await amount(page).fill('10');
    await submit(page).click();
    if (short) {
      await expect(sheet(page)).toHaveCount(0);
      await expect(page.locator('.error-tip')).toContainText('Not enough ETH on Arbitrum Sepolia');
      await expect(submit(page)).toBeDisabled();
    } else {
      await expect(confirm(page)).toBeEnabled();
      await expect(confirmRow(page, 'Network fee')).toHaveText('0.000360 ETH');
    }
    expect(hl.funding.broadcasts).toHaveLength(0);
  });
}

test('F6 unavailable ETH balance is not treated as zero', async ({ page, hl }) => {
  hl.funding.nativeBalanceUnavailable = true;
  await openFunding(page, 'Deposit', '500.12');
  await amount(page).fill('10');
  await submit(page).click();
  await expect(confirm(page)).toBeEnabled();
  await expect(confirmRow(page, 'Network fee')).toHaveText('0.000360 ETH');
  await expect(sheet(page).locator('.error-tip')).toHaveCount(0);
  expect(hl.funding.rpcRequests.some((request) => request.method === 'eth_getBalance')).toBe(true);
  expect(hl.funding.broadcasts).toHaveLength(0);
});

test('F6 boundary: sending re-estimates gas without another ETH fee confirmation', async ({ page, hl }) => {
  await openFunding(page, 'Deposit', '500.12');
  await amount(page).fill('10');
  await submit(page).click();
  await expect(confirm(page)).toBeEnabled();
  await expect(confirmRow(page, 'Network fee')).toHaveText('0.000360 ETH');
  hl.funding.gasEstimate = 200000n;
  await confirm(page).click();
  await expect(amount(page)).toHaveValue('');
  await expect(sheet(page)).toHaveCount(0);
  expect(hl.funding.broadcasts).toHaveLength(1);
  const tx = Transaction.from(hl.funding.broadcasts[0]);
  expect(tx.gasLimit).toBe(240000n);
  expect(tx.gasLimit * tx.maxFeePerGas!).toBe(720000000000000n);
});

for (const direction of ['Deposit', 'Withdraw'] as const) {
  test(`F7 ${direction} preserves a manual amount when refreshed balance shrinks`, async ({ page, hl }) => {
    await openFunding(page, direction, direction === 'Deposit' ? '500.12' : '$1,000');
    await amount(page).fill('400');
    await submit(page).click();
    await expect(confirm(page)).toBeEnabled();
    hl.funding.tokenBalance = parseUnits('300.000001', 6);
    hl.accountValue = '300.000001';
    await confirm(page).click();
    await expect(sheet(page)).toHaveCount(0);
    await expect(amount(page)).toHaveValue('400');
    await expect(page.locator('.error-tip')).toContainText('Your balance changed');
    await expect(submit(page)).toBeDisabled();
    expect(hl.withdrawals).toHaveLength(0);
    expect(hl.funding.broadcasts).toHaveLength(0);
  });

  test(`F7 ${direction} stops if the pre-submit balance refresh fails`, async ({ page, hl }) => {
    await openFunding(page, direction, direction === 'Deposit' ? '500.12' : '$1,000');
    await amount(page).fill('10');
    await submit(page).click();
    await expect(confirm(page)).toBeEnabled();
    if (direction === 'Deposit') { hl.funding.tokenBalanceUnavailable = true; }
    else { hl.accountReadFailureStatus = 429; }
    await confirm(page).click();
    await expect(sheet(page)).toHaveCount(0);
    await expect(page.locator('.balance-tip')).toContainText('N/A');
    await expect(amount(page)).toHaveValue('10');
    await expect(submit(page)).toBeDisabled();
    expect(hl.withdrawals).toHaveLength(0);
    expect(hl.funding.broadcasts).toHaveLength(0);
  });
}

test('F7 deposit MAX shrinks and requires confirmation of the new amount', async ({ page, hl }) => {
  await openFunding(page, 'Deposit', '500.12');
  await page.locator('.preset-row').getByText('Max', { exact: true }).click();
  await submit(page).click();
  await expect(confirm(page)).toBeEnabled();
  hl.funding.tokenBalance = parseUnits('300.000001', 6);
  await confirm(page).click();
  await expect(amount(page)).toHaveValue('300.000001');
  await expect(sheet(page)).toHaveCount(0);
  await expect(page.locator('.error-tip')).toContainText('Your balance changed');
  expect(hl.funding.broadcasts).toHaveLength(0);
});

for (const change of ['increase', 'decrease', 'unchanged']) {
  test(`F8 deposit fee ${change} uses the fresh maxFee and the original authorization`, async ({ page, hl }) => {
    hl.funding.accountExists = false;
    await openFunding(page, 'Deposit', '500.12');
    await amount(page).fill('10');
    await submit(page).click();
    await expect(confirm(page)).toBeEnabled();
    const firstEstimate = hl.funding.rpcRequests.find((request) => request.method === 'eth_estimateGas')!;
    const [original] = depositAbi.decodeFunctionData('batchDepositForBurnWithAuth', firstEstimate.params[0].data);
    hl.funding.circleFees[0].forwardFee.high = change === 'increase' ? 400000 : change === 'decrease' ? 100000 : 200000;
    await confirm(page).click();
    if (change === 'increase') {
      await expectToast(page, 'The fee quote changed. Review it again');
      await expect(confirm(page)).toBeEnabled();
      await expect(confirmRow(page, 'Transaction fee')).toHaveText('$1.40 USDC');
      expect(hl.funding.broadcasts).toHaveLength(0);
      await confirm(page).click();
    }
    await expect(amount(page)).toHaveValue('');
    expect(hl.funding.broadcasts).toHaveLength(1);
    const [authorization, burn] = depositAbi.decodeFunctionData(
      'batchDepositForBurnWithAuth', Transaction.from(hl.funding.broadcasts[0]).data
    );
    expect(authorization.authNonce).toBe(original.authNonce);
    expect(authorization.r).toBe(original.r);
    expect(authorization.amount).toBe(10000000n);
    expect(burn.maxFee).toBe(change === 'increase' ? 401400n : change === 'decrease' ? 101400n : 201400n);
  });
}

test('F8 withdrawal fee decrease sends without a second confirmation', async ({ page, hl }) => {
  await openFunding(page, 'Withdraw', '$1,000');
  await amount(page).fill('10');
  await submit(page).click();
  await expect(confirm(page)).toBeEnabled();
  hl.funding.withdrawFee = '0.1';
  await confirm(page).click();
  await expectToast(page, 'Withdrawal initiated');
  await expect(amount(page)).toHaveValue('');
  await expect(sheet(page)).toHaveCount(0);
  expect(hl.withdrawals).toHaveLength(1);
});
