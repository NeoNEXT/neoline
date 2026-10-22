import { Transaction, keccak256 } from 'ethers';
import { test, expect } from './fixtures';
import { depositAbi, responseGate } from './funding.fake';
import { recoverWithdrawalSigner } from './hyperliquid.fake';
import { amount, fundingRow, expectToast, openFunding, sheet, submit, confirmDeposit } from './funding.ui';

for (const failure of ['rotate-known', 'lost-then-nonce'] as const) {
  test(`F9 accepted deposit with ${failure} only rebroadcasts the original bytes`, async ({ page, hl }) => {
    hl.funding.broadcastFailure = failure;
    await openFunding(page, 'Deposit', '500.12');
    await amount(page).fill('10');
    await submit(page).click();
    await confirmDeposit(page);
    await expect(page.locator('simple-snack-bar')).toContainText(failure === 'rotate-known'
      ? 'Deposit initiated' : 'broadcast result is unknown');
    await expect(page.locator('.balance-tip')).toContainText('490.12');
    await expect(amount(page)).toHaveValue('');
    expect(hl.funding.broadcasts).toHaveLength(failure === 'rotate-known' ? 6 : 2);
    expect(new Set(hl.funding.broadcasts).size).toBe(1);
    const raw = hl.funding.broadcasts[0];
    expect(Transaction.from(raw).nonce).toBe(0);
    const sends = hl.funding.rpcRequests.filter((request) => request.method === 'eth_sendRawTransaction');
    expect(new Set(sends.map((request) => request.url)).size).toBe(failure === 'rotate-known' ? 2 : 1);
    await expect.poll(() => hl.funding.rpcRequests.filter((request) => request.method === 'eth_getTransactionReceipt').length)
      .toBeGreaterThan(0);
    const receipts = hl.funding.rpcRequests.filter((request) => request.method === 'eth_getTransactionReceipt');
    expect(receipts.every((request) => request.params[0] === keccak256(raw))).toBe(true);
    expect(hl.withdrawals).toHaveLength(0);
  });
}

test('F7 known gap: failed refresh with a stale retained account should not withdraw', async ({ page, hl }) => {
  await openFunding(page, 'Withdraw', '$1,000');
  await amount(page).fill('10');
  hl.accountReadFailureStatus = 429;
  await page.evaluate(() => {
    const sockets = (window as any).__perpsSocket;
    sockets.autoOpen = false;
    sockets.sockets.forEach((socket: any) => socket.close());
  });
  await expect(page.locator('.stale-note')).toBeVisible();
  await expect(page.locator('.balance-tip')).toContainText('$1,000');
  await submit(page).click();
  await expectToast(page, 'Withdrawal initiated');
  await expect(amount(page)).toHaveValue('');
  test.fail(true, 'README F7/7.4: refreshAccount retains a stale account after the read failed');
  expect(hl.withdrawals).toHaveLength(0);
});

test('F8 leaving during deposit preparation cannot send the abandoned amount', async ({ page, hl }) => {
  await openFunding(page, 'Deposit', '500.12');
  await amount(page).fill('10');
  await expect(fundingRow(page, 'Service fee')).toContainText('$0.20');
  const old = hl.funding.holdNextGasEstimate();
  try {
    await submit(page).click();
    await old.received;
    await expect(amount(page)).toBeDisabled();
    await page.goBack();
    hl.funding.circleFees[0].forwardFee.high = 400000;
    await openFunding(page, 'Deposit', '500.12');
    await amount(page).fill('20');
    await submit(page).click();
    await confirmDeposit(page);
    await expect(amount(page)).toHaveValue('');
    old.release();
    await old.completed;
    expect(hl.funding.broadcasts).toHaveLength(1);
    const estimates = hl.funding.rpcRequests.filter((request) => request.method === 'eth_estimateGas');
    expect(estimates.length).toBeGreaterThanOrEqual(2);
    for (const request of estimates.slice(1)) {
      const [authorization] = depositAbi.decodeFunctionData('batchDepositForBurnWithAuth', request.params[0].data);
      expect(authorization.amount).toBe(20000000n);
    }
    const [authorization] = depositAbi.decodeFunctionData('batchDepositForBurnWithAuth', Transaction.from(hl.funding.broadcasts[0]).data);
    expect(authorization.amount).toBe(20000000n);
    await expect(sheet(page)).toHaveCount(0);
  } finally { old.release(); }
});

for (const malformed of [false, true]) {
  test(`F13 abandoned page fee ${malformed ? 'failure' : 'quote'} cannot affect a later operation`, async ({ page, hl }) => {
    const old = hl.funding.holdNextWithdrawQuote(malformed);
    try {
      await openFunding(page, 'Withdraw', '$1,000');
      await old.received;
      await page.locator('.funding-header .back').click();
      hl.funding.withdrawFee = '0.4';
      await openFunding(page, 'Withdraw', '$1,000');
      await amount(page).fill('20');
      await submit(page).click();
      await expect(amount(page)).toHaveValue('');
      old.release();
      await old.completed;
      await expect(fundingRow(page, 'Service fee')).toContainText('$0.4');
      await expect(page.locator('.balance-tip')).toContainText('$980');
      expect(hl.withdrawals).toHaveLength(1);
      expect(hl.withdrawals[0].action.amount).toBe('20');
      await expect(sheet(page)).toHaveCount(0);
    } finally { old.release(); }
  });
}

