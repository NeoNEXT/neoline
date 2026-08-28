import { fakeAsync, tick } from '@angular/core/testing';
import { of, Subject, throwError } from 'rxjs';

import { STORAGE_NAME } from '@popup/_lib';
import { PerpsMarket } from '@popup/_lib/perps';
import { PerpsCandleDatasetState } from '@/app/core/services/perps/perps-candle-dataset';

import { PerpsMarketComponent } from './perps-market.component';
import { ethCandle, ethMarket } from '../perps.test-fixture';

// 中间价略高于标记价格，当日下跌 1.28%：标题栏必须把两者区分开，
// 并按这个市场自己的精度报出涨跌。
const market = ethMarket({
  markPxExact: '1875.7',
  midPxExact: '1875.75',
  oraclePxExact: '1876',
  prevDayPxExact: '1900',
  changePercentExact: '-1.2789473684',
  changeAmountExact: '-24.25',
});

/** OnPush 意味着没被标记的视图会停止更新，所以测试可以盯住这一点。 */
const detector = () => jasmine.createSpyObj('ChangeDetectorRef', ['markForCheck']);

/** The 行情数据集 as this page uses it: one market, followed live. */
const markets = (overrides: any = {}) =>
  ({
    watchMarketDetail: () => new Subject(),
    ...overrides,
  } as any);

/** The 数据通道 as this page uses it: the connection, and nothing else. */
const channel = (overrides: any = {}) =>
  ({
    watchConnectionState: () => new Subject(),
    ...overrides,
  } as any);

/** 本页面视角下的 K 线数据集：一个状态，加上一次翻页请求。 */
const datasets = (overrides: any = {}) =>
  ({
    watchDataset: () => new Subject<PerpsCandleDatasetState>(),
    loadEarlier: () => undefined,
    ...overrides,
  } as any);

const build = (router: any = null) =>
  new PerpsMarketComponent(
    null,
    router,
    null,
    datasets(),
    detector(),
    null,
      markets()
    );

describe('PerpsMarketComponent live price', () => {
  it('quotes the live mid and ignores the trailing candle close', () => {
    const component = build();
    component.market = market;
    // K 线只有在有成交时才会印出，所以它绝不能决定标题栏的价格。
    component.candles = [ethCandle({ c: '1875.80' })];

    expect(component.displayPrice).toBe('1875.75');
    // ETH 的最小变动价位是两位小数（szDecimals 为 4）。
    expect(component.priceDecimals).toBe(2);
    expect(component.displayChangePercent).toBe(market.changePercentExact);

    component.candles = [ethCandle({ c: '1876.20' })];

    expect(component.displayPrice).toBe('1875.75');
  });

  it('follows the live market stream as new contexts arrive', () => {
    const component = build();
    component.market = market;
    component.market = {
      ...market,
      midPxExact: '1876.5',
      changePercentExact: '-1.2',
    };

    expect(component.displayPrice).toBe('1876.5');
    expect(component.displayChangePercent).toBe('-1.2');
  });

  it('falls back to the mark when the book reports no mid', () => {
    const component = build();
    component.market = { ...market, midPxExact: null };

    expect(component.displayPrice).toBe('1875.7');
    // 标题栏报的是标记价格，页面必须把这件事明说出来。
    expect(component.usingMid).toBeFalse();
  });

  it('quotes the 24h move as a percentage', () => {
    const component = build();
    component.market = market;

    expect(component.hasChange).toBeTrue();
    expect(component.displayChangePercent).toBe('-1.2789473684');
  });

  it('has no 24h change to show once the price kinds stop matching', () => {
    const component = build();
    component.market = {
      ...market,
      midPxExact: null,
      changePercentExact: null,
      changeAmountExact: null,
    };

    // 「无数据」，而不是平淡的 0% —— 页面不能凭空造出一个标记价格与中间价之间的比较。
    expect(component.hasChange).toBeFalse();
  });

  it('reads an absent funding rate as absent', () => {
    const component = build();

    expect(component.fundingPercent).toBe('--');
  });
});

describe('PerpsMarketComponent market status', () => {
  it('starts as loading rather than as an empty market', () => {
    const component = build();

    expect(component.marketStatus).toBe('loading');
    expect(component.isLoading).toBeTrue();
    expect(component.market).toBeUndefined();
  });

  it('reads the feed from the connection, not from message silence', () => {
    const component = build();
    component.connectionState = 'live';

    expect(component.isStale).toBeFalse();

    component.connectionState = 'stale';

    expect(component.isStale).toBeTrue();
  });
});

