import { SimpleChange } from '@angular/core';
import { EMPTY, Subject } from 'rxjs';

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

  /**
   * 接在一条真实的数据集订阅上。
   *
   * 直接调 `renderRows()` 的用例摸不到 `watchMarkets()` 里那段「集合变了没有」的判据，
   * 而行序冻结正是在那里被打破的 —— 所以这些用例必须从帧推进去。
   */
  const listWithFeed = () => {
    const states = new Subject<any>();
    const value = new PerpsMarketListComponent(
      null,
      { watchMarkets: () => states.asObservable() } as any,
      { watchConnectionState: () => EMPTY } as any
    );
    value.ngOnInit();
    const frame = (markets: PerpsMarket[]) =>
      states.next({ availability: 'live', markets, updatedAt: 1 });
    return { value, frame, states };
  };

  const named = (symbol: string, dayVolumeExact: string) =>
    market({ key: `hl:${symbol}`, coin: symbol, symbol, dayVolumeExact });

  /** 40 个命中 `TA` 的市场，外加 20 个不命中的。 */
  const mixedMarkets = () => [
    ...Array.from({ length: 40 }, (_, i) => named(`TA${i}`, String(1000 - i))),
    ...Array.from({ length: 20 }, (_, i) => named(`B${i}`, String(500 - i))),
  ];

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

  it('reports no price rather than a zero the market never printed', () => {
    const value = component();
    // `perpsFiniteDecimal` 在 `markPx` 缺失或解析不出时返回 `'0'`，而 `'0'` 是真值。
    const broken = market({
      key: 'hl:BROKEN',
      coin: 'BROKEN',
      symbol: 'BROKEN',
      midPxExact: null,
      markPxExact: '0',
    });

    expect(value.listPrice(broken)).toBeNull();
    // 这一行报不出价格，所以它也没有「标记价」可标 —— `$0 标记价` 会读成一个真实的报价。
    expect(value.usingMarkPrice(broken)).toBeFalse();
  });

  it('does not let a zero mid stand in for the mark price', () => {
    const value = component();
    // `marketContextFields` 已经把非正的 mid 归成 null，但这一行不依赖上游的好意。
    const zeroMid = market({
      key: 'hl:ZEROMID',
      coin: 'ZEROMID',
      symbol: 'ZEROMID',
      midPxExact: '0',
      markPxExact: '1885.8',
    });

    expect(value.listPrice(zeroMid)).toBe('1885.8');
    expect(value.usingMarkPrice(zeroMid)).toBeTrue();
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

  it('keeps the frozen order and the paging while a keyword is active', () => {
    const { value, frame } = listWithFeed();
    const markets = mixedMarkets();
    frame(markets);
    search(value, 'TA');
    value.loadMore();

    // 一帧里只有价格动了，市场集合一个没变。
    frame(
      markets.map((item) =>
        item.symbol === 'TA39' ? { ...item, dayVolumeExact: '99999' } : item
      )
    );

    // 判据若拿冻结的键去比**未筛选**的全集，长度就恒不相等：这里会读到 30 行、
    // 首行变成 TA39 —— 用户点过的「加载更多」作废，而一个市场爬到了他正要点的那一行前面。
    expect(value.visibleMarkets.length).toBe(40);
    expect(value.visibleMarkets[0].symbol).toBe('TA0');
    expect(value.hasMore).toBeFalse();
  });

  it('still reorders when a newly listed market matches the keyword', () => {
    const { value, frame } = listWithFeed();
    const markets = mixedMarkets();
    frame(markets);
    search(value, 'TA');

    frame([...markets, named('TA99', '99999')]);

    // 新上架必须进入顺序 —— 这条判据收紧之后不能变成「永远不重排」。
    expect(value.visibleMarkets[0].symbol).toBe('TA99');
  });

  it('leaves the rows alone when the change is outside the keyword', () => {
    const { value, frame } = listWithFeed();
    const markets = mixedMarkets();
    frame(markets);
    search(value, 'TA');
    value.loadMore();

    // B19 下架了。屏幕上这 40 行一个都没受影响，所以没有理由重排它们。
    frame(markets.filter((item) => item.symbol !== 'B19'));

    expect(value.visibleMarkets.length).toBe(40);
    expect(value.visibleMarkets[0].symbol).toBe('TA0');

    // 清掉关键词才把新的集合读进来。
    search(value, '');
    expect(value.totalMarketCount).toBe(59);
  });

  it('says so when the list is missing an entire DEX', () => {
    const { value, states } = listWithFeed();
    const markets = mixedMarkets();

    // 某个 HIP-3 DEX 的快照失败了：标准永续的市场照常发布，但列表少了一整个 DEX。
    states.next({ availability: 'incomplete', markets, updatedAt: 1 });

    expect(value.marketsIncomplete).toBeTrue();
    // 行照画 —— 拿到的那部分是真的，藏起来只会让用户什么都做不了。
    expect(value.visibleMarkets.length).toBe(30);
    expect(value.marketLoadError).toBeFalse();
  });

  it('does not call a market missing when it never asked for that DEX', () => {
    const { value, states } = listWithFeed();
    states.next({ availability: 'incomplete', markets: mixedMarkets(), updatedAt: 1 });
    search(value, 'NOTHINGMATCHES');

    // 「没有找到市场」是一个确定的否定答案，而我们并没有问全。
    expect(value.totalMarketCount).toBe(0);
    expect(value.marketsIncomplete).toBeTrue();
  });

  it('clears the incomplete notice once a full snapshot lands', () => {
    const { value, states } = listWithFeed();
    const markets = mixedMarkets();
    states.next({ availability: 'incomplete', markets, updatedAt: 1 });

    // 断线对「列表全不全」一无所知，所以它不能把这条提示抹掉。
    states.next({ availability: 'stale', markets, updatedAt: 1 });
    expect(value.marketsIncomplete).toBeTrue();

    // 重连之后的那次快照才有资格改它。
    states.next({ availability: 'live', markets, updatedAt: 2 });
    expect(value.marketsIncomplete).toBeFalse();
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
