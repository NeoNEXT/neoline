import { Transaction, parseUnits } from 'ethers';
import { test, expect } from './fixtures';
import { depositAbi, fundingContracts } from './funding.fake';
import { amount, fundingRow, expectToast, openFunding, sheet, submit, confirmDeposit } from './funding.ui';

test('deposit previews fees and receipt on input and presets without signing or sending', async ({ page, hl }) => {
  hl.funding.tokenBalance = parseUnits('5.461728', 6);
  await openFunding(page, 'Deposit', '5.46');
  await amount(page).fill('5');
  await expect(fundingRow(page, 'Service fee')).toContainText('$0.20');
  await expect(fundingRow(page, 'You receive')).toContainText('$4.80');
  await expect(page.locator('.detail-rows tooltip')).toHaveCount(0);
  await page.locator('.preset-row').getByText('Max', { exact: true }).click();
  await expect(amount(page)).toHaveValue('5.461728');
  await expect(fundingRow(page, 'You receive')).toContainText('$5.26');
  await page.locator('.preset-row').getByText('50%', { exact: true }).click();
  await expect(fundingRow(page, 'You receive')).toContainText('$2.53');
  expect(hl.funding.broadcasts).toHaveLength(0);
  expect(hl.funding.rpcRequests.some((request) => request.method === 'eth_estimateGas')).toBe(false);
  expect(hl.funding.rpcRequests.some((request) => request.method === 'eth_call' &&
    request.params[0].to.toLowerCase() === '0x0000000000000000000000000000000000000810')).toBe(false);
});

for (const bps of [0, 1.4]) {
  test(`deposit reuses ${bps} bps rates without unknown values or input requests`, async ({ page, hl }) => {
    hl.funding.circleFees[0].minimumFee = bps;
    await openFunding(page, 'Deposit', '500.12');
    await expect(fundingRow(page, 'Service fee')).toHaveText('$0.20');
    await amount(page).fill('10');
    await expect(fundingRow(page, 'You receive')).toHaveText('$9.80');
    const requests = hl.funding.feeRequests.length;
    await amount(page).fill('100');
    await expect(fundingRow(page, 'Service fee')).toHaveText(bps === 0 ? '$0.20' : '$0.21');
    await expect(fundingRow(page, 'You receive')).toHaveText(bps === 0 ? '$99.80' : '$99.79');
    await page.locator('.preset-row').getByText('Max', { exact: true }).click();
    await expect(fundingRow(page, 'Service fee')).toHaveText(bps === 0 ? '$0.20' : '$0.27');
    await expect(fundingRow(page, 'You receive')).toHaveText(bps === 0 ? '$499.92' : '$499.85');
    await page.locator('.funding-tabs').getByText('Withdraw', { exact: true }).click();
    await expect(fundingRow(page, 'Service fee')).toHaveText('$0.20');
    await page.locator('.funding-tabs').getByText('Deposit', { exact: true }).click();
    await expect(fundingRow(page, 'Service fee')).toHaveText('$0.20');
    expect(hl.funding.feeRequests).toHaveLength(requests);
    expect(hl.funding.rpcRequests.filter((item) => item.method === 'eth_call' &&
      item.params[0].to.toLowerCase() === fundingContracts.coreWallet.toLowerCase())).toHaveLength(1);
    expect(hl.funding.broadcasts).toHaveLength(0);
  });
}

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
  await confirmDeposit(page);
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
    await expect(submit(page)).toBeDisabled();
    await expect(page.locator('.error-tip')).toContainText('Could not read the current fee');
    await expect(sheet(page)).toHaveCount(0);
    expect(hl.funding.broadcasts).toHaveLength(0);
    expect(hl.funding.rpcRequests.some((request) => request.method === 'eth_estimateGas')).toBe(false);
  });
}

test('F4 known gap: deposit fee exceeding the amount should prevent broadcasting', async ({ page, hl }) => {
  hl.funding.circleFees[0].forwardFee.high = 20000000;
  await openFunding(page, 'Deposit', '500.12');
  await amount(page).fill('10');
  await submit(page).click();
  await confirmDeposit(page);
  await expect(amount(page)).toHaveValue('');
  await expect.poll(() => hl.funding.broadcasts.length).toBe(1);
  test.fail(true, 'README 7.4: the current gate permits a deposit entirely consumed by its quote');
  expect(hl.funding.broadcasts).toHaveLength(0);
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
      expect(hl.funding.broadcasts).toHaveLength(0);
    } else {
      await confirmDeposit(page);
      await expect(amount(page)).toHaveValue('');
      expect(hl.funding.broadcasts).toHaveLength(1);
      const tx = Transaction.from(hl.funding.broadcasts[0]);
      expect(tx.gasLimit * tx.maxFeePerGas!).toBe(360000000000000n);
    }
  });
}

test('F6 unavailable ETH balance stops before signing', async ({ page, hl }) => {
  hl.funding.nativeBalanceUnavailable = true;
  await openFunding(page, 'Deposit', '500.12');
  await amount(page).fill('10');
  await submit(page).click();
  await expect(amount(page)).toHaveValue('10');
  await expect(sheet(page)).toHaveCount(0);
  expect(hl.funding.rpcRequests.some((request) => request.method === 'eth_getBalance')).toBe(true);
  expect(hl.funding.broadcasts).toHaveLength(0);
  expect(hl.funding.rpcRequests.some(request => request.method === 'eth_estimateGas')).toBe(false);
});

