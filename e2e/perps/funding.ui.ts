import { Page } from '@playwright/test';
import { expect } from './fixtures';
import { enterPerps } from './wallet';

export async function openFunding(page: Page, direction: 'Deposit' | 'Withdraw', balance?: string) {
  await enterPerps(page);
  await page.locator('.card-actions').getByRole('button', { name: direction, exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`/popup/perps/funding\\?tab=${direction.toLowerCase()}$`));
  await expect(page.locator('.funding-tabs .active')).toHaveText(direction);
  if (balance) { await expect(page.locator('.balance-tip')).toContainText(balance); }
}

export const amount = (page: Page) => page.locator('.amount-input input');
export const submit = (page: Page) => page.locator('.submit-wrap button');
export const sheet = (page: Page) => page.locator('.confirm-sheet');
export async function confirmDeposit(page: Page) {
  await expect(sheet(page)).toBeVisible();
  await expect(sheet(page).locator('.sheet-title')).toHaveText('Confirm deposit');
  await sheet(page).locator('.primary').click();
}
export const fundingRow = (page: Page, label: string) => page.locator('.detail-rows .row')
  .filter({ has: page.locator('.label', { hasText: label }) }).locator('.value');
export async function expectToast(page: Page, message: string) {
  await expect(page.locator('simple-snack-bar').filter({ hasText: message })).toBeVisible();
}
