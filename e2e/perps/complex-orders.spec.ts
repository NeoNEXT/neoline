import { test, expect } from './fixtures';
import { enterPerps, openLongOrder } from './wallet';

for (const side of ['long', 'short'] as const) {
  test(`${side} TP/SL validates trigger direction and signs one parent with two reduce-only children`, async ({ page, hl }) => {
    await openLongOrder(page);
    if (side === 'short') { await page.locator('.side-toggle').getByText('Short', { exact: true }).click(); }
    await page.getByRole('switch', { name: 'Take profit / Stop loss' }).click();
    const tp = page.getByRole('textbox', { name: 'TP price', exact: true });
    const sl = page.getByRole('textbox', { name: 'SL price', exact: true });
    const submit = page.getByRole('button', { name: 'Place order', exact: true });
    await tp.fill(side === 'long' ? '90' : '110');
    await expect(submit).toBeDisabled();
    await expect(page.locator('.error-tip')).toContainText('Enter at least one valid trigger price');
    expect(hl.writes).toHaveLength(0);
    await tp.fill(side === 'long' ? '110' : '90');
    await sl.fill(side === 'long' ? '90' : '110');
    await expect(submit).toBeEnabled();
    await submit.click();
    await expect(page).toHaveURL(/\/popup\/home\?tab=perps$/);
    await expect(page.locator('.position-card')).toContainText(side === 'long' ? 'Long 2x' : 'Short 2x');
    expect(hl.orders).toHaveLength(1);
    const action = hl.orders[0].action;
    expect(action.grouping).toBe('normalTpsl');
    expect(action.orders).toEqual([
      { a: 0, b: side === 'long', p: side === 'long' ? '103' : '97', s: '1', r: false,
        t: { limit: { tif: 'Ioc' } }, c: expect.stringMatching(/^0x[0-9a-f]{32}$/) },
      { a: 0, b: side !== 'long', p: '99', s: '1', r: true,
        t: { trigger: { isMarket: true, triggerPx: side === 'long' ? '110' : '90', tpsl: 'tp' } }, c: expect.any(String) },
      { a: 0, b: side !== 'long', p: side === 'long' ? '81' : '121', s: '1', r: true,
        t: { trigger: { isMarket: true, triggerPx: side === 'long' ? '90' : '110', tpsl: 'sl' } }, c: expect.any(String) },
    ]);
    for (const order of action.orders) {
      expect(order.c).toMatch(/^0x[0-9a-f]{32}$/);
    }
    expect(new Set(action.orders.map((order: any) => order.c)).size).toBe(3);
  });
}

test('a filled parent with rejected protection preserves the position and warns without resubmission', async ({ page, hl }) => {
  hl.protectionRejected = true;
  await openLongOrder(page);
  await page.getByRole('switch', { name: 'Take profit / Stop loss' }).click();
  await page.getByRole('textbox', { name: 'TP price', exact: true }).fill('110');
  await page.getByRole('button', { name: 'Place order', exact: true }).click();
  await expect(page.locator('simple-snack-bar')).toContainText('TP/SL is not fully confirmed');
  await expect(page).toHaveURL(/\/popup\/home\?tab=perps$/);
  await expect(page.locator('.position-card')).toContainText('Long 2x');
  expect(hl.orders).toHaveLength(1);
  expect(hl.orders[0].action.orders).toHaveLength(2);
  await page.locator('.position-card').click();
  await expect(page.locator('.position-grid')).toContainText('1 ETH');
  expect(hl.orders).toHaveLength(1);
});

test('partial fill reports partial execution and shows only the filled position', async ({ page, hl }) => {
  hl.partialFillSize = '0.4';
  await openLongOrder(page);
  await page.getByRole('button', { name: 'Place order', exact: true }).click();
  await expect(page.locator('simple-snack-bar')).toContainText('Order partially filled.');
  await expect(page).toHaveURL(/\/popup\/perps\/order\/ETH\?side=long$/);
  await expect(page.getByRole('button', { name: 'Place order', exact: true })).toBeEnabled();
  expect(hl.orders).toHaveLength(1);
  await page.locator('.order-header .back').click();
  await expect(page.locator('.position-grid')).toContainText('0.4 ETH');
  expect(hl.orders).toHaveLength(1);
});

test('partial then full close sends opposite reduce-only orders and clears the position', async ({ page, hl }) => {
  hl.seedPosition('2');
  await enterPerps(page);
  await page.locator('.position-card').click();
  await page.locator('.trade-actions').getByRole('button', { name: 'Close', exact: true }).click();
  const input = page.getByRole('textbox', { name: /Closeable amount/ });
  await expect(input).toHaveValue('200.00');
  await input.fill('50');
  await page.locator('.submit-wrap').getByRole('button', { name: 'Close', exact: true }).click();
  await expect(page).toHaveURL(/\/popup\/home\?tab=perps$/);
  expect(hl.orders[0].action.orders[0]).toMatchObject({ b: false, r: true, s: '0.5', p: '97' });
  await page.locator('.position-card').click();
  await expect(page.locator('.position-grid')).toContainText('1.5 ETH');
  await page.locator('.trade-actions').getByRole('button', { name: 'Close', exact: true }).click();
  await expect(input).toHaveValue('150.00');
  await page.locator('.submit-wrap').getByRole('button', { name: 'Close', exact: true }).click();
  await expect(page).toHaveURL(/\/popup\/home\?tab=perps$/);
  await expect(page.locator('.position-card')).toHaveCount(0);
  await expect(page.locator('.account-card .card-margin')).toContainText('$1,000');
  expect(hl.writes.map((item) => item.action.type)).toEqual(['order', 'order']);
  expect(hl.orders[1].action.orders[0]).toMatchObject({ b: false, r: true, s: '1.5', p: '97' });
});

test('capacity dropping after margin-mode synchronization prevents the order', async ({ page, hl }) => {
  hl.capacityAfterLeverage = '0';
  await openLongOrder(page);
  await page.getByRole('button', { name: 'Place order', exact: true }).click();
  await expect(page.locator('simple-snack-bar')).toContainText('Insufficient');
  await expect(page.getByRole('button', { name: 'Place order', exact: true })).toBeDisabled();
  await expect(page).toHaveURL(/\/popup\/perps\/order\/ETH\?side=long$/);
  expect(hl.writes.map((item) => item.action.type)).toEqual(['updateLeverage']);
});

test('rejected leverage change stops before sending an order', async ({ page, hl }) => {
  hl.rejectLeverage = true;
  await openLongOrder(page);
  await page.getByRole('button', { name: 'Place order', exact: true }).click();
  await expect(page.locator('simple-snack-bar')).toContainText('Leverage could not be set, so no order was submitted');
  await expect(page.getByRole('button', { name: 'Place order', exact: true })).toBeEnabled();
  expect(hl.writes.map((item) => item.action.type)).toEqual(['updateLeverage']);
});