test('F6 confirmation refreshes the fee every 30 seconds and sending estimates gas again', async ({ page, hl }) => {
  await openFunding(page, 'Deposit', '500.12');
  await amount(page).fill('10');
  hl.funding.gasEstimate = 200000n;
  await submit(page).click();
  await expect(sheet(page)).toBeVisible();
  await expect(sheet(page).locator('.row').filter({ hasText: 'Network fee' })).toContainText(/0\.000720* ETH/);
  hl.funding.gasEstimate = 300000n;
  const gas = hl.funding.holdNextGasEstimate();
  try {
    await gas.received;
    await expect(sheet(page).locator('.primary')).toBeDisabled();
    expect(hl.funding.broadcasts).toHaveLength(0);
  } finally { gas.release(); }
  await expect(sheet(page).locator('.row').filter({ hasText: 'Network fee' })).toContainText(/0\.001080* ETH/);
  hl.funding.gasEstimate = 400000n;
  await confirmDeposit(page);
  await expect(amount(page)).toHaveValue('');
  await expect(sheet(page)).toHaveCount(0);
  expect(hl.funding.broadcasts).toHaveLength(1);
  const tx = Transaction.from(hl.funding.broadcasts[0]);
  const estimates = hl.funding.rpcRequests.filter(request => request.method === 'eth_estimateGas');
  expect(estimates).toHaveLength(3);
  expect(estimates[1].params[0].data).toBe(estimates[0].params[0].data);
  expect(estimates[2].params[0].data).toBe(tx.data);
  const [previewAuthorization] = depositAbi.decodeFunctionData('batchDepositForBurnWithAuth', estimates[0].params[0].data);
  const [sentAuthorization] = depositAbi.decodeFunctionData('batchDepositForBurnWithAuth', tx.data);
  expect(sentAuthorization.authNonce).not.toBe(previewAuthorization.authNonce);
  expect(sentAuthorization.authValidBefore).toBeGreaterThan(previewAuthorization.authValidBefore);
  expect(tx.gasLimit).toBe(480000n);
  expect(tx.gasLimit * tx.maxFeePerGas!).toBe(1440000000000000n);
});

for (const direction of ['Deposit', 'Withdraw'] as const) {
  test(`F7 ${direction} preserves a manual amount when refreshed balance shrinks`, async ({ page, hl }) => {
    await openFunding(page, direction, direction === 'Deposit' ? '500.12' : '$1,000');
    await amount(page).fill('400');
    hl.funding.tokenBalance = parseUnits('300.000001', 6);
    hl.accountValue = '300.000001';
    await submit(page).click();
    await expect(page.locator('.error-tip')).toContainText('Your balance changed');
    await expect(sheet(page)).toHaveCount(0);
    await expect(amount(page)).toHaveValue('400');
    await expect(submit(page)).toBeDisabled();
    expect(hl.withdrawals).toHaveLength(0);
    expect(hl.funding.broadcasts).toHaveLength(0);
  });

  test(`F7 ${direction} stops if the pre-submit balance refresh fails`, async ({ page, hl }) => {
    await openFunding(page, direction, direction === 'Deposit' ? '500.12' : '$1,000');
    await amount(page).fill('10');
    if (direction === 'Deposit') { hl.funding.tokenBalanceUnavailable = true; }
    else { hl.accountReadFailureStatus = 429; }
    await submit(page).click();
    await expect(page.locator('.balance-tip')).toContainText('N/A');
    await expect(sheet(page)).toHaveCount(0);
    await expect(amount(page)).toHaveValue('10');
    await expect(submit(page)).toBeDisabled();
    expect(hl.withdrawals).toHaveLength(0);
    expect(hl.funding.broadcasts).toHaveLength(0);
  });
}

test('F7 deposit MAX shrinks and stops for another press with the new amount', async ({ page, hl }) => {
  await openFunding(page, 'Deposit', '500.12');
  await page.locator('.preset-row').getByText('Max', { exact: true }).click();
  hl.funding.tokenBalance = parseUnits('300.000001', 6);
  await submit(page).click();
  await expect(amount(page)).toHaveValue('300.000001');
  await expect(sheet(page)).toHaveCount(0);
  await expect(page.locator('.error-tip')).toContainText('Your balance changed');
  expect(hl.funding.broadcasts).toHaveLength(0);
});

test('deposit uses the entry rate for gas estimation and sending without another fee request', async ({ page, hl }) => {
  await openFunding(page, 'Deposit', '500.12');
  await amount(page).fill('10');
  await expect(fundingRow(page, 'Service fee')).toHaveText('$0.20');
  hl.funding.circleFees[0].forwardFee.high = 400000;
  await submit(page).click();
  await confirmDeposit(page);
  await expect(amount(page)).toHaveValue('');
  expect(hl.funding.feeRequests).toHaveLength(1);
  expect(hl.funding.broadcasts).toHaveLength(1);
  const [, burn] = depositAbi.decodeFunctionData(
    'batchDepositForBurnWithAuth', Transaction.from(hl.funding.broadcasts[0]).data
  );
  expect(burn.maxFee).toBe(201400n);
});

test('withdrawal uses its loaded fee after a tab switch without another request', async ({ page, hl }) => {
  await openFunding(page, 'Withdraw', '$1,000');
  await amount(page).fill('10');
  hl.funding.withdrawFee = '0.1';
  await submit(page).click();
  await expectToast(page, 'Withdrawal initiated');
  await expect(amount(page)).toHaveValue('');
  await expect(sheet(page)).toHaveCount(0);
  expect(hl.withdrawals).toHaveLength(1);
});
