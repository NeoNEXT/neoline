import { test, expect } from './fixtures';
import { enterPerps } from './wallet';
import { pushFrame } from './socket';

test('H1 history tabs load on demand once and render protocol values', async ({ page, wallet, hl }) => {
  const now = Date.now();
  hl.historyFills = [{
    coin: 'ETH', tid: '101', oid: '11', px: '1710.5', sz: '1.23456',
    side: 'B', time: now, dir: 'Open Long', closedPnl: '0', fee: '0.05', feeToken: 'USDC',
  }];
  hl.historicalOrders = [{
    order: {
      coin: 'ETH', oid: '12', side: 'A', limitPx: '1710.5', sz: '0.25', origSz: '1.23456',
      timestamp: now, orderType: 'Limit', reduceOnly: true,
    },
    status: 'venueSpecificState', statusTimestamp: now,
  }];
  hl.fundingHistory = [{
    time: now, hash: 'funding-1', delta: { type: 'funding', coin: 'ETH', usdc: '-0.000001' },
  }];
  hl.ledgerHistory = [{
    time: now, hash: 'transfer-1', delta: { type: 'deposit', usdc: '1.25' },
  }];

  await enterPerps(page);
  await page.locator('.card-actions').getByRole('button', { name: 'Activity', exact: true }).click();
  await expect(page).toHaveURL(/\/popup\/perps\/history$/);
  await expect(page.locator('.history-tabs button').first()).toContainText('Open orders');
  // The fixture enables the default and xyz DEX, so the page requests both snapshots.
  expect(hl.infoRequests.filter((request) => request.type === 'frontendOpenOrders')).toHaveLength(2);
  await page.waitForFunction(() => (window as any).__perpsSocket.sent.some(
    (message: any) => message.subscription?.type === 'userFills'
  ));
  await pushFrame(page, {
    channel: 'userFills',
    data: { user: wallet.address, isSnapshot: true, fills: hl.historyFills },
  });

  const tabs = page.locator('.history-tabs button');
  await tabs.nth(1).click();
  await expect(page.locator('.fill-row.fill-trade')).toContainText('Open Long');
  expect(hl.infoRequests.filter((request) => request.type === 'userFills')).toHaveLength(0);

  await tabs.nth(2).click();
  const historicalOrder = page.locator('.fill-row.fill-trade').first();
  await expect(historicalOrder).toContainText('1.2346 ETH');
  await expect(historicalOrder).toContainText('venueSpecificState');
  await expect(historicalOrder).not.toContainText('1710.5');
  expect(hl.infoRequests.filter((request) => request.type === 'historicalOrders')).toHaveLength(1);

  await tabs.nth(3).click();
  await expect(page.locator('.fill-row.fill-trade').first()).toContainText('ETH');
  expect(hl.infoRequests.filter((request) => request.type === 'userFunding')).toHaveLength(1);

  await tabs.nth(4).click();
  await expect(page.locator('.fill-row.fill-trade').first()).toContainText('1.25');
  expect(hl.infoRequests.filter((request) => request.type === 'userNonFundingLedgerUpdates')).toHaveLength(1);

  for (const index of [1, 2, 3, 4]) { await tabs.nth(index).click(); }
  expect(hl.infoRequests.filter((request) => request.type === 'userFills')).toHaveLength(0);
  expect(hl.infoRequests.filter((request) => request.type === 'historicalOrders')).toHaveLength(1);
  expect(hl.infoRequests.filter((request) => request.type === 'userFunding')).toHaveLength(1);
  expect(hl.infoRequests.filter((request) => request.type === 'userNonFundingLedgerUpdates')).toHaveLength(1);
});

test('H3 the three archived lists display all fetched rows', async ({ page, hl }) => {
  const now = Date.now();
  const times = Array.from({ length: 262 }, (_, index) => now - index * 1000);
  hl.fundingHistory = times.map((time, index) => ({
    time, hash: `funding-${index}`, delta: { type: 'funding', coin: 'ETH', usdc: `${index + 1}` },
  }));
  hl.historicalOrders = times.map((time, index) => ({
    order: {
      coin: 'ETH', oid: `${index + 1}`, side: 'B', limitPx: '100', sz: '1', origSz: '1',
      timestamp: time, orderType: 'Limit', reduceOnly: false,
    },
    status: 'filled', statusTimestamp: time,
  }));
  hl.ledgerHistory = times.map((time, index) => ({
    time, hash: `transfer-${index}`, delta: { type: 'deposit', usdc: `${index + 1}` },
  }));
  await enterPerps(page);
  await page.locator('.card-actions').getByRole('button', { name: 'Activity', exact: true }).click();
  const tabs = page.locator('.history-tabs button');
  for (const index of [2, 3, 4]) {
    await tabs.nth(index).click();
    await expect(page.locator('.fill-row.fill-trade')).toHaveCount(times.length);
  }
});
