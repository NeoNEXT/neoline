import { test, expect } from './fixtures';
import { enterPerps } from './wallet';
import { pushFrame } from './socket';

type MarketFixture = { name: string; szDecimals: number; maxLeverage: number; marginTableId: number };
type ContextFixture = {
  markPx: string; midPx: string | null; oraclePx: string; prevDayPx: string;
  dayNtlVlm: string; openInterest: string; funding: string;
};

const market = (name: string): MarketFixture => ({
  name, szDecimals: 4, maxLeverage: 25, marginTableId: 1,
});

const context = (volume: string, midPx: string | null = '100', prevDayPx = '100', markPx = '101'): ContextFixture => ({
  markPx, midPx, oraclePx: '100', prevDayPx, dayNtlVlm: volume, openInterest: '1000', funding: '0.0001',
});

function snapshot(names: string[], volumes: string[]) {
  return {
    universe: names.map(market),
    ctxs: names.map((_, index) => context(volumes[index])),
  };
}

async function openMarkets(page: Parameters<typeof enterPerps>[0]) {
  await enterPerps(page);
  await page.getByText('Explore markets', { exact: true }).click();
  await expect(page).toHaveURL(/\/popup\/perps\/markets$/);
}

const rowNames = async (page: Parameters<typeof enterPerps>[0]) =>
  (await page.locator('.market-row .market-name .coin').allTextContents())
    .map((value) => value.trim().split(/\s+/)[0]);

async function loadMore(page: Parameters<typeof enterPerps>[0]) {
  const button = page.getByRole('button', { name: 'Load more' });
  await button.focus();
  await button.press('Enter');
}

test('S1, S2, S8 markets search focuses, filters locally, resets paging, and loads all rows in batches', async ({ page, hl }) => {
  const ordinary = ['ETH', ...Array.from({ length: 64 }, (_, index) => `TA${String(index).padStart(2, '0')}`)];
  const names = ['NEO', 'GAS', ...ordinary];
  hl.marketSnapshots = {
    '': snapshot(names, names.map((_, index) => String(1000 - index))),
    xyz: snapshot([], []),
  };

  await openMarkets(page);
  const search = page.locator('.search-bar input');
  await expect(search).toBeFocused();
  await expect(page.locator('.market-row')).toHaveCount(32);
  await expect.poll(() => hl.infoRequests.filter((request) => request.type === 'metaAndAssetCtxs').length).toBe(2);
  const readsBeforeSearch = hl.infoRequests.length;

  await search.fill(' ta ');
  await expect(page.locator('.market-row')).toHaveCount(30);
  await loadMore(page);
  await expect(page.locator('.market-row')).toHaveCount(60);
  await loadMore(page);
  await expect(page.locator('.market-row')).toHaveCount(64);
  await expect(page.getByRole('button', { name: 'Load more' })).toHaveCount(0);
  expect(hl.infoRequests).toHaveLength(readsBeforeSearch);

  await page.locator('.search-bar .clear').click();
  await expect(search).toHaveValue('');
  await expect(page.locator('.market-row')).toHaveCount(32);
  await expect(page.locator('.sort-select')).toContainText('24h volume');
  await loadMore(page);
  await expect(page.locator('.market-row')).toHaveCount(62);
  await loadMore(page);
  await expect(page.locator('.market-row')).toHaveCount(67);
  await expect(page.getByRole('button', { name: 'Load more' })).toHaveCount(0);
  expect(hl.infoRequests).toHaveLength(readsBeforeSearch);
});

test('S4, S5, S9 live market frames update values without reordering until the sort is selected again', async ({ page, hl }) => {
  const names = ['ETH', 'A1', 'A2'];
  const initial = snapshot(names, ['20', '100', '90']);
  initial.ctxs[1] = context('1234567', '101', '100', '102');
  initial.ctxs[2] = context('90', '100', '100', '101');
  hl.marketSnapshots = { '': initial, xyz: snapshot([], []) };

  await openMarkets(page);
  const search = page.locator('.search-bar input');
  await search.fill('A');
  await expect(page.locator('.market-row')).toHaveCount(2);
  await expect(page.locator('.market-row').first().locator('.market-price .price')).toContainText('$101');
  await expect(page.locator('.market-row').first().locator('.market-price .change')).toHaveText('+1.00%');
  await expect(page.locator('.market-row').first().locator('.volume')).toHaveText('$1.23M');

  const updated = [...initial.ctxs];
  updated[1] = context('10', '11', '10', '12');
  updated[2] = context('10000', '22', '20', '23');
  await pushFrame(page, { channel: 'allDexsAssetCtxs', data: { ctxs: [['', updated], ['xyz', []]] } });
  await expect(page.locator('.market-row').first().locator('.market-price .price')).toContainText('$11');
  await expect.poll(() => rowNames(page)).toEqual(['A1', 'A2']);

  await page.locator('.sort-select').click();
  await page.locator('.sort-menu').getByText('24h volume', { exact: true }).click();
  await expect.poll(() => rowNames(page)).toEqual(['A2', 'A1']);

  const markFallback = context('1', null, '100', '102');
  await pushFrame(page, { channel: 'allDexsAssetCtxs', data: { ctxs: [['', [initial.ctxs[0], markFallback, updated[2]]], ['xyz', []]] } });
  await expect(page.locator('.market-row').filter({ hasText: 'A1' }).locator('.market-price .price')).toContainText('$102');
  await expect(page.locator('.market-row').filter({ hasText: 'A1' }).locator('.mark-tag')).toHaveCount(1);

  const invalid = context('1', null, '100', '0');
  await pushFrame(page, { channel: 'allDexsAssetCtxs', data: { ctxs: [['', [initial.ctxs[0], invalid, updated[2]]], ['xyz', []]] } });
  await expect(page.locator('.market-row').filter({ hasText: 'A1' }).locator('.market-price .price')).toHaveText('N/A');
});

test('S10 HIP-3 market selection preserves the full coin in its route and lookup', async ({ page, hl }) => {
  hl.marketSnapshots = {
    '': snapshot(['TSLA', 'ETH'], ['200', '100']),
    xyz: snapshot(['TSLA'], ['150']),
  };

  await openMarkets(page);
  await page.locator('.search-bar input').fill('TSLA');
  await expect(page.locator('.market-row')).toHaveCount(2);
  // The default DEX has the larger volume, so the second identically named row is xyz:TSLA.
  await page.locator('.market-row').nth(1).click();
  await expect(page).toHaveURL(/\/popup\/perps\/market\/xyz:TSLA$/);
  expect(hl.infoRequests.some((request) => request.type === 'metaAndAssetCtxs' && request.dex === 'xyz')).toBe(true);
});

test('S11 failed xyz snapshot stays visibly incomplete and does not claim a search has no matches', async ({ page, hl }) => {
  hl.marketSnapshots = {
    '': snapshot(['ETH'], ['100']),
    xyz: snapshot(['XYZONLY'], ['90']),
  };
  hl.marketSnapshotFailureDex = 'xyz';

  await openMarkets(page);
  await expect(page.locator('.market-notice')).toContainText('this list is incomplete');
  await page.locator('.search-bar input').fill('XYZONLY');
  await expect(page.locator('.market-row')).toHaveCount(0);
  await expect(page.locator('.market-empty')).toHaveCount(0);
  await expect(page.locator('.market-notice')).toBeVisible();
});
