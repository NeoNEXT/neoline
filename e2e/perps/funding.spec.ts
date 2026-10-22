import { Transaction, keccak256, verifyTypedData, zeroPadValue } from 'ethers';
import { test, expect } from './fixtures';
import { enterPerps } from './wallet';
import { depositAbi, fundingContracts } from './funding.fake';
import { recoverWithdrawalSigner } from './hyperliquid.fake';

import { openFunding, amount, submit, sheet, fundingRow, expectToast, confirmDeposit } from './funding.ui';

test('deposit estimates after authorization and waits for confirmation before signing the CCTP transaction', async ({ page, wallet, hl }) => {
  await openFunding(page, 'Deposit', '500.12');
  await amount(page).fill('4.999999');
  await expect(submit(page)).toBeDisabled();
  await expect(page.locator('.error-tip')).toContainText('minimum deposit amount of 5');
  await amount(page).fill('501');
  await expect(submit(page)).toBeDisabled();
  await expect(page.locator('.error-tip')).toHaveText('Amount exceeds your balance');
  await page.locator('.preset-row').getByText('Max', { exact: true }).click();
  await expect(amount(page)).toHaveValue('500.123456');
  await amount(page).fill('10.1234567');
  await expect(amount(page)).toHaveValue('10.123456');
  await amount(page).fill('10');
  const gas = hl.funding.holdNextGasEstimate();
  try {
    await submit(page).click({ clickCount: 2 });
    await gas.received;
    await expect(sheet(page)).toHaveCount(0);
    await expect(submit(page)).toBeDisabled();
    await expect(submit(page)).toHaveAttribute('aria-busy', 'true');
    await expect(page.locator('.asset-row')).toContainText('Arbitrum Sepolia');
    await expect(fundingRow(page, 'Service fee')).toContainText('$0.20');
    await expect(fundingRow(page, 'You receive')).toContainText('$9.80');
    await expect(amount(page)).toBeDisabled();
    expect(hl.funding.broadcasts).toHaveLength(0);
  } finally { gas.release(); }
  await expect(sheet(page)).toBeVisible();
  await expect(sheet(page).locator('.row').filter({ hasText: 'Network fee' })).toContainText(/0\.000360* ETH/);
  expect(hl.funding.broadcasts).toHaveLength(0);
  await expect(sheet(page).locator('.primary')).toBeEnabled();
  await confirmDeposit(page);
  await expectToast(page, 'Deposit initiated. Waiting for USDC');
  await expect(amount(page)).toHaveValue('');
  await expect(page.locator('.balance-tip')).toContainText('490.12');
  expect(hl.funding.broadcasts).toHaveLength(1);
  expect(hl.funding.feeRequests).toHaveLength(1);
  const raw = hl.funding.broadcasts[0];
  const tx = Transaction.from(raw);
  expect(tx.from?.toLowerCase()).toBe(wallet.address);
  expect(tx.chainId).toBe(421614n);
  expect(tx.to?.toLowerCase()).toBe(fundingContracts.extension.toLowerCase());
  expect(tx.value).toBe(0n);
  expect(tx.gasLimit).toBe(120000n);
  const [authorization, burn] = depositAbi.decodeFunctionData('batchDepositForBurnWithAuth', tx.data);
  expect(authorization.amount).toBe(10000000n);
  expect(authorization.authValidAfter).toBe(0n);
  expect(Number(authorization.authValidBefore)).toBeGreaterThan(Date.now() / 1000);
  expect(Number(authorization.authValidBefore)).toBeLessThan(Date.now() / 1000 + 1801);
  const signer = verifyTypedData(
    { name: 'USD Coin', version: '2', chainId: 421614, verifyingContract: fundingContracts.usdc },
    { ReceiveWithAuthorization: [
      { name: 'from', type: 'address' }, { name: 'to', type: 'address' },
      { name: 'value', type: 'uint256' }, { name: 'validAfter', type: 'uint256' },
      { name: 'validBefore', type: 'uint256' }, { name: 'nonce', type: 'bytes32' },
    ] },
    { from: wallet.address, to: fundingContracts.extension, value: authorization.amount,
      validAfter: authorization.authValidAfter, validBefore: authorization.authValidBefore, nonce: authorization.authNonce },
    { v: Number(authorization.v), r: authorization.r, s: authorization.s },
  );
  expect(signer.toLowerCase()).toBe(wallet.address);
  expect(burn.amount).toBe(10000000n);
  expect(burn.destinationDomain).toBe(19n);
  expect(burn.mintRecipient).toBe(zeroPadValue(fundingContracts.forwarder, 32).toLowerCase());
  expect(burn.destinationCaller).toBe(burn.mintRecipient);
  expect(burn.maxFee).toBe(201400n);
  expect(burn.minFinalityThreshold).toBe(1000n);
  expect(burn.hookData).toBe(`0x${Buffer.from('cctp-forward').toString('hex').padEnd(48, '0')}0000000000000018${wallet.address.slice(2)}00000000`);
  const receipts = hl.funding.rpcRequests.filter((item) => item.method === 'eth_getTransactionReceipt');
  expect(receipts.length).toBeGreaterThan(0);
  expect(receipts.every((item) => item.params[0] === keccak256(raw))).toBe(true);
  // Source confirmation must not be shown as HyperCore credit.
  await page.locator('.funding-header .back').click();
  await expect(page.locator('.account-card .card-value')).toHaveText('$1,000');
});

