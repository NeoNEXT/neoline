import { test, expect } from './fixtures';
import { enterPerps, marketRow, openLongOrder } from './wallet';
import { recoverSigner } from './hyperliquid.fake';

test('NeoX enters Perps, opens ETH and receives a price update', async ({ page, hl }) => {
  await enterPerps(page);
  await expect(page.locator('.account-card .card-value')).toHaveText('$1,000');
  await expect(page.locator('.position-card')).toHaveCount(0);
  await marketRow(page).click();
  await expect(page).toHaveURL(/\/popup\/perps\/market\/ETH$/);
  await expect(page.locator('.price-block > .price')).toHaveText('$100');
  await expect(page.getByRole('button', { name: 'Long', exact: true })).toBeEnabled();
  await hl.pushPrice('101');
  await expect(page.locator('.price-block > .price')).toHaveText('$101');
  expect(hl.orders).toHaveLength(0);
});

test('market buy signs one IOC order and displays the resulting position', async ({ page, wallet, hl }) => {
  await openLongOrder(page);
  await page.getByRole('button', { name: 'Place order', exact: true }).click();
  await expect(page).toHaveURL(/\/popup\/home\?tab=perps$/);
  const position = page.locator('.position-card').filter({ hasText: 'ETH' });
  await expect(position).toContainText('Long 2x');
  await expect(page.locator('.account-card .card-margin')).toContainText('$950');
  expect(hl.writes.map((request) => request.action.type)).toEqual(['updateLeverage', 'order']);
  expect(hl.writes[0].action).toEqual({ type: 'updateLeverage', asset: 0, isCross: false, leverage: 2 });
  expect(hl.orders).toHaveLength(1);
  const request = hl.orders[0];
  expect(request.action).toEqual({ type: 'order', grouping: 'na', orders: [{
    a: 0, b: true, p: '103', s: '1', r: false, t: { limit: { tif: 'Ioc' } },
    c: expect.stringMatching(/^0x[0-9a-f]{32}$/),
  }] });
  expect(recoverSigner(request).toLowerCase()).toBe(wallet.address);
  expect(request.nonce).toBeGreaterThan(hl.writes[0].nonce);
  await position.click();
  await expect(page.locator('.position-grid')).toContainText('1 ETH');
});

test('lost response blocks duplicate submission and only queries the original order', async ({ page, wallet, hl }) => {
  hl.lostResponse = true;
  await openLongOrder(page);
  const submit = page.getByRole('button', { name: 'Place order', exact: true });
  await submit.click({ clickCount: 2 });
  await expect(page.locator('.status-unknown')).toContainText('The order was sent, but its result could not be read.');
  await expect(submit).toBeDisabled();
  const recheck = page.getByRole('button', { name: 'Check again', exact: true });
  await expect(recheck).toBeEnabled({ timeout: 15_000 });
  expect(hl.statusQueries).toHaveLength(4);
  expect(hl.orders).toHaveLength(1);
  await recheck.click();
  await expect.poll(() => hl.statusQueries.length, { timeout: 15_000 }).toBe(8);
  await expect(recheck).toBeEnabled();
  await expect(submit).toBeDisabled();
  await expect(page.locator('.status-unknown')).toBeVisible();
  expect(hl.writes.map((request) => request.action.type)).toEqual(['updateLeverage', 'order']);
  const cloid = hl.orders[0].action.orders[0].c;
  for (const query of hl.statusQueries) {
    expect(query).toEqual({ type: 'orderStatus', user: wallet.address, oid: cloid });
  }
});
