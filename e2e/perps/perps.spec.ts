import { test, expect } from './fixtures';
import { enterPerps, marketRow, openLongOrder } from './wallet';
import { recoverSigner } from './hyperliquid.fake';

test('NeoX migrates default to Unified, opens ETH and receives a price update', async ({ page, wallet, hl }) => {
  hl.accountMode = 'default';
  await enterPerps(page);
  await expect.poll(() => hl.accountMode).toBe('unifiedAccount');
  expect(hl.writes).toHaveLength(1);
  expect(hl.writes[0].action).toEqual({ type: 'agentSetAbstraction', abstraction: 'u' });
  expect(recoverSigner(hl.writes[0]).toLowerCase()).toBe(wallet.address);
  await expect(page.locator('.account-card .card-value')).toHaveText('$1,000');
  await expect(page.locator('.position-card')).toHaveCount(0);
  await marketRow(page).click();
  await expect(page).toHaveURL(/\/popup\/perps\/market\/ETH$/);
  await expect(page.locator('.price-block > .price')).toHaveText('$100');
  await expect(page.getByRole('button', { name: 'Long', exact: true })).toBeEnabled();
  await hl.pushPrice('101');
  await expect(page.locator('.price-block > .price')).toHaveText('$101');
  expect(hl.orders).toHaveLength(0);
  await page.locator('.market-header .back').click();
  await expect(page).toHaveURL(/home\?tab=perps$/);
  expect(hl.writes).toHaveLength(1);
});

test('Standard stays unchanged and has no account-mode switch', async ({ page, hl }) => {
  hl.accountMode = 'disabled';
  hl.accountValue = '0';
  hl.spotBalances = [{ coin: 'USDC', token: 0, total: '773.84', hold: '0', entryNtl: '0' }];
  await enterPerps(page);
  await expect(page.locator('.card-spot')).toHaveCount(0);
  await expect(page.locator('.account-card .card-value')).toHaveText('$0');
  await expect(page.getByRole('button', { name: /unified account/i })).toHaveCount(0);
  expect(hl.accountMode).toBe('disabled');
  expect(hl.writes).toHaveLength(0);
});

test('new orders use exchange leverage and restore session drafts', async ({ page, hl }) => {
  hl.leverage = { type: 'isolated', value: 5 };
  await enterPerps(page);
  await marketRow(page).click();
  await page.getByRole('button', { name: 'Long', exact: true }).click();
  const leverage = page.getByRole('spinbutton', { name: 'Leverage', exact: true });
  await expect(leverage).toHaveValue('5');
  await leverage.fill('7');
  await leverage.blur();
  await page.locator('.order-header .back').click();
  await page.getByRole('button', { name: 'Long', exact: true }).click();
  await expect(leverage).toHaveValue('7');
  expect(hl.orders).toHaveLength(0);
});

test('Unified BTC shows 5.92 USDC and uses percent sizing before switching cross 20x to isolated 3x',
  async ({ page, hl }, testInfo) => {
    hl.accountMode = 'unifiedAccount';
    hl.accountValue = '0';
    hl.spotTotal = '5.92339';
    hl.spotHold = '0';
    hl.coin = 'BTC';
    hl.price = '68716';
    hl.mark = '68716';
    hl.szDecimals = 5;
    hl.marketMetadata = { maxLeverage: 40 };
    hl.leverage = { type: 'cross', value: 20 };
    hl.availableToTrade = ['5.92339', '5.92339'];
    hl.maxTradeSzs = ['0.00172', '0.00172'];
    await page.goto('/#/popup/perps/order/BTC?side=short');
    await expect(page.locator('.available b')).toHaveText('5.92 USDC');
    const leverage = page.getByRole('spinbutton', { name: 'Leverage', exact: true });
    await expect(leverage).toHaveValue('20');
    await leverage.fill('3');
    await leverage.blur();
    const percent = page.getByRole('spinbutton', { name: 'Amount', exact: true });
    await percent.fill('100');
    await percent.press('Tab');
    await expect(page.getByRole('textbox', { name: /Amount/ })).toHaveValue('17.17');
    const submit = page.getByRole('button', { name: 'Place order', exact: true });
    await expect(submit).toBeEnabled();
    expect(hl.writes).toHaveLength(0);
    await testInfo.attach('balance-preview', {
      body: await page.screenshot({ path: testInfo.outputPath('balance-preview.png'), fullPage: true }),
      contentType: 'image/png',
    });
    await submit.click();
    await expect(page).toHaveURL(/\/popup\/home\?tab=perps$/);
    expect(hl.writes.map((request) => request.action.type)).toEqual(['updateLeverage', 'order']);
    expect(hl.writes[0].action).toEqual({ type: 'updateLeverage', asset: 0, isCross: false, leverage: 3 });
    expect(hl.orders[0].action.orders[0]).toMatchObject({ b: false, s: '0.00024' });
    const updated = hl.events.findIndex((event) => event.request.action?.type === 'updateLeverage');
    const refreshed = hl.events.findIndex((event, index) => index > updated && event.request.type === 'activeAssetData');
    const ordered = hl.events.findIndex((event) => event.request.action?.type === 'order');
    expect(refreshed).toBeGreaterThan(updated);
    expect(ordered).toBeGreaterThan(refreshed);
  });

test('market buy signs one IOC order and displays the resulting position', async ({ page, wallet, hl }) => {
  await openLongOrder(page);
  await page.getByRole('button', { name: 'Place order', exact: true }).click();
  await expect(page).toHaveURL(/\/popup\/home\?tab=perps$/);
  const position = page.locator('.position-card').filter({ hasText: 'ETH' });
  await expect(position).toContainText('Long 2x');
  await expect(page.locator('.account-card .card-margin')).toContainText('$950');
  expect(hl.writes.map((request) => request.action.type)).toEqual(['agentSetAbstraction', 'updateLeverage', 'order']);
  expect(hl.writes[1].action).toEqual({ type: 'updateLeverage', asset: 0, isCross: false, leverage: 2 });
  expect(hl.orders).toHaveLength(1);
  const request = hl.orders[0];
  expect(request.action).toEqual({
    type: 'order', grouping: 'na', orders: [{
      a: 0, b: true, p: '103', s: '1', r: false, t: { limit: { tif: 'Ioc' } },
      c: expect.stringMatching(/^0x[0-9a-f]{32}$/),
    }],
    builder: { b: '0x90bcb1d82e51701eaea39fcb3a044450e2f01241', f: 45 },
  });
  expect(recoverSigner(request).toLowerCase()).toBe(wallet.address);
  expect(request.nonce).toBeGreaterThan(hl.writes[1].nonce);
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
  expect(hl.writes.map((request) => request.action.type)).toEqual(['agentSetAbstraction', 'updateLeverage', 'order']);
  const cloid = hl.orders[0].action.orders[0].c;
  for (const query of hl.statusQueries) {
    expect(query).toEqual({ type: 'orderStatus', user: wallet.address, oid: cloid });
  }
});