test('deposit refuses submission when Arbitrum ETH cannot cover gas', async ({ page, hl }) => {
  hl.funding.nativeBalance = 0n;
  await openFunding(page, 'Deposit', '500.12');
  await amount(page).fill('10');
  await submit(page).click();
  await expect(page.locator('.error-tip')).toContainText('Not enough ETH on Arbitrum Sepolia');
  await expect(sheet(page)).toHaveCount(0);
  await expect(submit(page)).toBeDisabled();
  expect(hl.funding.broadcasts).toHaveLength(0);
});

test('reverted deposit reports the source-chain failure without claiming a credit', async ({ page, hl }) => {
  hl.funding.receiptStatus = 0;
  await openFunding(page, 'Deposit', '500.12');
  await amount(page).fill('10');
  await submit(page).click();
  await confirmDeposit(page);
  await expectToast(page, 'The deposit failed on chain. Nothing was transferred');
  await expect(page.locator('.balance-tip')).toContainText('500.12');
  await expect(amount(page)).toHaveValue('');
  expect(hl.funding.broadcasts).toHaveLength(1);
  await page.locator('.funding-header .back').click();
  await expect(page.locator('.account-card .card-value')).toHaveText('$1,000');
});

test('withdrawal reuses the page fee and directly signs one action', async ({ page, wallet, hl }) => {
  await openFunding(page, 'Withdraw', '$1,000');
  await amount(page).fill('0.3');
  await expect(submit(page)).toBeDisabled();
  await expect(page.locator('.error-tip')).toContainText('minimum of 0.4');
  await amount(page).fill('10');
  await expect(page.locator('.chain-notice')).toContainText('Withdraw USDC from HyperCore to Arbitrum Sepolia.');
  await expect(fundingRow(page, 'You receive')).toContainText('$9.8');
  hl.funding.withdrawFee = '0.4';
  await submit(page).click({ clickCount: 2 });
  await expectToast(page, 'Withdrawal initiated. Waiting for USDC');
  await expect(amount(page)).toHaveValue('');
  await expect(page.locator('.balance-tip')).toContainText('$990');
  expect(hl.withdrawals).toHaveLength(1);
  expect(hl.funding.rpcRequests.filter((item) => item.method === 'eth_call' &&
    item.params[0].to.toLowerCase() === fundingContracts.coreWallet.toLowerCase())).toHaveLength(1);
  const request = hl.withdrawals[0];
  expect(request.action).toEqual({
    type: 'sendToEvmWithData', signatureChainId: '0x66eee', hyperliquidChain: 'Testnet',
    token: 'USDC', amount: '10', sourceDex: '', destinationRecipient: wallet.address,
    addressEncoding: 'hex', destinationChainId: 3, gasLimit: 200000, data: '0x', nonce: request.nonce,
  });
  expect(recoverWithdrawalSigner(request).toLowerCase()).toBe(wallet.address);
  expect(hl.funding.broadcasts).toHaveLength(0);
});

