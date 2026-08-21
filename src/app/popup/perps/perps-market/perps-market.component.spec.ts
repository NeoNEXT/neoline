import { fakeAsync, tick } from '@angular/core/testing';
import { of, Subject, throwError } from 'rxjs';

import { STORAGE_NAME } from '@popup/_lib';
import { PerpsCandle, PerpsMarket, PERPS_CANDLE_LIMIT } from '@popup/_lib/perps';

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
 * The feed as this page uses it, over the answers that change nothing: no
 * candles remembered from an earlier visit, and a channel that never speaks.
 * A test then states only the calls its assertions rest on.
 */
const service = (overrides: any = {}) =>
  ({
    cachedCandles: () => null,
    rememberCandles: () => undefined,
    subscribe: () => new Subject(),
    ...overrides,
  } as any);

const build = (router: any = null) =>
  new PerpsMarketComponent(null, router, null, null, detector());

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

describe('PerpsMarketComponent chart dataset', () => {
  const at = (t: number, close = '100'): PerpsCandle =>
    ethCandle({ t, T: t + 59_999, c: close });

  function watching(initial: PerpsCandle[]) {
    const frames = new Subject<PerpsCandle>();
    const cdr = detector();
    const component = new PerpsMarketComponent(
      null,
      null,
      null,
      service({ subscribe: () => frames }),
      cdr
    );
    component.coin = 'ETH';
    component.candles = initial;
    (component as any).watchCandles();
    return { component, frames, cdr };
  }

  it('replaces the trailing bar while it is still open', () => {
    const { component, frames, cdr } = watching([at(1000), at(61_000)]);

    frames.next(at(61_000, '111'));

    expect(component.candles.length).toBe(2);
    expect(component.candles[1].c).toBe('111');
    // Under OnPush a frame that does not mark the view is a chart that stops.
    expect(cdr.markForCheck).toHaveBeenCalled();
  });

  it('appends a new bar instead of trimming the oldest', () => {
    const { component, frames } = watching([at(1000), at(61_000)]);

    frames.next(at(121_000));

    // The first bar has to survive: dropping it moves the dataset's starting
    // point, and that is precisely how the chart tells one dataset from
    // another — so a trimmed window redraws everything and throws away the
    // zoom the user chose.
    expect(component.candles.length).toBe(3);
    expect(component.candles[0].t).toBe(1000);
  });

  it('ignores a frame for a bar older than the one on screen', () => {
    const { component, frames } = watching([at(1000), at(61_000)]);

    frames.next(at(1000, '77'));

    expect(component.candles.length).toBe(2);
    expect(component.candles[0].c).toBe('100');
  });

  it('folds every frame but refreshes the view once a second', fakeAsync(() => {
    const { component, frames, cdr } = watching([at(1000), at(61_000)]);
    cdr.markForCheck.calls.reset();

    frames.next(at(61_000, '101'));
    frames.next(at(61_000, '102'));
    frames.next(at(61_000, '103'));

    // The first frame is instant: a chart that waited a second before moving
    // would read as one that had not loaded.
    expect(cdr.markForCheck).toHaveBeenCalledTimes(1);
    // The two behind it are in the dataset all the same, unpainted.
    expect(component.candles[1].c).toBe('103');

    tick(1000);

    // The tail of a burst lands on its own rather than sitting invisible
    // until the next trade prints.
    expect(cdr.markForCheck).toHaveBeenCalledTimes(2);
    component.ngOnDestroy();
  }));

  it('keeps the closing print of a bar that rolls over mid-window', fakeAsync(() => {
    const { component, frames } = watching([at(1000), at(61_000)]);

    frames.next(at(61_000, '111'));
    frames.next(at(121_000));

    // Rationing the frames themselves would have dropped the close and left
    // the bar quoting whatever streamed last. The fold runs ahead of the
    // throttle, so only the redraw is rationed and the dataset stays exact.
    expect(component.candles.length).toBe(3);
    expect(component.candles[1].c).toBe('111');

    tick(1000);
    component.ngOnDestroy();
  }));

  it('prepends earlier candles without dropping the ones already on screen', () => {
    const getCandles = jasmine.createSpy('getCandles').and.returnValue(
      of([at(1000), at(61_000)])
    );
    const component = new PerpsMarketComponent(
      null,
      null,
      null,
      service({ getCandles }),
      detector()
    );
    component.coin = 'ETH';
    component.interval = '15m';
    component.chartLoading = false;
    component.candles = [at(61_000), at(121_000)];

    component.loadEarlierCandles();

    expect(getCandles).toHaveBeenCalledWith(
      'ETH',
      '15m',
      PERPS_CANDLE_LIMIT,
      61_000
    );
    expect(component.candles.map((item) => item.t)).toEqual([
      1000, 61_000, 121_000,
    ]);
  });

  it('stops paging once an earlier snapshot adds nothing new', () => {
    const getCandles = jasmine.createSpy('getCandles').and.returnValue(
      of([at(61_000)])
    );
    const component = new PerpsMarketComponent(
      null,
      null,
      null,
      service({ getCandles }),
      detector()
    );
    component.coin = 'ETH';
    component.chartLoading = false;
    component.candles = [at(61_000), at(121_000)];

    component.loadEarlierCandles();
    component.loadEarlierCandles();

    expect(getCandles).toHaveBeenCalledTimes(1);
  });

  it('paints a market it has already seen before the network answers', () => {
    const subscribe = jasmine
      .createSpy('subscribe')
      .and.returnValue(new Subject());
    const component = new PerpsMarketComponent(
      null,
      null,
      null,
      service({
        cachedCandles: () => [at(1000), at(61_000)],
        getCandles: () => new Subject(),
        subscribe,
      }),
      detector()
    );
    component.coin = 'ETH';

    (component as any).loadCandles();

    // The snapshot is still in flight, and the chart is already drawn.
    expect(component.chartLoading).toBeFalse();
    expect(component.candles.map((item) => item.t)).toEqual([1000, 61_000]);
    // Frames start with the paint rather than with the answer, so bars drawn
    // from memory cannot sit still while the request behind them is slow.
    expect(subscribe).toHaveBeenCalledWith({
      type: 'candle',
      coin: 'ETH',
      interval: '15m',
    });
    component.ngOnDestroy();
  });

  it('merges the snapshot into what it painted from memory', () => {
    const component = new PerpsMarketComponent(
      null,
      null,
      null,
      service({
        cachedCandles: () => [at(1000), at(61_000)],
        getCandles: () => of([at(61_000, '111'), at(121_000)]),
      }),
      detector()
    );
    component.coin = 'ETH';

    (component as any).loadCandles();

    // Replacing would drop the first bar and move the dataset's starting
    // point, which is what the chart reads as a different dataset.
    expect(component.candles.map((item) => item.t)).toEqual([
      1000, 61_000, 121_000,
    ]);
    expect(component.candles[1].c).toBe('111');
    component.ngOnDestroy();
  });

  it('lets a live frame received during a snapshot win the same timestamp', () => {
    const snapshot = new Subject<PerpsCandle[]>();
    const frames = new Subject<PerpsCandle>();
    const component = new PerpsMarketComponent(
      null,
      null,
      null,
      service({
        cachedCandles: () => [at(1000), at(61_000, '101')],
        getCandles: () => snapshot,
        subscribe: () => frames,
      }),
      detector()
    );
    component.coin = 'ETH';

    (component as any).loadCandles();
    frames.next(at(61_000, '111'));
    snapshot.next([at(61_000, '105')]);

    // REST may have been produced before the websocket frame even when its
    // response lands later. The live frame is the newer statement.
    expect(component.candles[1].c).toBe('111');
    component.ngOnDestroy();
  });

  it('collapses a burst of interval taps into one more snapshot', fakeAsync(() => {
    const getCandles = jasmine.createSpy('getCandles').and.returnValue(of([]));
    const component = new PerpsMarketComponent(
      null,
      null,
      { getStorage: () => of('15m'), setStorage: () => undefined } as any,
      service({ getCandles }),
      detector()
    );
    component.coin = 'ETH';
    (component as any).loadChartInterval();
    getCandles.calls.reset();

    component.selectInterval('1m');
    component.selectInterval('5m');
    component.selectInterval('1h');
    tick(300);

    // Hyperliquid charges a candle snapshot by the bar, so three taps in a
    // second must not be three of the priciest request this page makes. Only
    // the interval the user settled on is asked for.
    expect(getCandles).toHaveBeenCalledTimes(1);
    expect(getCandles).toHaveBeenCalledWith('ETH', '1h');
    component.ngOnDestroy();
  }));

  it('remembers the dataset for the next visit to this market', () => {
    const rememberCandles = jasmine.createSpy('rememberCandles');
    const component = new PerpsMarketComponent(
      null,
      null,
      null,
      service({
        rememberCandles,
        getCandles: () => of([at(1000), at(61_000)]),
      }),
      detector()
    );
    component.coin = 'ETH';
    component.interval = '15m';

    (component as any).loadCandles();

    expect(rememberCandles).toHaveBeenCalledWith('ETH', '15m', [
      at(1000),
      at(61_000),
    ]);
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
      service({ getCandles: () => of([]) }),
      cdr
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
    const getCandles = jasmine.createSpy('getCandles').and.returnValue(of([]));
    const component = new PerpsMarketComponent(
      null,
      null,
      { getStorage: () => of('4h'), setStorage: () => undefined } as any,
      service({ getCandles }),
      detector()
    );
    component.coin = 'ETH';

    // Storage answers with whatever an older build wrote. `4h` is a plausible
    // interval this one does not carry, and it must not reach the service:
    // sizing a request window from it throws before the subscription exists,
    // so the chart would spin forever with no error path to land in.
    expect(() => (component as any).loadChartInterval()).not.toThrow();
    expect(component.interval).toBe('15m');
    expect(getCandles).toHaveBeenCalledWith('ETH', '15m');
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

describe('PerpsMarketComponent feed recovery', () => {
  const at = (t: number, close = '100'): PerpsCandle =>
    ethCandle({ t, T: t + 59_999, c: close });

  function reconnecting(initialSnapshot: any, recoverySnapshot: any) {
    const state = new Subject<string>();
    const getCandles = jasmine
      .createSpy('getCandles')
      .and.returnValues(initialSnapshot, recoverySnapshot);
    const getCandleRange = jasmine
      .createSpy('getCandleRange')
      .and.returnValue(recoverySnapshot);
    const component = new PerpsMarketComponent(
      { params: of({ coin: 'ETH' }) } as any,
      null,
      { getStorage: () => of(undefined), setStorage: () => undefined } as any,
      service({
        watchConnectionState: () => state,
        watchMarketDetail: () => new Subject(),
        getCandles,
        getCandleRange,
        intervalMs: () => 60_000,
      }),
      detector()
    );
    component.ngOnInit();
    return { component, state, getCandles, getCandleRange };
  }

  it('fills the bars that closed while the feed was down', () => {
    spyOn(Date, 'now').and.returnValue(181_500);
    const { component, state, getCandles, getCandleRange } = reconnecting(
      of([at(1000), at(61_000)]),
      of([at(121_000), at(181_000)])
    );

    state.next('stale');
    state.next('live');

    // A reconnected socket replays the subscription but streams only the bar
    // open right now, so the bars in between arrive from a fresh snapshot —
    // merged in, since reloading would drop the two already on screen.
    expect(getCandles).toHaveBeenCalledTimes(1);
    expect(getCandleRange).toHaveBeenCalledWith(
      'ETH',
      '15m',
      61_000,
      181_500
    );
    expect(component.candles.map((item) => item.t)).toEqual([
      1000, 61_000, 121_000, 181_000,
    ]);
    component.ngOnDestroy();
  });

  it('loads from scratch when the drop left nothing on screen', fakeAsync(() => {
    const { component, state, getCandles } = reconnecting(
      of([]),
      of([at(121_000)])
    );

    state.next('stale');
    state.next('live');
    // A full load is a snapshot request like any other, so it waits out the
    // window the first one opened rather than following it immediately.
    tick(300);

    expect(getCandles).toHaveBeenCalledTimes(2);
    expect(component.candles.map((item) => item.t)).toEqual([121_000]);
    component.ngOnDestroy();
  }));

  it('waits rather than topping up a snapshot still in flight', () => {
    const first = new Subject<PerpsCandle[]>();
    const { component, state, getCandles, getCandleRange } = reconnecting(
      first,
      of([at(121_000)])
    );

    state.next('stale');
    state.next('live');

    // The first load is a REST request, which the socket dropping does not
    // cancel. Racing a second one against it would have two answers landing
    // in either order.
    expect(getCandles).toHaveBeenCalledTimes(1);
    expect(getCandleRange).not.toHaveBeenCalled();

    first.next([at(61_000)]);

    // The transition is remembered and runs as soon as the first snapshot
    // settles; otherwise a disconnect during loading permanently loses bars.
    expect(getCandleRange).toHaveBeenCalledTimes(1);
    component.ngOnDestroy();
  });

  it('leaves a live feed alone when it never went stale', () => {
    const { component, state, getCandles } = reconnecting(
      of([at(1000)]),
      of([at(61_000)])
    );

    state.next('connecting');
    state.next('live');

    expect(getCandles).toHaveBeenCalledTimes(1);
    component.ngOnDestroy();
  });

  it('reloads the available dataset when the gap exceeds 5000 bars', () => {
    spyOn(Date, 'now').and.returnValue(6001 * 60_000);
    const recent = [at(5001 * 60_000), at(6000 * 60_000)];
    const { component, state, getCandleRange } = reconnecting(
      of([at(0)]),
      of(recent)
    );

    state.next('stale');
    state.next('live');

    expect(getCandleRange).toHaveBeenCalledWith(
      'ETH',
      '15m',
      1001 * 60_000,
      6001 * 60_000
    );
    // Keeping the bar at t=0 would pretend the unavailable middle is intact.
    expect(component.candles).toEqual(recent);
    component.ngOnDestroy();
  });

  it('marks a failed gap fill as an interrupted chart', () => {
    const { component, state } = reconnecting(
      of([at(1000)]),
      throwError(() => new Error('offline'))
    );

    state.next('stale');
    state.next('live');

    expect(component.chartRecoveryError).toBeTrue();
    component.ngOnDestroy();
  });

  it('drops a gap-fill answer after the candle dataset changes', () => {
    const range = new Subject<PerpsCandle[]>();
    const component = new PerpsMarketComponent(
      null,
      null,
      null,
      service({
        getCandleRange: () => range,
        getCandles: () => of([at(500_000)]),
        intervalMs: () => 60_000,
      }),
      detector()
    );
    component.coin = 'ETH';
    component.interval = '1m';
    component.chartLoading = false;
    component.candles = [at(1000), at(61_000)];
    (component as any).recoverCandles();

    component.interval = '5m';
    (component as any).loadCandles();
    range.next([at(121_000), at(181_000)]);

    expect(component.candles).toEqual([at(500_000)]);
    component.ngOnDestroy();
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
        watchConnectionState: () => state,
        watchMarketDetail: () => new Subject(),
        getCandles: () => of([]),
      }),
      cdr
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
      watchMarketDetail: () => feed,
    } as any, cdr);
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
    const component = new PerpsMarketComponent(null, null, null, {
      watchMarketDetail,
    } as any, detector());
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
    const component = new PerpsMarketComponent(null, null, null, {
      watchMarketDetail: () => of(null),
    } as any, cdr);
    component.coin = 'NOPE';

    (component as any).loadMarket();

    expect(component.marketStatus).toBe('missing');
    expect(cdr.markForCheck).toHaveBeenCalled();
  });

  it('marks the view on every countdown tick', () => {
    const cdr = detector();
    const component = new PerpsMarketComponent(null, null, null, null, cdr);

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
    const component = new PerpsMarketComponent(null, null, null, null, cdr);

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
        watchConnectionState: () => new Subject(),
        watchMarketDetail: () => new Subject(),
        getCandles: () => of([]),
      }),
      detector()
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
        watchConnectionState: () => new Subject(),
        watchMarketDetail: () => feed,
        getCandles: () => of([]),
      }),
      cdr
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
