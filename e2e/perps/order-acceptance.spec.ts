import { Page } from '@playwright/test';
import { test, expect } from './fixtures';
import { enterPerps, openLongOrder } from './wallet';

const submit = (page: Page) => page.getByRole('button', { name: 'Place order', exact: true });
const amount = (page: Page) => page.getByRole('textbox', { name: /Amount/ });
const summary = (page: Page, label: string) => page.locator('.summary .row')
  .filter({ has: page.locator('.label', { hasText: label }) }).locator('.value');
const ordinaryOrder = async (page: Page, query = 'side=long') => {
  await page.goto(`/#/popup/perps/order/ETH?${query}`);
  await expect(page.locator('.order-header .price')).toHaveText('$100');
};

test('O1 standard add and close entries inherit the position and expose only supported controls', async ({ page, hl }) => {
  hl.seedPosition('-2.0001');
  await enterPerps(page);
  await page.locator('.position-card').click();
  await page.locator('.trade-actions').getByRole('button', { name: 'Add', exact: true }).click();
  await expect(page).toHaveURL(/order\/ETH\?add=1$/);
  await expect(page.locator('.close-position')).toContainText('Short');
  await expect(page.locator('.side-toggle')).toHaveCount(0);
  await expect(page.getByRole('spinbutton', { name: 'Leverage', exact: true })).toHaveCount(0);
  await page.getByRole('textbox', { name: /Add amount/ }).fill('100');
  await page.locator('.submit-wrap').getByRole('button', { name: 'Add', exact: true }).click();
  await expect(page).toHaveURL(/home\?tab=perps$/);
  expect(hl.orders[0].action.orders[0]).toMatchObject({ b: false, s: '1', r: false });
  await page.locator('.position-card').click();
  await page.locator('.trade-actions').getByRole('button', { name: 'Close', exact: true }).click();
  await expect(page.getByRole('spinbutton', { name: /Closeable amount/ })).toHaveValue('100');
  await expect(page.getByRole('textbox', { name: /Closeable amount/ })).toHaveValue('300.01');
  await expect(page.locator('.side-toggle')).toHaveCount(0);
  await expect(page.getByRole('textbox', { name: /Limit price/ })).toHaveCount(0);
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.locator('.submit-wrap').getByRole('button', { name: 'Close', exact: true }).click();
  await expect(page).toHaveURL(/home\?tab=perps$/);
  expect(hl.orders[1].action.orders[0]).toMatchObject({ b: true, s: '3.0001', r: true });
  await expect(page.locator('.position-card')).toHaveCount(0);
});

test('O1 cross route keeps the requested margin mode through the signed write', async ({ page, hl }) => {
  await ordinaryOrder(page, 'side=long&marginMode=cross');
  await amount(page).fill('100');
  await page.locator('.side-toggle').getByText('Short', { exact: true }).click();
  await expect(page.locator('.side-toggle .active-short')).toHaveText('Short');
  await submit(page).click();
  await expect(page).toHaveURL(/home\?tab=perps$/);
  expect(hl.writes[0].action).toMatchObject({ type: 'updateLeverage', isCross: true });
  expect(hl.orders[0].action.orders[0]).toMatchObject({ b: false, p: '97', s: '1' });
});

test('O2 P=30 M=31 precision=2 leverage=5 displays rounded margin and sends 3.33', async ({ page, hl }, testInfo) => {
  hl.price = '30'; hl.mark = '31'; hl.szDecimals = 2;
  hl.leverage = { type: 'isolated', value: 5 };
  await openLongOrder(page);
  await expect(page.getByRole('spinbutton', { name: 'Leverage', exact: true })).toHaveValue('5');
  await expect(summary(page, 'Margin')).toHaveText('$20.65');
  await expect(summary(page, 'Fee')).toHaveText('0.045%');
  await testInfo.attach('calculation-input', { body: JSON.stringify({ P: '30', M: '31', szDecimals: 2, leverage: 5, amount: '100',
    expected: { quantity: '3.33', notional: '99.90', margin: '20.646' } }), contentType: 'application/json' });
  await testInfo.attach('calculation-form', { body: await page.screenshot(), contentType: 'image/png' });
  await submit(page).click();
  await expect(page).toHaveURL(/home\?tab=perps$/);
  expect(hl.orders[0].action.orders[0]).toMatchObject({ p: '30.9', s: '3.33' });
  await page.locator('.position-card').click();
  await expect(page.locator('.position-grid')).toContainText('3.33 ETH');
});