test('unified withdrawal uses free spot USDC and sends sourceDex spot', async ({ page, wallet, hl }) => {
  hl.accountMode = 'unifiedAccount';
  await enterPerps(page);
  await page.locator('.card-actions').getByRole('button', { name: 'Withdraw', exact: true }).click();
  await expect(page.locator('.balance-tip')).toContainText('$250');
  await page.locator('.preset-row').getByText('Max', { exact: true }).click();
  await expect(amount(page)).toHaveValue('250');
  await submit(page).click();
  await expectToast(page, 'Withdrawal initiated.');
  await expect(page.locator('.balance-tip')).toContainText('$0');
  expect(hl.withdrawals).toHaveLength(1);
  expect(hl.withdrawals[0].action).toMatchObject({ amount: '250', sourceDex: 'spot', destinationRecipient: wallet.address });
  expect(recoverWithdrawalSigner(hl.withdrawals[0]).toLowerCase()).toBe(wallet.address);
});

test('MAX withdrawal stops when refreshed balance falls below the confirmed amount', async ({ page, hl }) => {
  await openFunding(page, 'Withdraw', '$1,000');
  await page.locator('.preset-row').getByText('Max', { exact: true }).click();
  await expect(amount(page)).toHaveValue('1000');
  hl.accountValue = '800';
  await submit(page).click();
  await expect(sheet(page)).toHaveCount(0);
  await expect(amount(page)).toHaveValue('800');
  await expect(page.locator('.error-tip')).toContainText('Your balance changed.');
  expect(hl.withdrawals).toHaveLength(0);
});

test('lost withdrawal response shows uncertainty and does not resend automatically', async ({ page, hl }) => {
  hl.withdrawLostResponse = true;
  await openFunding(page, 'Withdraw', '$1,000');
  await amount(page).fill('10');
  const readsBefore = hl.infoRequests.filter((item) => item.type === 'clearinghouseState').length;
  await submit(page).click({ clickCount: 2 });
  await expectToast(page, 'unknown whether this withdrawal ran');
  await expect.poll(() => hl.infoRequests.filter((item) => item.type === 'clearinghouseState').length).toBeGreaterThan(readsBefore);
  await expect(amount(page)).toHaveValue('10');
  expect(hl.withdrawals).toHaveLength(1);
  expect(hl.funding.broadcasts).toHaveLength(0);
});


test('cancelling deposit sends nothing and a changed amount gets a new authorization', async ({ page, hl }) => {
  await openFunding(page, 'Deposit', '500.12');
  await amount(page).fill('10');
  await submit(page).click();
  await expect(sheet(page)).toBeVisible();
  expect(hl.funding.broadcasts).toHaveLength(0);
  await sheet(page).getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(sheet(page)).toHaveCount(0);
  await expect(amount(page)).toHaveValue('10');
  await amount(page).fill('20');
  await submit(page).click();
  await expect(sheet(page).locator('.row').filter({ hasText: 'Amount' })).toContainText('$20 USDC');
  expect(hl.funding.broadcasts).toHaveLength(0);
  await confirmDeposit(page);
  await expectToast(page, 'Deposit initiated');
  expect(hl.funding.broadcasts).toHaveLength(1);
  const [authorization] = depositAbi.decodeFunctionData('batchDepositForBurnWithAuth', Transaction.from(hl.funding.broadcasts[0]).data);
  expect(authorization.amount).toBe(20000000n);
  expect(hl.funding.rpcRequests.filter(item => item.method === 'eth_estimateGas').length).toBeGreaterThanOrEqual(2);
});


test('leaving while the deposit fee is estimating ignores the late response', async ({ page, hl }) => {
  await openFunding(page, 'Deposit', '500.12');
  await amount(page).fill('10');
  const gas = hl.funding.holdNextGasEstimate();
  try {
    await submit(page).click();
    await gas.received;
    await expect(sheet(page)).toHaveCount(0);
    await page.locator('.funding-header .back').click();
    await expect(page.locator('.account-card')).toBeVisible();
    await expect(sheet(page)).toHaveCount(0);
    gas.release();
    await gas.completed;
    await expect(sheet(page)).toHaveCount(0);
    expect(hl.funding.broadcasts).toHaveLength(0);
  } finally { gas.release(); }
});
