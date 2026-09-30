import { Page } from '@playwright/test';
import { Transaction, getAddress, keccak256, verifyTypedData, zeroPadValue } from 'ethers';
import { test, expect } from './fixtures';
import { enterPerps } from './wallet';
import { depositAbi, fundingContracts } from './funding.fake';
import { recoverWithdrawalSigner } from './hyperliquid.fake';

async function openFunding(page: Page, direction: 'Deposit' | 'Withdraw') {
  await enterPerps(page);
  await page.locator('.card-actions').getByRole('button', { name: direction, exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`/popup/perps/funding\\?tab=${direction.toLowerCase()}$`));
  await expect(page.locator('.balance-tip')).toContainText(direction === 'Deposit' ? '500.12' : '$1,000');
}

const amount = (page: Page) => page.locator('.amount-input input');
const submit = (page: Page) => page.locator('.submit-wrap button');
const sheet = (page: Page) => page.locator('.confirm-sheet');
const confirm = (page: Page) => sheet(page).getByRole('button', { name: 'Confirm', exact: true });
async function expectToast(page: Page, message: string) {
  await expect(page.locator('simple-snack-bar').filter({ hasText: message })).toBeVisible();
}

test('deposit validates amount, cancels safely, then signs and confirms one CCTP transaction', async ({ page, wallet, hl }) => {
  hl.funding.accountExists = false;
  await openFunding(page, 'Deposit');
  await amount(page).fill('4.999999');
  await expect(submit(page)).toBeDisabled();
  await expect(page.locator('.error-tip')).toContainText('minimum of 5');
  await amount(page).fill('501');
  await expect(submit(page)).toBeDisabled();
  await expect(page.locator('.error-tip')).toHaveText('Amount exceeds your balance');
  await page.locator('.preset-row').getByText('Max', { exact: true }).click();
  await expect(amount(page)).toHaveValue('500.123456');
  await amount(page).fill('10.1234567');
  await expect(amount(page)).toHaveValue('10.123456');
  await amount(page).fill('10');
  await submit(page).click();
  await expect(confirm(page)).toBeEnabled();
  await expect(sheet(page)).toContainText('Arbitrum Sepolia');
  await expect(sheet(page).locator('.address')).toHaveText(fundingContracts.extension);
  await expect(sheet(page).locator('.row').filter({ hasText: 'Transaction fee' })).toContainText('$1.2');
  await expect(sheet(page).locator('.row').filter({ hasText: 'You receive' })).toContainText('$8.8');
  expect(hl.funding.broadcasts).toHaveLength(0);
  await sheet(page).getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(sheet(page)).toHaveCount(0);
  expect(hl.funding.broadcasts).toHaveLength(0);

  await submit(page).click();
  await expect(confirm(page)).toBeEnabled();
  await confirm(page).click({ clickCount: 2 });
  await expectToast(page, 'Deposit initiated. Waiting for USDC');
  await expect(amount(page)).toHaveValue('');
  await expect(page.locator('.balance-tip')).toContainText('490.12');
  expect(hl.funding.broadcasts).toHaveLength(1);
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
  expect(burn.maxFee).toBe(201400n); // CCTP fee only; excludes the 1 USDC account fee.
  expect(burn.minFinalityThreshold).toBe(1000n);
  expect(burn.hookData).toBe(`0x${Buffer.from('cctp-forward').toString('hex').padEnd(48, '0')}0000000000000018${wallet.address.slice(2)}00000000`);
  const receipts = hl.funding.rpcRequests.filter((item) => item.method === 'eth_getTransactionReceipt');
  expect(receipts.length).toBeGreaterThan(0);
  expect(receipts.every((item) => item.params[0] === keccak256(raw))).toBe(true);
  // Source confirmation must not be shown as HyperCore credit.
  await page.locator('.funding-header .back').click();
  await expect(page.locator('.account-card .card-value')).toHaveText('$1,000');
});

test('deposit refuses confirmation when Arbitrum ETH cannot cover gas', async ({ page, hl }) => {
  hl.funding.nativeBalance = 0n;
  await openFunding(page, 'Deposit');
  await amount(page).fill('10');
  await submit(page).click();
  await expect(page.locator('.error-tip')).toContainText('Not enough ETH on Arbitrum Sepolia');
  await expect(sheet(page)).toHaveCount(0);
  await expect(submit(page)).toBeDisabled();
  expect(hl.funding.broadcasts).toHaveLength(0);
});

