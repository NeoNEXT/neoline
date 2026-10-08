import { test, expect } from './fixtures';
import { enterPerps } from './wallet';

test('A3 unified account shows spot USDC and subtracts hold from the available value', async ({ page, hl }) => {
  hl.accountMode = 'unifiedAccount';
  hl.accountValue = '900';
  hl.spotTotal = '120.123456';
  hl.spotHold = '25.000001';
  hl.spotBalances = [
    { coin: 'USDC', token: 0, total: hl.spotTotal, hold: hl.spotHold, entryNtl: '0' },
    { coin: 'PURR', token: 1, total: '9000', hold: '0', entryNtl: '0' },
  ];

  await enterPerps(page);

  await expect(page.locator('.account-card .card-value')).toHaveText('$120.12');
  await expect(page.locator('.account-card .card-margin')).toContainText('$95.12');
  await expect(page.locator('.account-card .card-spot')).toHaveCount(0);
  expect(hl.infoRequests.filter((request) => request.type === 'spotClearinghouseState')).toHaveLength(1);
});

test('A4 incomplete DEX snapshot keeps known positions and disables account-level funding actions', async ({ page, hl }) => {
  hl.seedPosition('1');
  hl.accountReadFailureStatus = 503;
  hl.accountReadFailureDex = 'xyz';

  await enterPerps(page);

  await expect(page.locator('.account-warning')).toContainText('Some DEX data is unavailable');
  await expect(page.locator('.position-card')).toHaveCount(1);
  await expect(page.locator('.card-actions').getByRole('button', { name: 'Deposit', exact: true })).toBeDisabled();
  await expect(page.locator('.card-actions').getByRole('button', { name: 'Withdraw', exact: true })).toBeDisabled();
  expect(hl.infoRequests.some((request) => request.type === 'clearinghouseState' && request.dex === 'xyz')).toBe(true);
});