describe('PerpsMarketComponent trade entry', () => {
  const ready = (patch: Partial<PerpsMarket> = {}, router: any = null) => {
    const component = build(router);
    component.market = { ...market, ...patch };
    component.coin = component.market.coin;
    component.marketStatus = 'ready';
    component.connectionState = 'live';
    return component;
  };

  it('opens the entry on a live market with a two-sided book', () => {
    const component = ready();

    expect(component.canOrder).toBeTrue();
    expect(component.orderBlockedKey).toBe('');
  });

  it('closes the entry while the feed is not live', () => {
    const component = ready();
    component.connectionState = 'stale';

    expect(component.canOrder).toBeFalse();
    // 页面横幅解释的是数据，这段文案解释的是不可用的那个操作。
    expect(component.orderBlockedKey).toBe('perpsEntryStale');
  });

  it('keeps the entry closed while the feed is still connecting', () => {
    const component = ready();
    component.connectionState = 'connecting';

    expect(component.canOrder).toBeFalse();
    expect(component.orderBlockedKey).toBe('perpsEntryConnecting');
  });

  it('closes the entry on a market with no tradable mid', () => {
    const component = ready({ midPxExact: null });

    expect(component.canOrder).toBeFalse();
    expect(component.orderBlockedKey).toBe('perpsNoTwoSidedBook');
  });

  it('explains nothing while the market itself is still unknown', () => {
    const component = build();

    // 「加载中」已经解释了整个页面；此时还没有入口需要解释。
    expect(component.canOrder).toBeFalse();
    expect(component.orderBlockedKey).toBe('');
  });

  it('does not navigate out of a closed entry', () => {
    const router = jasmine.createSpyObj('Router', ['navigateByUrl']);
    const component = ready({ midPxExact: null }, router);

    component.toOrder('long');

    expect(router.navigateByUrl).not.toHaveBeenCalled();
  });

  it('navigates with the protocol coin once the entry is open', () => {
    const router = jasmine.createSpyObj('Router', ['navigateByUrl']);
    const component = ready({ coin: 'xyz:SNDK', midPxExact: '12.5' }, router);

    component.toOrder('short');

    expect(router.navigateByUrl).toHaveBeenCalledWith(
      '/popup/perps/order/xyz:SNDK?side=short'
    );
  });
});

