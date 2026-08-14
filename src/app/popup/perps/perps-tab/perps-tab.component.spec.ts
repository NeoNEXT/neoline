import { PerpsMarket } from '@popup/_lib/perps';

import { PerpsTabComponent } from './perps-tab.component';

describe('PerpsTabComponent market list', () => {
  const market = (overrides: Partial<PerpsMarket> = {}): PerpsMarket => ({
    key: 'hl:ETH',
    assetId: 4,
    dex: '',
    dexAssetIndex: 4,
    coin: 'ETH',
    symbol: 'ETH',
    szDecimals: 4,
    maxLeverage: 25,
    onlyIsolated: false,
    markPxExact: '1885.8',
    midPxExact: '1885.7',
    oraclePxExact: '1884.4',
    prevDayPxExact: '1884.5',
    changePercentExact: '0.0636',
    dayVolumeExact: '1563608.19928',
    openInterestSizeExact: '1346.6006',
    openInterestExact: '2539501',
    fundingExact: '0.0000125',
    ...overrides,
  });

  const chromeStub = {
    getStorage: () => ({ subscribe: () => undefined }),
    setStorage: () => undefined,
  } as any;
  const component = () =>
    new PerpsTabComponent(null, null, null, chromeStub);

  it('quotes the mid, and says so when it has to quote the mark instead', () => {
    const value = component();
    const withBook = market();
    // PURR and CASHCAT are live on testnet with no two-sided book at all.
    const noBook = market({
      key: 'hl:PURR',
      coin: 'PURR',
      symbol: 'PURR',
      midPxExact: null,
      changePercentExact: null,
    });

    expect(value.listPrice(withBook)).toBe('1885.7');
    expect(value.usingMarkPrice(withBook)).toBeFalse();

    // The row still shows a price, but never one the user could trade at
    // without being told which kind it is.
    expect(value.listPrice(noBook)).toBe('1885.8');
    expect(value.usingMarkPrice(noBook)).toBeTrue();
    // And the change stays absent rather than being computed mark-against-mid.
    expect(noBook.changePercentExact).toBeNull();
  });

  it('searches the display symbol, not the prefixed protocol coin', () => {
    const value = component();
    value.markets = [
      market(),
      market({
        key: 'neol:IWM',
        dex: 'neol',
        coin: 'neol:IWM',
        symbol: 'IWM',
      }),
      market({ key: 'hl:NEO', coin: 'NEO', symbol: 'NEO' }),
    ];

    value.keyword = 'NEO';
    value.onKeywordChange();

    // "NEOL:IWM" contains "NEO"; the market named NEO is the only real match.
    // It lands in the pinned block because NEO is a Neo ecosystem market.
    expect(value.pinnedMarkets.map((item) => item.symbol)).toEqual(['NEO']);
    expect(value.visibleMarkets).toEqual([]);

    value.keyword = 'IWM';
    value.onKeywordChange();

    expect(value.visibleMarkets.map((item) => item.key)).toEqual(['neol:IWM']);
  });

  it('locates a position market by key so HIP-3 namesakes stay apart', () => {
    const value = component();
    const canonical = market({ key: 'hl:IWM', coin: 'IWM', symbol: 'IWM' });
    const hip3 = market({
      key: 'neol:IWM',
      dex: 'neol',
      coin: 'neol:IWM',
      symbol: 'IWM',
      szDecimals: 2,
    });
    value.markets = [canonical, hip3];

    expect(
      value.marketFor({ key: 'neol:IWM', symbol: 'IWM' } as any)
    ).toBe(hip3);
  });

  it('freezes row order across live price updates', () => {
    const value = component();
    const small = market({ key: 'hl:SMALL', coin: 'SMALL', symbol: 'SMALL', dayVolumeExact: '100' });
    const big = market({ key: 'hl:BIG', coin: 'BIG', symbol: 'BIG', dayVolumeExact: '900' });
    value.markets = [small, big];
    value.onKeywordChange();

    expect(value.visibleMarkets.map((m) => m.symbol)).toEqual(['BIG', 'SMALL']);

    // The small market overtakes on volume; the row order must not follow it
    // while the user is looking at — and possibly tapping — the list.
    value.markets = [
      { ...small, dayVolumeExact: '9000' },
      { ...big, dayVolumeExact: '900' },
    ];
    (value as any).renderRows();

    expect(value.visibleMarkets.map((m) => m.symbol)).toEqual(['BIG', 'SMALL']);
    expect(value.visibleMarkets[1].dayVolumeExact).toBe('9000');

    // Only a deliberate action reorders — here, editing the search box.
    value.onKeywordChange();
    expect(value.visibleMarkets.map((m) => m.symbol)).toEqual(['SMALL', 'BIG']);
  });

  it('flips direction when the active sort key is tapped again', () => {
    const value = component();
    value.markets = [
      market({ key: 'hl:A', coin: 'A', symbol: 'A', dayVolumeExact: '100' }),
      market({ key: 'hl:B', coin: 'B', symbol: 'B', dayVolumeExact: '900' }),
    ];
    value.onKeywordChange();

    value.setSortKey('volume');
    expect(value.sortDirection).toBe('asc');
    expect(value.visibleMarkets.map((m) => m.symbol)).toEqual(['A', 'B']);

    value.setSortKey('volume');
    expect(value.sortDirection).toBe('desc');
    expect(value.visibleMarkets.map((m) => m.symbol)).toEqual(['B', 'A']);
  });

  it('sinks markets with no computable change when sorting by change', () => {
    const value = component();
    value.markets = [
      market({ key: 'hl:NOCHG', coin: 'NOCHG', symbol: 'NOCHG', changePercentExact: null }),
      market({ key: 'hl:DOWN', coin: 'DOWN', symbol: 'DOWN', changePercentExact: '-9' }),
      market({ key: 'hl:UP', coin: 'UP', symbol: 'UP', changePercentExact: '4' }),
    ];
    value.onKeywordChange();
    value.setSortKey('change');

    expect(value.visibleMarkets.map((m) => m.symbol)).toEqual([
      'UP',
      'DOWN',
      'NOCHG',
    ]);
  });

  it('batches a long market list instead of truncating it', () => {
    const value = component();
    // Testnet lists 157 tradable markets; the old list stopped at 30.
    value.markets = new Array(157).fill(null).map((_, i) =>
      market({
        key: `hl:M${i}`,
        coin: `M${i}`,
        symbol: `M${i}`,
        dayVolumeExact: String(1000 - i),
      })
    );
    value.onKeywordChange();

    expect(value.visibleMarkets.length).toBe(30);
    expect(value.hasMore).toBeTrue();

    value.loadMore();
    expect(value.visibleMarkets.length).toBe(60);

    for (let i = 0; i < 4; i++) {
      value.loadMore();
    }
    expect(value.visibleMarkets.length).toBe(157);
    expect(value.hasMore).toBeFalse();
  });
});
