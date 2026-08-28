import { SimpleChange } from '@angular/core';

import { PerpsMarket } from '@popup/_lib/perps';

import { PerpsMarketListComponent } from './perps-market-list.component';
import { ethMarket } from '../perps.test-fixture';

describe('PerpsMarketListComponent', () => {
  /** 中间价与标记价格刻意取不同的值，这样报错了价格种类的行就会露馅。 */
  const market = (overrides: Partial<PerpsMarket> = {}): PerpsMarket =>
    ethMarket({ markPxExact: '1885.8', midPxExact: '1885.7', ...overrides });

  const component = () => new PerpsMarketListComponent(null, null, null);

  /** 关键词是以 input 传进来的，所以搜索表现为一次 `ngOnChanges`。 */
  const search = (value: PerpsMarketListComponent, keyword = '') => {
    value.keyword = keyword;
    value.ngOnChanges({ keyword: new SimpleChange('', keyword, false) });
  };

  it('quotes the mid, and says so when it has to quote the mark instead', () => {
    const value = component();
    const withBook = market();
    // PURR 和 CASHCAT 在测试网上是活跃的，但完全没有双边盘口。
    const noBook = market({
      key: 'hl:PURR',
      coin: 'PURR',
      symbol: 'PURR',
      midPxExact: null,
      changePercentExact: null,
    });

    expect(value.listPrice(withBook)).toBe('1885.7');
    expect(value.usingMarkPrice(withBook)).toBeFalse();

    // 这一行仍然显示一个价格，但绝不会在不告诉用户它是哪种价格的前提下，
    // 显示一个用户其实成交不了的价格。
    expect(value.listPrice(noBook)).toBe('1885.8');
    expect(value.usingMarkPrice(noBook)).toBeTrue();
    // 涨跌同样保持缺失，而不是拿标记价格去和中间价相减算出来。
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

    // "NEOL:IWM" 里含有 "NEO"；名为 NEO 的那个市场才是唯一真正的匹配。
    // 它会落在置顶区，因为 NEO 属于 Neo 生态市场。
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

    // 小市场在成交量上反超了；但当用户正在看 —— 甚至正要点 —— 这个列表时，
    // 行的顺序不能跟着变。
    value.markets = [
      { ...small, dayVolumeExact: '9000' },
      { ...big, dayVolumeExact: '900' },
    ];
    (value as any).renderRows();

    expect(value.visibleMarkets.map((m) => m.symbol)).toEqual(['BIG', 'SMALL']);
    expect(value.visibleMarkets[1].dayVolumeExact).toBe('9000');

    // 只有刻意的动作才会重排 —— 这里是编辑搜索框。
    search(value);
    expect(value.visibleMarkets.map((m) => m.symbol)).toEqual(['SMALL', 'BIG']);
  });

  // 没有「升序」可以退回去：重新点选当前生效的排序键是空操作，
  // 而不是一次隐式的反向排序。
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

    // 这个选择只在页面打开期间有效，并且从不写下来：下一次访问会自己问一遍，而不是继承
    // 一个用户看不出缘由的旧选择。现在这个列表完全不持有任何存储，所以这个选择也无处可漏。
    expect(value.sortKey).toBe('change');
  });

  it('reports the pick as well as routing to it', () => {
    const router = jasmine.createSpyObj('Router', ['navigateByUrl']);
    const value = new PerpsMarketListComponent(router, null, null);
    const picked: string[] = [];
    value.marketSelected.subscribe((coin) => picked.push(coin));

    value.toMarket('ETH');

    expect(router.navigateByUrl).toHaveBeenCalledWith('/popup/perps/market/ETH');
    // 把这个列表渲染在某个可关闭容器里的宿主，等不到路由：
    // 点选当前已经打开的那个市场并不会路由到任何地方。
    expect(picked).toEqual(['ETH']);
  });

  it('batches a long market list instead of truncating it', () => {
    const value = component();
    // 测试网上有 157 个可交易市场；旧的列表到 30 个就停了。
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