describe('PerpsMarketComponent chart presentation', () => {
  const state = (
    patch: Partial<PerpsCandleDatasetState> = {}
  ): PerpsCandleDatasetState => ({
    availability: 'live',
    candles: [ethCandle()],
    updatedAt: 1,
    ...patch,
  });

  function showing() {
    const states = new Subject<PerpsCandleDatasetState>();
    const loadEarlier = jasmine.createSpy('loadEarlier');
    const cdr = detector();
    const component = new PerpsMarketComponent(
      null,
      null,
      null,
      datasets({ watchDataset: () => states, loadEarlier }),
      cdr,
      channel(),
      markets()
    );
    component.coin = 'ETH';
    (component as any).watchDataset();
    return { component, states, loadEarlier, cdr };
  }

  it('watches the dataset the market and interval name', () => {
    const watchDataset = jasmine
      .createSpy('watchDataset')
      .and.returnValue(new Subject());
    const component = new PerpsMarketComponent(
      null,
      null,
      null,
      datasets({ watchDataset }),
      detector(),
      channel(),
      markets()
    );
    component.coin = 'xyz:SNDK';
    component.interval = '1h';

    (component as any).watchDataset();

    expect(watchDataset).toHaveBeenCalledWith('xyz:SNDK', '1h');
    component.ngOnDestroy();
  });

  it('shows the bars the dataset reports', () => {
    const { component, states } = showing();

    states.next(state({ candles: [ethCandle({ t: 1000 })] }));

    expect(component.candles.map((candle) => candle.t)).toEqual([1000]);
    expect(component.chartLoading).toBeFalse();
    expect(component.chartLoadError).toBeFalse();
    expect(component.chartRecoveryError).toBeFalse();
    component.ngOnDestroy();
  });

  it('reads each kind of dataset state as its own screen', () => {
    const { component, states } = showing();

    states.next(state({ availability: 'loading', candles: [] }));
    expect(component.chartLoading).toBeTrue();

    states.next(state({ availability: 'unavailable', candles: [] }));
    expect(component.chartLoading).toBeFalse();
    expect(component.chartLoadError).toBeTrue();

    // 柱子又实时了，但断流期间收盘的那些仍然缺失 ——
    // 这与一张失败的图表是不同的提示。
    states.next(state({ availability: 'gapped' }));
    expect(component.chartLoadError).toBeFalse();
    expect(component.chartRecoveryError).toBeTrue();

    states.next(state());
    expect(component.chartRecoveryError).toBeFalse();
    component.ngOnDestroy();
  });

  it('takes every state but redraws once a second', fakeAsync(() => {
    const { component, states, cdr } = showing();
    // 先让种类稳定下来：这里量的是节流，而不是那种总会立即标记的种类变化。
    states.next(state({ candles: [ethCandle({ t: 1000 })] }));
    cdr.markForCheck.calls.reset();

    states.next(state({ candles: [ethCandle({ t: 61_000 })] }));
    states.next(state({ candles: [ethCandle({ t: 121_000 })] }));

    // 在 OnPush 下，若不加限制，每一帧都会让页面被检查一遍、画布被重绘一遍，
    // 只为把一根柱子挪动一个像素。
    expect(cdr.markForCheck).not.toHaveBeenCalled();
    // 两次重绘之间，页面持有的数据仍然是精确的。
    expect(component.candles.map((candle) => candle.t)).toEqual([121_000]);

    tick(1000);

    expect(cdr.markForCheck).toHaveBeenCalledTimes(1);
    component.ngOnDestroy();
  }));

  it('marks the view at once when the dataset changes kind', fakeAsync(() => {
    const { component, states, cdr } = showing();
    states.next(state());
    cdr.markForCheck.calls.reset();

    states.next(state({ availability: 'gapped' }));

    // 一张刚刚丢掉收盘柱子的图表，不是可以等到下一个节流窗口再说的消息。
    expect(cdr.markForCheck).toHaveBeenCalled();
    component.ngOnDestroy();
    tick(1000);
  }));

  it('asks the dataset for earlier bars at the left edge', () => {
    const { component, loadEarlier } = showing();
    component.interval = '15m';

    component.loadEarlierCandles();

    // 再往前是否还有东西可取，已经不再是页面的账本了。
    expect(loadEarlier).toHaveBeenCalledWith('ETH', '15m');
    component.ngOnDestroy();
  });

  it('names the dataset by market and interval', () => {
    const component = build();
    component.coin = 'xyz:SNDK';
    component.interval = '15m';

    expect(component.chartSeriesKey).toBe('xyz:SNDK:15m');
  });

  it('keeps the axis on the market tick when the price lands round', () => {
    const component = build();
    // NEO 的最小变动价位是四位小数（szDecimals 为 2）。一个恰好是 "1.68" 的中间价，不能把
    // 坐标轴拽到两位，那会把 1.6800 到 1.6900 之间的每一根 K 线都压到同一个标签上。
    component.market = { ...market, szDecimals: 2, midPxExact: '1.68' };

    expect(component.priceDecimals).toBe(4);
  });
});