test('O3 100% uses independent directional caps and distinguishes zero from mismatched capacity', async ({ page, hl }) => {
  hl.leverage = { type: 'isolated', value: 2 };
  hl.availableToTrade = ['60.129', '25.129'];
  hl.maxTradeSzs = ['0.55559', '2'];
  await ordinaryOrder(page);
  const percent = page.getByRole('spinbutton', { name: 'Amount', exact: true });
  await percent.fill('100'); await percent.press('Tab');
  await expect(amount(page)).toHaveValue('55.55');
  await page.locator('.side-toggle').getByText('Short', { exact: true }).click();
  await expect(amount(page)).toHaveValue('50.25');
  await expect(page.locator('.account-summary .available')).toContainText('25.12 USDC');
  hl.availableToTrade = ['60.129', '0']; hl.maxTradeSzs = ['0.55559', '0'];
  await hl.pushCapacity();
  await expect(page.locator('.account-summary .available')).toContainText('0 USDC');
  await expect(submit(page)).toBeDisabled();
  hl.leverage = { type: 'cross', value: 2 };
  await hl.pushCapacity();
  await expect(page.locator('.account-summary .available')).toContainText('N/A');
  expect(hl.writes).toHaveLength(0);
});

test('O3 missing capacity does not use the 1000 USDC account balance as a substitute', async ({ page, hl }) => {
  hl.capacityOverride = null;
  await ordinaryOrder(page);
  await amount(page).fill('100');
  await expect(page.locator('.account-summary .available')).toContainText('N/A');
  await expect(submit(page)).toBeDisabled();
  expect(hl.writes).toHaveLength(0);
});

for (const [quantity, remaining, label] of [['1', '-1', 'Short 2x'], ['3', '1', 'Long 2x']]) {
  test(`O4 ordinary buy ${quantity} against short 2 sends only the entered size`, async ({ page, hl }) => {
    hl.seedPosition('-2');
    await ordinaryOrder(page);
    await amount(page).fill(String(Number(quantity) * 100));
    await submit(page).click();
    await expect(page).toHaveURL(/home\?tab=perps$/);
    expect(hl.orders).toHaveLength(1);
    expect(hl.orders[0].action.orders[0]).toMatchObject({ b: true, s: quantity, r: false });
    expect(hl.positionSize).toBe(remaining);
    await expect(page.locator('.position-card')).toContainText(label);
    await page.locator('.position-card').click();
    await expect(page.locator('.position-grid')).toContainText('1 ETH');
  });
}

test('O5 50% floors a tail position and 100% uses the refreshed exact size without capacity', async ({ page, hl }) => {
  hl.seedPosition('2.0001'); hl.capacityOverride = null;
  await enterPerps(page);
  await page.locator('.position-card').click();
  await page.locator('.trade-actions').getByRole('button', { name: 'Close', exact: true }).click();
  const percent = page.getByRole('spinbutton', { name: /Closeable amount/ });
  await percent.fill('50'); await percent.press('Tab');
  await page.locator('.submit-wrap').getByRole('button', { name: 'Close', exact: true }).click();
  await expect(page).toHaveURL(/home\?tab=perps$/);
  expect(hl.orders[0].action.orders[0]).toMatchObject({ s: '1', b: false, r: true });
  await page.locator('.position-card').click();
  await page.locator('.trade-actions').getByRole('button', { name: 'Close', exact: true }).click();
  await expect(percent).toHaveValue('100');
  await expect(page.getByRole('textbox', { name: /Closeable amount/ })).toHaveValue('100.01');
  // Only the authoritative refresh sees this growth, not the already rendered form.
  hl.positionSize = '1.2345';
  await page.locator('.submit-wrap').getByRole('button', { name: 'Close', exact: true }).click();
  await expect(page).toHaveURL(/home\?tab=perps$/);
  expect(hl.orders[1].action.orders[0]).toMatchObject({ s: '1.2345', b: false, r: true });
  expect(hl.writes.map((item) => item.action.type)).toEqual(['order', 'order']);
  await expect(page.locator('.position-card')).toHaveCount(0);
});