test('F10 reloading a pending deposit does not restore persistent transaction tracking', async ({ page, hl }) => {
  hl.funding.receiptStatus = null;
  await openFunding(page, 'Deposit', '500.12');
  await amount(page).fill('10');
  await submit(page).click();
  await confirmDeposit(page);
  await expectToast(page, 'Deposit initiated');
  await expect.poll(() => hl.funding.rpcRequests.filter((request) => request.method === 'eth_getTransactionReceipt').length).toBe(1);
  await page.reload();
  await expect(page.locator('.balance-tip')).toContainText('500.12');
  await expect(amount(page)).toHaveValue('');
  await expect(sheet(page)).toHaveCount(0);
  expect(hl.funding.rpcRequests.filter((request) => request.method === 'eth_getTransactionReceipt')).toHaveLength(1);
  expect(hl.funding.broadcasts).toHaveLength(1);
  expect(hl.accountValue).toBe('1000');
});

test('F12 pending withdrawal response locks input and presets without another write', async ({ page, hl }) => {
  const pending = responseGate(); hl.withdrawResponseGate = pending.promise;
  try {
    await openFunding(page, 'Withdraw', '$1,000');
    await amount(page).fill('10');
    await submit(page).click();
    await expect.poll(() => hl.withdrawals.length).toBe(1);
    await expect(amount(page)).toBeDisabled();
    await expect(submit(page)).toBeDisabled();
    await page.locator('.preset-row').getByText('Max', { exact: true }).click();
    await expect(amount(page)).toHaveValue('10');
    expect(hl.withdrawals).toHaveLength(1);
    pending.release();
    await expectToast(page, 'Withdrawal initiated');
    await expect(amount(page)).toHaveValue('');
    expect(hl.withdrawals).toHaveLength(1);
  } finally { pending.release(); }
});

test('F9 disconnected broadcast batches track the original hash without signing again', async ({ page, hl }) => {
  hl.funding.broadcastFailure = 'disconnect';
  await openFunding(page, 'Deposit', '500.12');
  await amount(page).fill('10');
  await submit(page).click();
  await confirmDeposit(page);
  await expect(page.locator('simple-snack-bar')).toContainText('broadcast result is unknown', { timeout: 20000 });
  await expect(amount(page)).toHaveValue('');
  expect(new Set(hl.funding.broadcasts).size).toBe(1);
  await expect.poll(() => hl.funding.rpcRequests.filter((request) => request.method === 'eth_getTransactionReceipt').length,
    { timeout: 10000 }).toBeGreaterThan(0);
  await expect(page.locator('.balance-tip')).toContainText('490.12');
  expect(hl.funding.broadcasts).toHaveLength(10);
  const hash = keccak256(hl.funding.broadcasts[0]);
  expect(hl.funding.rpcRequests.filter((request) => request.method === 'eth_getTransactionReceipt')
    .every((request) => request.params[0] === hash)).toBe(true);
});

for (const refusals of [['nonce'], ['nonce', 'nonce'], ['balance']] as const) {
  test(`F12 explicit withdrawal rejection ${refusals.join('/')} has bounded signing attempts`, async ({ page, wallet, hl }) => {
    hl.withdrawFailures = [...refusals];
    await openFunding(page, 'Withdraw', '$1,000');
    await amount(page).fill('10');
    await submit(page).click();
    const succeeds = refusals.length === 1 && refusals[0] === 'nonce';
    await expectToast(page, succeeds ? 'Withdrawal initiated' : refusals[0] === 'nonce' ? 'Invalid nonce' : 'Insufficient balance');
    await expect(amount(page)).toHaveValue(succeeds ? '' : '10');
    expect(hl.withdrawals).toHaveLength(refusals[0] === 'nonce' ? 2 : 1);
    for (const request of hl.withdrawals) {
      expect(recoverWithdrawalSigner(request).toLowerCase()).toBe(wallet.address);
      expect(request.action).toMatchObject({ amount: '10', sourceDex: '', destinationRecipient: wallet.address });
    }
    if (refusals[0] === 'nonce') {
      expect(hl.withdrawals[1].nonce).toBeGreaterThan(hl.withdrawals[0].nonce);
      expect(hl.withdrawals[1].signature).not.toEqual(hl.withdrawals[0].signature);
    }
    expect(hl.accountValue).toBe(succeeds ? '990' : '1000');
    expect(hl.funding.broadcasts).toHaveLength(0);
  });
}

for (const failure of ['503', 'malformed'] as const) {
  test(`F12 accepted withdrawal with ${failure} stays unknown and does not automatically resend`, async ({ page, hl }) => {
    hl.withdrawFailures = [failure];
    await openFunding(page, 'Withdraw', '$1,000');
    await amount(page).fill('10');
    await submit(page).click();
    await expectToast(page, 'unknown whether this withdrawal ran');
    await expect(page.locator('.balance-tip')).toContainText('$990');
    await expect(amount(page)).toHaveValue('10');
    expect(hl.withdrawals).toHaveLength(1);
    expect(hl.funding.broadcasts).toHaveLength(0);
    await expect(submit(page)).toBeEnabled();
    expect(hl.withdrawals).toHaveLength(1);
    await expect(sheet(page)).toHaveCount(0);
  });
}