describe('PerpsMarketComponent candle intervals', () => {
  function withStorage(saved: string | undefined) {
    const setStorage = jasmine.createSpy('setStorage');
    const cdr = detector();
    const component = new PerpsMarketComponent(
      null,
      null,
      { getStorage: () => of(saved), setStorage } as any,
      datasets(),
      cdr,
      channel(),
      markets()
    );
    component.coin = 'ETH';
    return { component, setStorage, cdr };
  }

  it('writes labels without ever moving off the protocol value', () => {
    const component = build();

    expect(component.intervalLabel('1d')).toBe('1D');
    expect(component.intervalLabel('1w')).toBe('1W');
    // 这两个若按不区分大小写来比较，就会被合并成一个。
    expect(component.intervalLabel('1M')).toBe('1M');
    expect(component.intervalLabel('1m')).toBe('1m');
  });

  it('names the current interval on the menu button only when it lives there', () => {
    const component = build();

    component.interval = '1d';
    expect(component.intervalMenuLabel).toBe('1D');

    // 15m 位于始终可见的那一行，所以这个按钮只是个入口。
    component.interval = '15m';
    expect(component.intervalMenuLabel).toBe('');
  });

  it('restores the interval the user last chose', () => {
    const { component, cdr } = withStorage('1h');

    (component as any).loadChartInterval();

    expect(component.interval).toBe('1h');
    expect(cdr.markForCheck).toHaveBeenCalled();
  });

  it('keeps its default when nothing has been chosen yet', () => {
    const { component } = withStorage(undefined);

    (component as any).loadChartInterval();

    expect(component.interval).toBe('15m');
  });

  it('ignores a stored interval this build no longer ships', () => {
    const watchDataset = jasmine
      .createSpy('watchDataset')
      .and.returnValue(new Subject());
    const component = new PerpsMarketComponent(
      null,
      null,
      { getStorage: () => of('4h'), setStorage: () => undefined } as any,
      datasets({ watchDataset }),
      detector(),
      channel(),
      markets()
    );
    component.coin = 'ETH';

    // 存储返回的是旧版本写进去的任意值。`4h` 是一个看起来合理、但本版本并不承载的周期，
    // 它绝不能到达数据集：按它换算请求窗口会在订阅建立之前就抛异常，于是图表会永远转圈，
    // 连个可以落地的错误路径都没有。
    expect(() => (component as any).loadChartInterval()).not.toThrow();
    expect(component.interval).toBe('15m');
    expect(watchDataset).toHaveBeenCalledWith('ETH', '15m');
    component.ngOnDestroy();
  });

  it('rejects a stored value that is a label rather than a protocol value', () => {
    const { component } = withStorage('1D');

    (component as any).loadChartInterval();

    // `1D` 是 `1d` 在屏幕上的写法。把它原样收回去，等于向交易场所
    // 请求一个它并不认识的周期。
    expect(component.interval).toBe('15m');
  });

  it('remembers a new choice globally rather than per market', () => {
    const { component, setStorage } = withStorage('15m');

    component.selectInterval('1M');

    expect(component.interval).toBe('1M');
    expect(setStorage).toHaveBeenCalledWith(
      STORAGE_NAME.perpsChartInterval,
      '1M'
    );
  });

  it('closes the menu without rewriting storage when the choice is unchanged', () => {
    const { component, setStorage } = withStorage('15m');
    component.showIntervalMenu = true;

    component.selectInterval('15m');

    expect(component.showIntervalMenu).toBeFalse();
    expect(setStorage).not.toHaveBeenCalled();
  });
});

describe('PerpsMarketComponent change detection', () => {
  // OnPush 用显式检查换掉了自动检查，所以它的失败形态是一块悄无声息不再动的屏幕。
  // 下面这些用例钉住了喂养它的那些路径。
  it('marks the view when the connection state changes', () => {
    const cdr = detector();
    const state = new Subject<string>();
    const component = new PerpsMarketComponent(
      { params: of({ coin: 'ETH' }) } as any,
      null,
      { getStorage: () => of(undefined), setStorage: () => undefined } as any,
      datasets(),
      cdr,
      channel({ watchConnectionState: () => state }),
      markets({ watchMarketDetail: () => new Subject() })
    );

    component.ngOnInit();
    cdr.markForCheck.calls.reset();
    state.next('stale');

    expect(component.isStale).toBeTrue();
    expect(cdr.markForCheck).toHaveBeenCalled();
    component.ngOnDestroy();
  });

  it('marks the view when the market feed delivers', () => {
    const cdr = detector();
    const feed = new Subject<PerpsMarket>();
    const component = new PerpsMarketComponent(null, null, null, datasets(), cdr,
      channel(),
      markets({ watchMarketDetail: () => feed })
    );
    component.coin = 'ETH';
    (component as any).loadMarket();

    feed.next(market);

    expect(component.marketStatus).toBe('ready');
    expect(cdr.markForCheck).toHaveBeenCalled();
  });

  it('leaves a failed snapshot as an error and does not retry it', fakeAsync(() => {
    const watchMarketDetail = jasmine
      .createSpy('watchMarketDetail')
      .and.returnValue(throwError(() => new Error('429')));
    const component = new PerpsMarketComponent(
      null,
      null,
      null,
      datasets(),
      detector(),
      channel(),
      markets({ watchMarketDetail })
    );
    component.coin = 'ETH';

    (component as any).loadMarket();
    tick(60_000);

    // 在用户正读着失败提示时悄悄自我重载的页面，从来没人要过；`fakeAsync` 在这里也会因为
    // 任何遗留的定时器而失败，所以重试不可能悄悄溜回来。
    expect(component.marketStatus).toBe('error');
    expect(watchMarketDetail).toHaveBeenCalledTimes(1);
  }));

  it('marks the view when the market turns out not to exist', () => {
    const cdr = detector();
    const component = new PerpsMarketComponent(
      null,
      null,
      null,
      datasets(),
      cdr,
      channel(),
      markets({ watchMarketDetail: () => of(null) })
    );
    component.coin = 'NOPE';

    (component as any).loadMarket();

    expect(component.marketStatus).toBe('missing');
    expect(cdr.markForCheck).toHaveBeenCalled();
  });

  it('marks the view on every countdown tick', () => {
    const cdr = detector();
    const component = new PerpsMarketComponent(null, null, null, datasets(), cdr,
      channel(),
      markets()
    );

    (component as any).tickCountdown();

    expect(component.fundingCountdown).toMatch(/^\d{2}:\d{2}:\d{2}$/);
    expect(cdr.markForCheck).toHaveBeenCalled();
  });
});

