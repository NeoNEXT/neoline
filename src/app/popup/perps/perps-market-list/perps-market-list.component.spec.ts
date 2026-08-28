import { SimpleChange } from '@angular/core';

import { PerpsMarket } from '@popup/_lib/perps';

import { PerpsMarketListComponent } from './perps-market-list.component';
import { ethMarket } from '../perps.test-fixture';

describe('PerpsMarketListComponent', () => {
  /** Mid and mark deliberately differ, so a row quoting the wrong one shows. */
  const market = (overrides: Partial<PerpsMarket> = {}): PerpsMarket =>
    ethMarket({ markPxExact: '1885.8', midPxExact: '1885.7', ...overrides });

  const component = () => new PerpsMarketListComponent(null, null, null);

  /** The keyword arrives as an input, so searching is an `ngOnChanges`. */
  const search = (value: PerpsMarketListComponent, keyword = '') => {
    value.keyword = keyword;
    value.ngOnChanges({ keyword: new SimpleChange('', keyword, false) });
  };

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

    search(value, 'NEO');

    // "NEOL:IWM" contains "NEO"; the market named NEO is the only real match.
    // It lands in the pinned block because NEO is a Neo ecosystem market.
    expect(value.pinnedMarkets.map((item) => item.symbol)).toEqual(['NEO']);
    expect(value.visibleMarkets).toEqual([]);

    search(value, 'IWM');

    expect(value.visibleMarkets.map((item) => item.key)).toEqual(['neol:IWM']);
  });

  it('freezes row order across live price updates', () => {
    const value = component();
    const small = market({ key: 'hl:SMALL', coin: 'SMALL', symbol: 'SMALL', dayVolumeExact: '100' });
    const big = market({ key: 'hl:BIG', coin: 'BIG', symbol: 'BIG', dayVolumeExact: '900' });
    value.markets = [small, big];
    search(value);

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
    search(value);
    expect(value.visibleMarkets.map((m) => m.symbol)).toEqual(['SMALL', 'BIG']);
  });

  // There is no ascending order to fall into: re-picking the active key is a
  // no-op rather than a hidden reversal.
  it('always ranks highest-first, however often a key is picked', () => {
    const value = component();
    value.markets = [
      market({ key: 'hl:A', coin: 'A', symbol: 'A', dayVolumeExact: '100' }),
      market({ key: 'hl:B', coin: 'B', symbol: 'B', dayVolumeExact: '900' }),
    ];
    search(value);

    expect(value.visibleMarkets.map((m) => m.symbol)).toEqual(['B', 'A']);

    value.setSortKey('volume');
    expect(value.visibleMarkets.map((m) => m.symbol)).toEqual(['B', 'A']);

    value.setSortKey('volume');
    expect(value.visibleMarkets.map((m) => m.symbol)).toEqual(['B', 'A']);
  });

  it('sinks markets with no computable change when sorting by change', () => {
    const value = component();
    value.markets = [
      market({ key: 'hl:NOCHG', coin: 'NOCHG', symbol: 'NOCHG', changePercentExact: null }),
      market({ key: 'hl:DOWN', coin: 'DOWN', symbol: 'DOWN', changePercentExact: '-9' }),
      market({ key: 'hl:UP', coin: 'UP', symbol: 'UP', changePercentExact: '4' }),
    ];
    search(value);
    value.setSortKey('change');

    expect(value.visibleMarkets.map((m) => m.symbol)).toEqual([
      'UP',
      'DOWN',
      'NOCHG',
    ]);
  });

  it('closes the sort menu once a key is chosen, and labels the choice', () => {
    const value = component();
    value.markets = [market()];
    search(value);
    value.sortMenuOpen = true;

    value.setSortKey('change');

    expect(value.sortMenuOpen).toBeFalse();
    expect(value.sortKeyLabel).toBe('perpsSortChange');
  });

  it('opens on volume, and lets a sort go no further than the visit', () => {
    const value = component();
    value.showSort = true;

    expect(value.sortKey).toBe('volume');

    value.setSortKey('change');

    // The choice holds while the page is open and is never written down: the
    // next visit asks its own question rather than inheriting one the user
    // cannot see the reason for. The list holds no storage at all now, so
    // there is nowhere for the choice to leak to.
    expect(value.sortKey).toBe('change');
  });

  it('reports the pick as well as routing to it', () => {
    const router = jasmine.createSpyObj('Router', ['navigateByUrl']);
    const value = new PerpsMarketListComponent(router, null, null);
    const picked: string[] = [];
    value.marketSelected.subscribe((coin) => picked.push(coin));

    value.toMarket('ETH');

    expect(router.navigateByUrl).toHaveBeenCalledWith('/popup/perps/market/ETH');
    // A host that renders this list inside something dismissable cannot wait
    // for the route: picking the market already open routes nowhere.
    expect(picked).toEqual(['ETH']);
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
    search(value);

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
