import { test, expect } from './fixtures';
import { enterPerps, marketRow } from './wallet';
import { pushFrame } from './socket';

type MarketFixture = { name: string; szDecimals: number; maxLeverage: number; marginTableId: number };
type ContextFixture = {
  markPx: string; midPx: string | null; oraclePx: string; prevDayPx: string;
  dayNtlVlm: string; openInterest: string; funding: string;
};

const market = (name: string): MarketFixture => ({
  name, szDecimals: 4, maxLeverage: 25, marginTableId: 1,
});

const context = (overrides: Partial<ContextFixture> = {}): ContextFixture => ({
  markPx: '102', midPx: '101', oraclePx: '99.5', prevDayPx: '100',
  dayNtlVlm: '1234567', openInterest: '2', funding: '0.0001', ...overrides,
});

function snapshot(names: string[], contexts: ContextFixture[] = names.map(() => context())) {
  return { universe: names.map(market), ctxs: contexts };
}

async function openEthDetail(page: Parameters<typeof enterPerps>[0]) {
  await enterPerps(page);
  await marketRow(page).click();
  await expect(page).toHaveURL(/\/popup\/perps\/market\/ETH$/);
  await expect(page.locator('.market-header .name')).toContainText('ETH');
}

test('M1, M2 market switcher searches locally, closes cleanly, and preserves HIP-3 identity', async ({ page, hl }) => {
  hl.marketSnapshots = {
    '': snapshot(['ETH']),
    xyz: snapshot(['TSLA']),
  };

  await openEthDetail(page);
  await page.locator('.coin-switch').click();
  const search = page.locator('.coin-menu .search-bar input');
  await expect(search).toBeFocused();
  const requestCount = hl.infoRequests.length;
  await search.fill(' ts ');
  await expect(page.locator('.coin-menu .market-row')).toHaveCount(1);
  expect(hl.infoRequests).toHaveLength(requestCount);

  await page.locator('.coin-menu-mask').click({ position: { x: 8, y: 8 } });
  await expect(page.locator('.coin-menu')).toHaveCount(0);
  await page.locator('.coin-switch').click();
  await expect(page.locator('.coin-menu .search-bar input')).toHaveValue('');
  await page.locator('.coin-menu .market-row').filter({ hasText: 'TSLA' }).click();

  await expect(page).toHaveURL(/\/popup\/perps\/market\/xyz:TSLA$/);
  await expect(page.locator('.market-header .dex-badge')).toHaveText('xyz');
  expect(hl.infoRequests.some((request) => request.type === 'metaAndAssetCtxs' && request.dex === 'xyz')).toBe(true);
  await expect.poll(() => hl.infoRequests.some((request) => request.type === 'candleSnapshot' && request.req.coin === 'xyz:TSLA')).toBe(true);
  await expect.poll(() => page.evaluate(() => (window as any).__perpsSocket.sent.some((message: any) =>
    message.method === 'subscribe' && message.subscription?.type === 'activeAssetCtx' && message.subscription.coin === 'xyz:TSLA'
  ))).toBe(true);
});

test('M3 detail price, 24h change, volume, open interest, oracle and mark fallback match the raw context', async ({ page, hl }) => {
  hl.marketSnapshots = { '': snapshot(['ETH']), xyz: snapshot([]) };
  await openEthDetail(page);

  await expect(page.locator('.price-block > .price')).toHaveText('$101');
  await expect(page.locator('.price-block .change')).toContainText('+1.00%');
  const stats = page.locator('.stats-card').first();
  await expect(stats.locator('.row').filter({ hasText: '24h volume' })).toContainText('$1.23M');
  await expect(stats.locator('.row').filter({ hasText: 'Open interest' })).toContainText('$204');
  await expect(stats.locator('.row').filter({ hasText: 'Oracle price' })).toContainText('$99.5');

  const markContext = context({ midPx: null, markPx: '105' });
  await pushFrame(page, { channel: 'activeAssetCtx', data: { coin: 'ETH', ctx: markContext } });
  await expect(page.locator('.price-block > .price')).toHaveText('$105');
  await expect(page.locator('.price-kind')).toBeVisible();
  await expect(page.locator('.price-block .change.unavailable')).toBeVisible();

  const noPriceContext = context({ midPx: null, markPx: '0' });
  await pushFrame(page, { channel: 'activeAssetCtx', data: { coin: 'ETH', ctx: noPriceContext } });
  await expect(page.locator('.price-block > .price')).toHaveText('N/A');
  // 详情页仍允许进入表单；是否能提交市价单由下单页在选择订单类型后判断。
  await expect(page.locator('.trade-actions .long')).toBeEnabled();
  expect(hl.writes).toHaveLength(0);
});

test('M4 interval controls send exact protocol values and reuse the saved preference after re-entry', async ({ page, hl }) => {
  hl.marketSnapshots = { '': snapshot(['ETH']), xyz: snapshot([]) };
  await openEthDetail(page);
  await expect.poll(() => hl.infoRequests.some((request) => request.type === 'candleSnapshot' && request.req.interval === '15m')).toBe(true);

  await page.locator('.interval-bar > span').filter({ hasText: /^1h$/ }).click();
  await expect.poll(() => hl.infoRequests.some((request) => request.type === 'candleSnapshot' && request.req.interval === '1h')).toBe(true);
  await page.locator('.interval-select').click();
  await page.locator('.interval-menu').getByText('1W', { exact: true }).click();
  await expect.poll(() => hl.infoRequests.some((request) => request.type === 'candleSnapshot' && request.req.interval === '1w')).toBe(true);
  await expect(page.locator('.interval-select')).toContainText('1W');

  await page.locator('.market-header .back').click();
  await expect(page).toHaveURL(/\/popup\/home\?tab=perps$/);
  await marketRow(page).click();
  await expect(page).toHaveURL(/\/popup\/perps\/market\/ETH$/);
  await expect(page.locator('.interval-select')).toContainText('1W');
  await expect.poll(() => hl.infoRequests.filter((request) => request.type === 'candleSnapshot' && request.req.interval === '1w').length).toBeGreaterThan(1);
});

test('M11, M12 matching position changes detail actions to add/close routes without submitting a write', async ({ page, hl }) => {
  hl.seedPosition('1');
  hl.marketSnapshots = { '': snapshot(['ETH']), xyz: snapshot([]) };
  await openEthDetail(page);

  const position = page.locator('.position-panel');
  await expect(position.locator('.side-chip')).toContainText('Long');
  await expect(position.locator('.position-grid')).toContainText('1 ETH');
  await expect(page.locator('.trade-actions .long')).toHaveText('Add');
  await expect(page.locator('.trade-actions .short')).toHaveText('Close');
  await page.locator('.trade-actions .long').click();
  await expect(page).toHaveURL(/\/popup\/perps\/order\/ETH\?add=1$/);
  expect(hl.writes).toHaveLength(0);
});
