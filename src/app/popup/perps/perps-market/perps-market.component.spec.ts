import { fakeAsync, tick } from '@angular/core/testing';
import { of, Subject, throwError } from 'rxjs';

import { STORAGE_NAME } from '@popup/_lib';
import { PerpsMarket } from '@popup/_lib/perps';
import { PerpsCandleDatasetState } from '@/app/core/services/perps/perps-candle-dataset';

import { PerpsMarketComponent } from './perps-market.component';
import { ethCandle, ethMarket } from '../perps.test-fixture';

// A mid a hair above the mark, down 1.28% on the day: the header has to keep
// the two apart and quote the move at the market's own precision.
const market = ethMarket({
  markPxExact: '1875.7',
  midPxExact: '1875.75',
  oraclePxExact: '1876',
  prevDayPxExact: '1900',
  changePercentExact: '-1.2789473684',
  changeAmountExact: '-24.25',
});

/** OnPush means an unmarked view stops updating, so tests can watch for it. */
const detector = () => jasmine.createSpyObj('ChangeDetectorRef', ['markForCheck']);

/**
 * The feed as this page uses it, over the answers that change nothing. Candles
 * no longer come through here at all — the page reads a dataset instead.
 */
const service = (overrides: any = {}) =>
  ({
    subscribe: () => new Subject(),
    ...overrides,
  } as any);

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

/** The candle dataset as this page uses it: one state, and a paging request. */
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
    // A candle only prints on a trade, so it must never set the header price.
    component.candles = [ethCandle({ c: '1875.80' })];

    expect(component.displayPrice).toBe('1875.75');
    // ETH ticks at two decimals (szDecimals 4).
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
    // The header is quoting a mark, which the page has to say out loud.
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

    // "No data", not a flat 0% — the page must not invent a comparison
    // between a mark and a mid.
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
    // The page banner explains the data; this copy explains the unavailable action.
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

    // "Loading" already explains the whole page; there is no entry yet to explain.
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
      service(),
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
      service(),
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

    // Bars are live again, but the ones that closed while the feed was down
    // are still missing — a different message from a chart that failed.
    states.next(state({ availability: 'gapped' }));
    expect(component.chartLoadError).toBeFalse();
    expect(component.chartRecoveryError).toBeTrue();

    states.next(state());
    expect(component.chartRecoveryError).toBeFalse();
    component.ngOnDestroy();
  });

  it('takes every state but redraws once a second', fakeAsync(() => {
    const { component, states, cdr } = showing();
    // Settle on a kind first: this measures the rationing, not the change of
    // kind that always marks at once.
    states.next(state({ candles: [ethCandle({ t: 1000 })] }));
    cdr.markForCheck.calls.reset();

    states.next(state({ candles: [ethCandle({ t: 61_000 })] }));
    states.next(state({ candles: [ethCandle({ t: 121_000 })] }));

    // Under OnPush each frame would otherwise have the page checked and the
    // canvas repainted to move one bar by a pixel.
    expect(cdr.markForCheck).not.toHaveBeenCalled();
    // What the page holds is still exact between redraws.
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

    // A chart that has just lost its closed bars is not news that can wait
    // for the next throttle window.
    expect(cdr.markForCheck).toHaveBeenCalled();
    component.ngOnDestroy();
    tick(1000);
  }));

  it('asks the dataset for earlier bars at the left edge', () => {
    const { component, loadEarlier } = showing();
    component.interval = '15m';

    component.loadEarlierCandles();

    // Whether there is anything further back to ask for is not the page's
    // bookkeeping any more.
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
    // NEO ticks at four decimals (szDecimals 2). A mid that happens to be
    // "1.68" must not drag the axis down to two, which would flatten every
    // candle between 1.6800 and 1.6900 onto one label.
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
      service(),
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
    // The two that a case-insensitive comparison would collapse into one.
    expect(component.intervalLabel('1M')).toBe('1M');
    expect(component.intervalLabel('1m')).toBe('1m');
  });

  it('names the current interval on the menu button only when it lives there', () => {
    const component = build();

    component.interval = '1d';
    expect(component.intervalMenuLabel).toBe('1D');

    // 15m sits in the always-visible row, so the button is just a way in.
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
      service(),
      datasets({ watchDataset }),
      detector(),
      channel(),
      markets()
    );
    component.coin = 'ETH';

    // Storage answers with whatever an older build wrote. `4h` is a plausible
    // interval this one does not carry, and it must not reach the dataset:
    // sizing a request window from it throws before the subscription exists,
    // so the chart would spin forever with no error path to land in.
    expect(() => (component as any).loadChartInterval()).not.toThrow();
    expect(component.interval).toBe('15m');
    expect(watchDataset).toHaveBeenCalledWith('ETH', '15m');
    component.ngOnDestroy();
  });

  it('rejects a stored value that is a label rather than a protocol value', () => {
    const { component } = withStorage('1D');

    (component as any).loadChartInterval();

    // `1D` is how `1d` is written on screen. Taking it back in would ask the
    // exchange for an interval it does not know.
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
  // OnPush trades automatic checks for explicit ones, so the failure mode is
  // a screen that quietly stops moving. These pin the paths that feed it.
  it('marks the view when the connection state changes', () => {
    const cdr = detector();
    const state = new Subject<string>();
    const component = new PerpsMarketComponent(
      { params: of({ coin: 'ETH' }) } as any,
      null,
      { getStorage: () => of(undefined), setStorage: () => undefined } as any,
      service({
      }),
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
    const component = new PerpsMarketComponent(null, null, null, {
    } as any,
 datasets(), cdr,
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
      null,
      datasets(),
      detector(),
      channel(),
      markets({ watchMarketDetail })
    );
    component.coin = 'ETH';

    (component as any).loadMarket();
    tick(60_000);

    // A page that quietly reloads itself while the user is reading the failure
    // was never asked for; `fakeAsync` also fails here on any timer left
    // behind, so a retry cannot creep back in unnoticed.
    expect(component.marketStatus).toBe('error');
    expect(watchMarketDetail).toHaveBeenCalledTimes(1);
  }));

  it('marks the view when the market turns out not to exist', () => {
    const cdr = detector();
    const component = new PerpsMarketComponent(
      null,
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
    const component = new PerpsMarketComponent(null, null, null, null, datasets(), cdr,
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

    // Reopening on the last search would show one market and read as the
    // whole exchange.
    expect(component.coinKeyword).toBe('');
  });

  it('marks the view so the menu appears under OnPush', () => {
    const cdr = detector();
    const component = new PerpsMarketComponent(null, null, null, null, datasets(), cdr,
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
      service({
      }),
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

    // Left up, the menu would be covering the market it was opened to find.
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
      service({
      }),
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

    // Angular reuses this component across a parameter change, so without the
    // stream the second market would render the first one's numbers.
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