test('reverted deposit reports the source-chain failure without claiming a credit', async ({ page, hl }) => {
  hl.funding.receiptStatus = 0;
  await openFunding(page, 'Deposit');
  await amount(page).fill('10');
  await submit(page).click();
  await expect(confirm(page)).toBeEnabled();
  await confirm(page).click();
  await expectToast(page, 'The deposit failed on chain. Nothing was transferred');
  await expect(page.locator('.balance-tip')).toContainText('500.12');
  await expect(amount(page)).toHaveValue('');
  expect(hl.funding.broadcasts).toHaveLength(1);
  await page.locator('.funding-header .back').click();
  await expect(page.locator('.account-card .card-value')).toHaveText('$1,000');
});

test('withdrawal reopens confirmation after a fee increase and signs only after reconfirmation', async ({ page, wallet, hl }) => {
  await openFunding(page, 'Withdraw');
  await amount(page).fill('0.3');
  await expect(submit(page)).toBeDisabled();
  await expect(page.locator('.error-tip')).toContainText('minimum of 0.4');
  await amount(page).fill('10');
  await submit(page).click();
  await expect(confirm(page)).toBeEnabled();
  await expect(sheet(page).locator('.address')).toHaveText(getAddress(wallet.address));
  await expect(sheet(page).locator('.row').filter({ hasText: 'You receive' })).toContainText('$9.8');
  hl.funding.withdrawFee = '0.4';
  await confirm(page).click();
  await expectToast(page, 'The fee quote changed. Review it again');
  await expect(confirm(page)).toBeEnabled();
  await expect(sheet(page).locator('.row').filter({ hasText: 'You receive' })).toContainText('$9.6');
  expect(hl.withdrawals).toHaveLength(0);
  await confirm(page).click({ clickCount: 2 });
  await expectToast(page, 'Withdrawal initiated. Waiting for USDC');
  await expect(amount(page)).toHaveValue('');
  await expect(page.locator('.balance-tip')).toContainText('$990');
  expect(hl.withdrawals).toHaveLength(1);
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
  await expect(confirm(page)).toBeEnabled();
  await confirm(page).click();
  await expectToast(page, 'Withdrawal initiated.');
  await expect(page.locator('.balance-tip')).toContainText('$0');
  expect(hl.withdrawals).toHaveLength(1);
  expect(hl.withdrawals[0].action).toMatchObject({ amount: '250', sourceDex: 'spot', destinationRecipient: wallet.address });
  expect(recoverWithdrawalSigner(hl.withdrawals[0]).toLowerCase()).toBe(wallet.address);
});

test('MAX withdrawal stops when refreshed balance falls below the confirmed amount', async ({ page, hl }) => {
  await openFunding(page, 'Withdraw');
  await page.locator('.preset-row').getByText('Max', { exact: true }).click();
  await expect(amount(page)).toHaveValue('1000');
  await submit(page).click();
  await expect(confirm(page)).toBeEnabled();
  hl.accountValue = '800';
  await confirm(page).click();
  await expect(sheet(page)).toHaveCount(0);
  await expect(amount(page)).toHaveValue('800');
  await expect(page.locator('.error-tip')).toContainText('Your balance changed.');
  expect(hl.withdrawals).toHaveLength(0);
});

test('lost withdrawal response shows uncertainty and does not resend automatically', async ({ page, hl }) => {
  hl.withdrawLostResponse = true;
  await openFunding(page, 'Withdraw');
  await amount(page).fill('10');
  await submit(page).click();
  await expect(confirm(page)).toBeEnabled();
  const readsBefore = hl.infoRequests.filter((item) => item.type === 'clearinghouseState').length;
  await confirm(page).click({ clickCount: 2 });
  await expectToast(page, 'unknown whether this withdrawal ran');
  await expect.poll(() => hl.infoRequests.filter((item) => item.type === 'clearinghouseState').length).toBeGreaterThan(readsBefore);
  await expect(amount(page)).toHaveValue('10');
  expect(hl.withdrawals).toHaveLength(1);
  expect(hl.funding.broadcasts).toHaveLength(0);
});
