import { test, expect } from './fixtures';
import { openLongOrder } from './wallet';

function gate() {
  let release!: () => void;
  const promise = new Promise<void>((resolve) => { release = resolve; });
  return { promise, release };
}

test('O11 partially filled parent with waitingForFill protection warns without replacing either order', async ({ page, hl }) => {
  hl.partialFillSize = '0.4'; hl.protectionWaitingForFill = true;
  await openLongOrder(page);
  await page.getByRole('switch', { name: 'Take profit / Stop loss' }).click();
  await page.getByRole('textbox', { name: 'TP price', exact: true }).fill('110');
  await page.getByRole('button', { name: 'Place order', exact: true }).click();
  await expect(page.locator('simple-snack-bar')).toContainText('TP/SL is not fully confirmed');
  await expect(page).toHaveURL(/order\/ETH\?side=long$/);
  await expect(page.getByRole('button', { name: 'Place order', exact: true })).toBeEnabled();
  await page.locator('.order-header .back').click();
  await expect(page.locator('.position-grid')).toContainText('0.4 ETH');
  expect(hl.orders).toHaveLength(1);
  expect(hl.orders[0].action.orders).toHaveLength(2);
});

for (const failure of ['disconnect', '503', 'malformed'] as const) {
  test(`O12 accepted order with ${failure} response resolves by original cloid without resending`, async ({ page, hl, wallet }) => {
    hl.orderFailure = failure;
    hl.orderFoundAfterQueries = 2;
    await openLongOrder(page);
    const submit = page.getByRole('button', { name: 'Place order', exact: true });
    await submit.click({ clickCount: 2 });
    // Deterministic venue sequence, independent of when browser assertions run.
    await expect.poll(() => hl.statusQueries.length).toBe(2);
    await expect(page.locator('.status-unknown')).toHaveCount(0);
    await expect(submit).toBeEnabled();
    await expect(page).toHaveURL(/order\/ETH\?side=long$/);
    await expect(page.locator('.current-position')).toContainText('1 ETH');
    expect(hl.orders).toHaveLength(1);
    expect(hl.statusQueries).toHaveLength(2);
    expect(hl.events.filter((item) => item.request.type === 'orderStatus').map((item) => item.response))
      .toEqual([{ status: 'unknownOid' }, expect.objectContaining({ status: 'order' })]);
    for (const query of hl.statusQueries) {
      expect(query).toEqual({ type: 'orderStatus', user: wallet.address, oid: hl.orders[0].action.orders[0].c });
    }
  });
}

test('O13 missing pong marks retained quotes stale and reconnect restores subscriptions', async ({ page, hl }) => {
  test.setTimeout(75_000);
  await openLongOrder(page);
  await page.evaluate(() => {
    const socket = (window as any).__perpsSocket;
    socket.pong = false; socket.autoOpen = false;
  });
  await expect(page.locator('.stale-banner')).toBeVisible({ timeout: 45_000 });
  await expect(page.locator('.order-header .price')).toHaveText('$100');
  // Documented policy: stale transport alone does not prohibit an HTTP order.
  await expect(page.getByRole('button', { name: 'Place order', exact: true })).toBeEnabled();
  await page.waitForFunction(() => (window as any).__perpsSocket.sockets.some((socket: any) => socket.readyState === 0));
  await page.evaluate(() => {
    const control = (window as any).__perpsSocket;
    control.pong = true; control.autoOpen = true;
    control.sockets.forEach((socket: any) => socket.open());
  });
  await expect(page.locator('.stale-banner')).toHaveCount(0);
  const subscriptions = await page.evaluate(() => (window as any).__perpsSocket.sent
    .filter((message: any) => message.method === 'subscribe').map((message: any) => message.subscription.type));
  expect(subscriptions.filter((type: string) => type === 'activeAssetCtx').length).toBeGreaterThanOrEqual(2);
  expect(subscriptions.filter((type: string) => type === 'activeAssetData').length).toBeGreaterThanOrEqual(2);
  await hl.pushPrice('101');
  await expect(page.locator('.order-header .price')).toHaveText('$101');
  expect(hl.orders).toHaveLength(0);
});

test('O13 leaving after submission lets the write finish without a late home navigation', async ({ page, hl }) => {
  const pending = gate(); hl.orderResponseGate = pending.promise;
  try {
    await openLongOrder(page);
    await page.getByRole('button', { name: 'Place order', exact: true }).click();
    await expect.poll(() => hl.orders.length).toBe(1);
    await page.locator('.order-header .back').click();
    await expect(page).toHaveURL(/market\/ETH$/);
    const reply = page.waitForResponse((response) => response.url().endsWith('/exchange') &&
      response.request().postDataJSON()?.action?.type === 'order');
    pending.release();
    await (await reply).finished();
    await hl.pushPrice('102');
    await expect(page.locator('.price-block > .price')).toHaveText('$102');
    await expect(page.locator('.position-grid')).toContainText('1 ETH');
    await expect(page).toHaveURL(/market\/ETH$/);
    expect(hl.orders).toHaveLength(1);
    expect(hl.statusQueries).toHaveLength(0);
  } finally { pending.release(); }
});

test('O17 first isolated order waits for fresh capacity after setting acknowledgement', async ({ page, hl }) => {
  const capacity = gate(); hl.capacityAfterLeverageGate = capacity.promise;
  try {
    await openLongOrder(page);
    await page.getByRole('button', { name: 'Place order', exact: true }).click();
    await expect.poll(() => hl.writes.length).toBe(1);
    await expect(page.getByRole('button', { name: 'Place order', exact: true })).toHaveAttribute('aria-busy', 'true');
    expect(hl.orders).toHaveLength(0);
    capacity.release();
    await expect(page).toHaveURL(/home\?tab=perps$/);
    const settings = hl.events.findIndex((item) => item.request.action?.type === 'updateLeverage');
    const fresh = hl.events.findIndex((item, index) => index > settings && item.request.type === 'activeAssetData');
    const order = hl.events.findIndex((item) => item.request.action?.type === 'order');
    expect(settings).toBeGreaterThanOrEqual(0);
    expect(fresh).toBeGreaterThan(settings);
    expect(order).toBeGreaterThan(fresh);
    expect(hl.events[fresh].response).toMatchObject({ leverage: { type: 'isolated', value: 2 } });
    expect(hl.orders).toHaveLength(1);
  } finally { capacity.release(); }
});

for (const failure of ['missing', 'wrong mode', 'old leverage', 'insufficient']) {
  test(`O17 ${failure} fresh capacity prevents the order after mode synchronization`, async ({ page, hl, wallet }) => {
    hl.capacityOverrideAfterLeverage = failure === 'missing' ? null : {
      user: wallet.address, coin: 'ETH', markPx: '100',
      leverage: { type: failure === 'wrong mode' ? 'cross' : 'isolated', value: failure === 'old leverage' ? 3 : 2 },
      availableToTrade: ['1000', '1000'], maxTradeSzs: [failure === 'insufficient' ? '0.5' : '20', '20'],
    };
    await openLongOrder(page);
    await page.getByRole('button', { name: 'Place order', exact: true }).click();
    await expect(page.locator('simple-snack-bar')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Place order', exact: true })).toHaveAttribute('aria-busy', 'false');
    expect(hl.writes.map((item) => item.action.type)).toEqual(['updateLeverage']);
    await expect(page).toHaveURL(/order\/ETH\?side=long$/);
  });
}
