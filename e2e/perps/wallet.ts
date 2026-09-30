import { randomBytes } from 'crypto';
import { computeAddress } from 'ethers';
import { expect, Page } from '@playwright/test';

export function createWallet() {
  const privateKey = `0x${randomBytes(32).toString('hex')}`;
  return { privateKey, address: computeAddress(privateKey).toLowerCase(), password: 'Perps-E2E-only-2026' };
}

export async function importAndUnlock(page: Page, wallet: ReturnType<typeof createWallet>) {
  await page.goto('/#/popup');
  await page.getByRole('button', { name: 'Import an existing wallet', exact: true }).click();
  await page.getByRole('dialog').getByText('Neo X (EVM Network)', { exact: true }).click();
  const form = page.locator('wallet-import form:visible');
  await form.getByLabel(/Set wallet name/).fill('Perps E2E');
  await form.getByLabel(/Enter WIF/).fill(wallet.privateKey);
  await form.getByLabel(/^Enter password\s*\*?$/).fill(wallet.password);
  await form.getByLabel(/^Enter password again\s*\*?$/).fill(wallet.password);
  await page.getByRole('button', { name: 'Import', exact: true }).click();
  await expect(page.locator('.tabs-container').getByText('Perps', { exact: true })).toBeVisible();
  await page.locator('app-header img.menu').click();
  await page.locator('app-header .pop-ups-menu').getByText('Lock NeoLine', { exact: true }).click();
  await expect(page).toHaveURL(/\/popup\/login$/);
  await page.getByLabel(/^Please enter your password/).fill(wallet.password);
  await page.getByRole('button', { name: 'Login', exact: true }).click();
  await expect(page.locator('.tabs-container').getByText('Perps', { exact: true })).toBeVisible();
}

export const marketRow = (page: Page) => page.locator('.perps-tab .market-row').filter({ hasText: 'ETH' });

export async function enterPerps(page: Page) {
  await page.locator('.tabs-container').getByText('Perps', { exact: true }).click();
  await expect(page).toHaveURL(/\/popup\/home\?tab=perps$/);
  await expect(marketRow(page)).toBeVisible();
}

export async function openLongOrder(page: Page) {
  await enterPerps(page);
  await marketRow(page).click();
  await page.getByRole('button', { name: 'Long', exact: true }).click();
  await expect(page).toHaveURL(/\/popup\/perps\/order\/ETH\?side=long$/);
  await page.getByRole('textbox', { name: /Amount/ }).fill('100');
  await expect(page.getByRole('button', { name: 'Place order', exact: true })).toBeEnabled();
}