for (const outcome of ['success', 'rejected', 'lost response']) {
  test(`O7 standalone leverage ${outcome} never creates an order`, async ({ page, hl }) => {
    hl.seedPosition('2');
    hl.rejectLeverage = outcome === 'rejected';
    hl.leverageResponseLost = outcome === 'lost response';
    await ordinaryOrder(page);
    const leverage = page.getByRole('spinbutton', { name: 'Leverage', exact: true });
    await expect(leverage).toHaveValue('2');
    await leverage.fill('3'); await leverage.press('Tab');
    await page.getByRole('button', { name: 'Apply leverage to position', exact: true }).click();
    if (outcome === 'success') {
      await expect(leverage).toHaveValue('3');
      await expect(page.getByRole('button', { name: 'Apply leverage to position', exact: true })).toHaveCount(0);
    } else {
      await expect(page.locator('simple-snack-bar')).toContainText('Leverage could not be set');
      await expect(leverage).toHaveValue('2');
    }
    expect(hl.writes.map((item) => item.action.type)).toEqual(['updateLeverage']);
    expect(hl.leverage.value).toBe(outcome === 'rejected' ? 2 : 3);
    // A lost acknowledgement does not mean venue rollback. Reload to obtain a new snapshot.
    await page.goto('/#/popup/perps/market/ETH');
    await page.reload();
    await expect(page.locator('.position-panel')).toContainText(outcome === 'rejected' ? '2x' : '3x');
  });
}

for (const scenario of [
  { name: 'd<1', metadata: { deployerFeeScale: '0.5' }, rate: '0.0648%' },
  { name: 'd>=1', metadata: { deployerFeeScale: '2' }, rate: '0.1728%' },
  { name: 'growth', metadata: { deployerFeeScale: '1', growthMode: 'enabled' }, rate: '0.00864%' },
  { name: 'missing coefficient', metadata: {}, rate: 'Not available' },
]) {
  test(`O1 O9 HIP-3 ${scenario.name} preserves full coin and quotes fees without builder approval`, async ({ page, hl }) => {
    hl.coin = 'xyz:XYZ100'; hl.marketMetadata = scenario.metadata;
    hl.fees = { userCrossRate: '0.00045', userAddRate: '-0.00002', activeReferralDiscount: '0.04' };
    await page.goto('/#/popup/perps/market/xyz%3AXYZ100');
    await page.getByRole('button', { name: 'Long', exact: true }).click();
    await expect(page).toHaveURL(/order\/xyz(?:%3A|:)XYZ100\?side=long$/);
    await amount(page).fill('100');
    await expect(summary(page, 'Fee')).toHaveText(scenario.rate);
    await submit(page).click();
    await expect(page).toHaveURL(/home\?tab=perps$/);
    expect(hl.infoRequests.some((item) => item.type === 'activeAssetData' && item.coin === 'xyz:XYZ100')).toBe(true);
    expect(hl.orders[0].action.orders[0]).toMatchObject({ a: 110000, s: '1' });
    expect(hl.writes.map((item) => item.action.type)).toEqual(['updateLeverage', 'order']);
    await expect(page.locator('.position-card')).toContainText('XYZ100');
  });
}

test('O10 optional empty protection sends no children and %/$ inputs stay linked', async ({ page, hl }) => {
  await openLongOrder(page);
  await page.getByRole('switch', { name: 'Take profit / Stop loss' }).click();
  const tp = page.getByRole('textbox', { name: 'TP price', exact: true });
  const profit = page.getByRole('textbox', { name: 'Profit', exact: true });
  await tp.fill('110');
  await expect(profit).toHaveValue('20');
  await page.locator('.select-unit').first().locator('.unit').click();
  await page.locator('.select-unit .pop-ups-menu').getByText('$', { exact: true }).click();
  await expect(profit).toHaveValue('10');
  await profit.fill('5'); await profit.press('Tab');
  await expect(tp).toHaveValue('105');
  await tp.fill('');
  await submit(page).click();
  await expect(page).toHaveURL(/home\?tab=perps$/);
  expect(hl.orders[0].action.grouping).toBe('na');
  expect(hl.orders[0].action.orders).toHaveLength(1);
});