describe('PerpsMarketComponent coin switcher', () => {
  it('opens and closes from the header control', () => {
    const component = build();

    component.toggleCoinMenu();

    expect(component.showCoinMenu).toBeTrue();

    component.toggleCoinMenu();

    expect(component.showCoinMenu).toBeFalse();
  });

  it('drops the keyword with the menu rather than reopening on it', () => {
    const component = build();
    component.toggleCoinMenu();
    component.coinKeyword = 'BTC';

    component.closeCoinMenu();

    // 带着上次的搜索词重新打开，只会显示一个市场，
    // 而它会被读成整个交易场所。
    expect(component.coinKeyword).toBe('');
  });

  it('marks the view so the menu appears under OnPush', () => {
    const cdr = detector();
    const component = new PerpsMarketComponent(null, null, null, datasets(), cdr,
      channel(),
      markets()
    );

    component.toggleCoinMenu();

    expect(cdr.markForCheck).toHaveBeenCalled();
  });

  it('closes once the route lands on another market', () => {
    const params = new Subject<any>();
    const component = new PerpsMarketComponent(
      { params } as any,
      null,
      { getStorage: () => of(undefined), setStorage: () => undefined } as any,
      datasets(),
      detector(),
      channel({ watchConnectionState: () => new Subject() }),
      markets({ watchMarketDetail: () => new Subject() })
    );
    component.ngOnInit();
    params.next({ coin: 'ETH' });
    component.toggleCoinMenu();
    component.coinKeyword = 'BT';

    params.next({ coin: 'BTC' });

    // 留着不关，这个菜单就会挡住它当初被打开去寻找的那个市场。
    expect(component.showCoinMenu).toBeFalse();
    expect(component.coinKeyword).toBe('');
    component.ngOnDestroy();
  });
});

describe('PerpsMarketComponent route changes', () => {
  function routed(params: Subject<any>, feed: Subject<PerpsMarket | null>) {
    const cdr = detector();
    const component = new PerpsMarketComponent(
      { params } as any,
      null,
      { getStorage: () => of(undefined), setStorage: () => undefined } as any,
      datasets(),
      cdr,
      channel({ watchConnectionState: () => new Subject() }),
      markets({ watchMarketDetail: () => feed })
    );
    component.ngOnInit();
    return component;
  }

  it('follows the route parameter instead of a snapshot read once', () => {
    const params = new Subject<any>();
    const feed = new Subject<PerpsMarket | null>();
    const component = routed(params, feed);

    params.next({ coin: 'ETH' });
    feed.next(market);

    expect(component.coin).toBe('ETH');
    expect(component.marketStatus).toBe('ready');

    // 参数变化时 Angular 会复用这个组件，所以没有这条流的话，
    // 第二个市场会渲染出第一个市场的数字。
    params.next({ coin: 'BTC' });

    expect(component.coin).toBe('BTC');
    expect(component.marketStatus).toBe('loading');
    expect(component.market).toBeUndefined();
    component.ngOnDestroy();
  });

  it('clears the previous market candles as soon as the route changes', () => {
    const params = new Subject<any>();
    const feed = new Subject<PerpsMarket | null>();
    const component = routed(params, feed);
    params.next({ coin: 'ETH' });
    component.candles = [ethCandle({ s: 'ETH' })];
    component.chartLoading = false;

    params.next({ coin: 'BTC' });

    expect(component.candles).toEqual([]);
    component.ngOnDestroy();
  });

  it('reports a market the exchange does not carry', () => {
    const params = new Subject<any>();
    const feed = new Subject<PerpsMarket | null>();
    const component = routed(params, feed);

    params.next({ coin: 'NOSUCHCOIN' });
    feed.next(null);

    expect(component.marketStatus).toBe('missing');
    expect(component.canOrder).toBeFalse();
    component.ngOnDestroy();
  });
});
