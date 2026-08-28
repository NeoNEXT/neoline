import { fakeAsync, tick } from '@angular/core/testing';
import { of, Subject, throwError } from 'rxjs';

import { PerpsCandle } from '@popup/_lib/perps';

import { ethCandle } from '@popup/perps/perps.test-fixture';
import { PerpsCandleDatasetService } from './perps-candle-dataset.service';
import {
  mergeCandles,
  PerpsCandleDatasetState,
} from './perps-candle-dataset';

const at = (t: number, close = '100'): PerpsCandle =>
  ethCandle({ t, T: t + 59_999, c: close });

/**
 * The exchange as this module uses it, over the answers that change nothing: a
 * range nobody answers and channels that never speak. A test then states only
 * the calls its assertions rest on.
 */
const source = (overrides: any = {}) =>
  ({
    getCandleRange: () => new Subject<PerpsCandle[]>(),
    subscribe: () => new Subject<PerpsCandle>(),
    watchConnectionState: () => new Subject(),
    ...overrides,
  } as any);

const build = (overrides: any = {}) => {
  // One object answers both the REST source and the 数据通道 it watches.
  const fake = source(overrides);
  return new PerpsCandleDatasetService(fake, fake);
};

/** Watch a dataset and keep every state it publishes. */
function watching(
  service: PerpsCandleDatasetService,
  coin = 'ETH',
  interval: any = '15m'
) {
  const seen: PerpsCandleDatasetState[] = [];
  const subscription = service
    .watchDataset(coin, interval)
    .subscribe((state) => seen.push(state));
  return {
    seen,
    last: () => seen[seen.length - 1],
    times: () => seen[seen.length - 1].candles.map((candle) => candle.t),
    stop: () => subscription.unsubscribe(),
  };
}

describe('PerpsCandleDatasetService live frames', () => {
  it('replaces the trailing bar while it is still open', () => {
    const frames = new Subject<PerpsCandle>();
    const service = build({
      getCandleRange: () => of([at(1000), at(61_000)]),
      subscribe: () => frames,
    });
    const view = watching(service);

    frames.next(at(61_000, '111'));

    expect(view.times()).toEqual([1000, 61_000]);
    expect(view.last().candles[1].c).toBe('111');
    view.stop();
  });

  it('appends a new bar instead of trimming the oldest', () => {
    const frames = new Subject<PerpsCandle>();
    const service = build({
      getCandleRange: () => of([at(1000), at(61_000)]),
      subscribe: () => frames,
    });
    const view = watching(service);

    frames.next(at(121_000));

    // Dropping the oldest bar would move the dataset's starting point, which
    // is how the chart tells one dataset from another.
    expect(view.times()).toEqual([1000, 61_000, 121_000]);
    view.stop();
  });

  it('ignores a frame for a bar older than the one on screen', () => {
    const frames = new Subject<PerpsCandle>();
    const service = build({
      getCandleRange: () => of([at(61_000)]),
      subscribe: () => frames,
    });
    const view = watching(service);
    const before = view.seen.length;

    frames.next(at(1000));

    expect(view.times()).toEqual([61_000]);
    // A late arrival for a settled bar is not worth publishing either.
    expect(view.seen.length).toBe(before);
    view.stop();
  });

  it('publishes every frame and leaves the rationing of redraws to the page', () => {
    const frames = new Subject<PerpsCandle>();
    const service = build({
      getCandleRange: () => of([at(1000)]),
      subscribe: () => frames,
    });
    const view = watching(service);
    const before = view.seen.length;

    frames.next(at(61_000, '101'));
    frames.next(at(61_000, '102'));
    frames.next(at(121_000, '103'));

    // Dropping whole frames here would lose a bar's closing print when it
    // rolls over mid-window, so the dataset stays exact and the view throttles.
    expect(view.seen.length).toBe(before + 3);
    expect(view.times()).toEqual([1000, 61_000, 121_000]);
    expect(view.last().candles[1].c).toBe('102');
    view.stop();
  });
});

describe('PerpsCandleDatasetService snapshots', () => {
  it('opens the channel without waiting for the snapshot to answer', () => {
    const subscribe = jasmine
      .createSpy('subscribe')
      .and.returnValue(new Subject<PerpsCandle>());
    const service = build({
      getCandleRange: () => new Subject<PerpsCandle[]>(),
      subscribe,
    });
    const view = watching(service);

    // Nothing was remembered, and the snapshot is still in flight — the bars
    // that close in between are ones nothing else would ever fill.
    expect(subscribe).toHaveBeenCalledWith({
      type: 'candle',
      coin: 'ETH',
      interval: '15m',
    });
    view.stop();
  });

  it('lets a live frame received during a snapshot win the same timestamp', () => {
    const snapshot = new Subject<PerpsCandle[]>();
    const frames = new Subject<PerpsCandle>();
    const service = build({
      getCandleRange: () => snapshot,
      subscribe: () => frames,
    });
    const view = watching(service);

    frames.next(at(61_000, '222'));
    snapshot.next([at(1000), at(61_000, '111')]);

    // The REST answer is older than the frame even though it landed later.
    expect(view.times()).toEqual([1000, 61_000]);
    expect(view.last().candles[1].c).toBe('222');
    view.stop();
  });

  it('starts as loading rather than as an empty dataset', () => {
    const service = build();
    const view = watching(service);

    expect(view.last().availability).toBe('loading');
    expect(view.last().candles).toEqual([]);
    view.stop();
  });

  it('reads an empty answer as an empty market, not as unreachable', () => {
    const service = build({ getCandleRange: () => of([]) });
    const view = watching(service);

    expect(view.last().availability).toBe('live');
    expect(view.last().candles).toEqual([]);
    view.stop();
  });

  it('reports a snapshot it could not fetch as unavailable', () => {
    const service = build({
      getCandleRange: () => throwError(() => new Error('offline')),
    });
    const view = watching(service);

    expect(view.last().availability).toBe('unavailable');
    expect(view.last().candles).toEqual([]);
    view.stop();
  });
});

describe('PerpsCandleDatasetService remembered datasets', () => {
  /**
   * A feed whose answers can change between visits, so the second visit is
   * genuinely reading what the first one left behind rather than refetching.
   */
  function revisitable(first: any) {
    const feed = {
      getCandleRange: () => first,
      subscribe: () => new Subject<PerpsCandle>(),
      watchConnectionState: () => new Subject(),
    };
    return {
      feed,
      service: new PerpsCandleDatasetService(feed as any, feed as any),
    };
  }

  it('paints a market it has already seen before the network answers', fakeAsync(() => {
    const now = 1_700_000_120_000;
    spyOn(Date, 'now').and.returnValue(now);
    const { feed, service } = revisitable(of([at(now - 60_000)]));

    watching(service).stop();
    tick(300);

    // Second visit: the snapshot is never answered, and bars are on screen.
    feed.getCandleRange = () => new Subject<PerpsCandle[]>();
    const second = watching(service);

    expect(second.last().availability).toBe('live');
    expect(second.times()).toEqual([now - 60_000]);
    second.stop();
    tick(300);
  }));

  it('asks for a fresh snapshot when what it remembers is too old to draw', fakeAsync(() => {
    const stale = 1_700_000_000_000;
    spyOn(Date, 'now').and.returnValue(stale);
    const { feed, service } = revisitable(of([at(stale - 60_000)]));

    watching(service).stop();
    tick(300);

    // Four 15m bars later, what was remembered is a visible gap behind the
    // live edge rather than a chart.
    (Date.now as jasmine.Spy).and.returnValue(stale + 4 * 15 * 60_000);
    feed.getCandleRange = () => new Subject<PerpsCandle[]>();
    const second = watching(service);

    expect(second.last().availability).toBe('loading');
    expect(second.last().candles).toEqual([]);
    second.stop();
    tick(300);
  }));

  it('keeps intervals of the same market apart', fakeAsync(() => {
    const now = 1_700_000_120_000;
    spyOn(Date, 'now').and.returnValue(now);
    const { feed, service } = revisitable(of([at(now - 60_000)]));

    watching(service, 'ETH', '1m').stop();
    tick(300);

    feed.getCandleRange = () => new Subject<PerpsCandle[]>();
    const other = watching(service, 'ETH', '5m');

    // Bars from another interval under this interval's label would be a chart
    // of something the user did not ask for.
    expect(other.last().availability).toBe('loading');
    expect(other.last().candles).toEqual([]);
    other.stop();
    tick(300);
  }));

  it('bounds what it remembers across a long session', fakeAsync(() => {
    const now = 1_700_000_120_000;
    spyOn(Date, 'now').and.returnValue(now);
    const { feed, service } = revisitable(of([at(now - 60_000)]));

    for (let i = 0; i < 9; i++) {
      watching(service, `COIN${i}`, '1m').stop();
      tick(300);
    }

    feed.getCandleRange = () => new Subject<PerpsCandle[]>();
    const oldest = watching(service, 'COIN0', '1m');
    const newest = watching(service, 'COIN8', '1m');

    // The market visited longest ago is the one dropped.
    expect(oldest.last().candles).toEqual([]);
    expect(newest.times()).toEqual([now - 60_000]);
    oldest.stop();
    newest.stop();
    tick(300);
  }));

  it('does not trim history inside a remembered dataset', fakeAsync(() => {
    const now = 1_700_000_120_000;
    spyOn(Date, 'now').and.returnValue(now);
    const recent = Array.from({ length: 500 }, (_, index) =>
      at(now - (499 - index) * 60_000)
    );
    const earlier = Array.from({ length: 501 }, (_, index) =>
      at(now - (1000 - index) * 60_000)
    );
    const getCandleRange = jasmine
      .createSpy('getCandleRange')
      .and.returnValues(of(recent), of(earlier), new Subject<PerpsCandle[]>());
    const service = build({ getCandleRange });

    const first = watching(service, 'ETH', '1m');
    service.loadEarlier('ETH', '1m');
    expect(first.last().candles.length).toBe(1001);
    first.stop();
    tick(300);

    const second = watching(service, 'ETH', '1m');

    // Paging back grows a dataset past what one snapshot returns. What is
    // remembered is the whole of it, not the last window.
    expect(second.last().candles.length).toBe(1001);
    second.stop();
    tick(300);
  }));

  it('keeps remembered bars up when a top-up fails', fakeAsync(() => {
    const now = 1_700_000_120_000;
    spyOn(Date, 'now').and.returnValue(now);
    const { feed, service } = revisitable(of([at(now - 60_000)]));

    watching(service).stop();
    tick(300);

    feed.getCandleRange = () => throwError(() => new Error('offline'));
    const second = watching(service);

    // An empty chart is not the more honest answer for a top-up that failed.
    expect(second.times()).toEqual([now - 60_000]);
    expect(second.last().availability).toBe('live');
    second.stop();
    tick(300);
  }));
});

describe('PerpsCandleDatasetService request rationing', () => {
  it('collapses a burst of interval taps into one more snapshot', fakeAsync(() => {
    const getCandleRange = jasmine
      .createSpy('getCandleRange')
      .and.returnValue(of([at(1000)]));
    const service = build({ getCandleRange });

    // Four taps in well under the window, as stepping the interval row is.
    const a = watching(service, 'ETH', '1m');
    a.stop();
    const b = watching(service, 'ETH', '5m');
    b.stop();
    const c = watching(service, 'ETH', '15m');
    c.stop();
    const d = watching(service, 'ETH', '1h');

    // The first tap fetched at once so a single one feels instant.
    expect(getCandleRange).toHaveBeenCalledTimes(1);

    tick(300);

    // The rest of the burst collapsed into the tap that ended it.
    expect(getCandleRange).toHaveBeenCalledTimes(2);
    expect(getCandleRange.calls.mostRecent().args[1]).toBe('1h');
    d.stop();
    tick(300);
  }));

  it('drops a queued snapshot for a dataset the user has left', fakeAsync(() => {
    const getCandleRange = jasmine
      .createSpy('getCandleRange')
      .and.returnValue(of([at(1000)]));
    const service = build({ getCandleRange });

    const a = watching(service, 'ETH', '1m');
    a.stop();
    const b = watching(service, 'ETH', '5m');
    b.stop();

    expect(getCandleRange).toHaveBeenCalledTimes(1);

    tick(300);

    // Nobody is watching the queued one by the time the window opens.
    expect(getCandleRange).toHaveBeenCalledTimes(1);
  }));
});

describe('PerpsCandleDatasetService history paging', () => {
  it('prepends earlier candles without dropping the ones already on screen', () => {
    const getCandleRange = jasmine
      .createSpy('getCandleRange')
      .and.returnValues(of([at(61_000), at(121_000)]), of([at(1000)]));
    const service = build({ getCandleRange });
    const view = watching(service);

    service.loadEarlier('ETH', '15m');

    // The window ends at the oldest bar already on screen.
    expect(getCandleRange.calls.mostRecent().args).toEqual([
      'ETH',
      '15m',
      61_000 - 15 * 60e3 * 500,
      61_000,
    ]);
    expect(view.times()).toEqual([1000, 61_000, 121_000]);
    view.stop();
  });

  it('stops paging once an earlier snapshot adds nothing new', () => {
    const getCandleRange = jasmine
      .createSpy('getCandleRange')
      .and.returnValues(of([at(61_000)]), of([]), of([at(1000)]));
    const service = build({ getCandleRange });
    const view = watching(service);

    service.loadEarlier('ETH', '15m');
    service.loadEarlier('ETH', '15m');

    // The second call must not have reached the exchange at all.
    expect(getCandleRange).toHaveBeenCalledTimes(2);
    expect(view.times()).toEqual([61_000]);
    view.stop();
  });

  it('drops a page that only repeats the bar the window ends on', () => {
    const getCandleRange = jasmine
      .createSpy('getCandleRange')
      .and.returnValues(of([at(61_000)]), of([at(61_000)]));
    const service = build({ getCandleRange });
    const view = watching(service);

    service.loadEarlier('ETH', '15m');

    expect(view.times()).toEqual([61_000]);
    view.stop();
  });

  it('pages nothing while the first snapshot is still in flight', () => {
    const getCandleRange = jasmine
      .createSpy('getCandleRange')
      .and.returnValue(new Subject<PerpsCandle[]>());
    const service = build({ getCandleRange });
    const view = watching(service);

    service.loadEarlier('ETH', '15m');

    expect(getCandleRange).toHaveBeenCalledTimes(1);
    view.stop();
  });
});

describe('PerpsCandleDatasetService feed recovery', () => {
  function reconnecting(initial: any, recovery: any) {
    const state = new Subject<any>();
    const getCandleRange = jasmine
      .createSpy('getCandleRange')
      .and.returnValues(initial, recovery);
    const service = build({
      getCandleRange,
      watchConnectionState: () => state,
    });
    const view = watching(service);
    return { service, state, view, getCandleRange };
  }

  it('fills the bars that closed while the feed was down', () => {
    spyOn(Date, 'now').and.returnValue(181_500);
    const { state, view, getCandleRange } = reconnecting(
      of([at(1000), at(61_000)]),
      of([at(121_000), at(181_000)])
    );

    state.next('stale');
    state.next('live');

    // A reconnected socket replays the subscription but streams only the bar
    // open right now, so the bars in between arrive from a fresh snapshot.
    expect(getCandleRange.calls.mostRecent().args).toEqual([
      'ETH',
      '15m',
      61_000,
      181_500,
    ]);
    expect(view.times()).toEqual([1000, 61_000, 121_000, 181_000]);
    expect(view.last().availability).toBe('live');
    view.stop();
  });

  it('loads from scratch when the drop left nothing on screen', fakeAsync(() => {
    const { state, view, getCandleRange } = reconnecting(
      throwError(() => new Error('offline')),
      of([at(1000)])
    );

    expect(view.last().availability).toBe('unavailable');

    state.next('stale');
    state.next('live');
    tick(300);

    expect(getCandleRange).toHaveBeenCalledTimes(2);
    expect(view.times()).toEqual([1000]);
    view.stop();
    tick(300);
  }));

  it('leaves a live feed alone when it never went stale', () => {
    const { state, getCandleRange } = reconnecting(
      of([at(1000)]),
      of([at(61_000)])
    );

    state.next('live');
    state.next('live');

    expect(getCandleRange).toHaveBeenCalledTimes(1);
  });

  it('waits rather than topping up a snapshot still in flight', () => {
    const snapshot = new Subject<PerpsCandle[]>();
    const { state, getCandleRange } = reconnecting(snapshot, of([at(121_000)]));

    state.next('stale');
    state.next('live');

    // The gap fill cannot start while the first answer is still outstanding.
    expect(getCandleRange).toHaveBeenCalledTimes(1);

    snapshot.next([at(1000), at(61_000)]);

    expect(getCandleRange).toHaveBeenCalledTimes(2);
  });

  it('reloads the available dataset when the gap exceeds 5000 bars', () => {
    const bar = 15 * 60_000;
    spyOn(Date, 'now').and.returnValue(6001 * bar);
    const recent = [at(5001 * bar), at(6000 * bar)];
    const { state, view, getCandleRange } = reconnecting(
      of([at(0)]),
      of(recent)
    );

    state.next('stale');
    state.next('live');

    expect(getCandleRange.calls.mostRecent().args).toEqual([
      'ETH',
      '15m',
      1001 * bar,
      6001 * bar,
    ]);
    // Keeping the bar at t=0 would pretend the unavailable middle is intact.
    expect(view.last().candles).toEqual(recent);
    view.stop();
  });

  it('marks a failed gap fill as an interrupted chart', () => {
    const { state, view } = reconnecting(
      of([at(1000)]),
      throwError(() => new Error('offline'))
    );

    state.next('stale');
    state.next('live');

    expect(view.last().availability).toBe('gapped');
    // Price frames may be live again while the closed bars stay incomplete.
    expect(view.times()).toEqual([1000]);
    view.stop();
  });

  it('keeps a dataset gapped when a later frame moves the trailing bar', () => {
    const frames = new Subject<PerpsCandle>();
    const state = new Subject<any>();
    const service = build({
      getCandleRange: jasmine
        .createSpy('getCandleRange')
        .and.returnValues(
          of([at(1000)]),
          throwError(() => new Error('offline'))
        ),
      watchConnectionState: () => state,
      subscribe: () => frames,
    });
    const view = watching(service);

    state.next('stale');
    state.next('live');
    frames.next(at(61_000));

    // A live trailing bar says nothing about the closed bars still missing.
    expect(view.last().availability).toBe('gapped');
    view.stop();
  });

  it('settles a late answer into its own dataset rather than the one on screen', fakeAsync(() => {
    const slow = new Subject<PerpsCandle[]>();
    const getCandleRange = jasmine
      .createSpy('getCandleRange')
      .and.returnValues(slow, of([at(500_000)]));
    const service = build({ getCandleRange });

    watching(service, 'ETH', '1m').stop();
    const second = watching(service, 'ETH', '5m');
    tick(300);

    // The abandoned dataset's answer arrives after the user moved on. No
    // monotonic token rejects it — it lands in an entry nobody is watching.
    slow.next([at(1000), at(61_000)]);

    expect(second.times()).toEqual([500_000]);
    second.stop();
    tick(300);
  }));
});

describe('mergeCandles', () => {
  it('fills the bars a dropped feed missed', () => {
    const onScreen = [at(1000), at(61_000)];
    const snapshot = [at(61_000, '111'), at(121_000), at(181_000)];

    expect(mergeCandles(onScreen, snapshot).map((item) => item.t)).toEqual([
      1000, 61_000, 121_000, 181_000,
    ]);
  });

  it('believes the snapshot where both carry the same bar', () => {
    // A bar's closing print is not the last value that streamed while it was
    // still open, so the later reading of it wins.
    const merged = mergeCandles([at(61_000, '100')], [at(61_000, '111')]);

    expect(merged.length).toBe(1);
    expect(merged[0].c).toBe('111');
  });

  it('keeps history the snapshot no longer reaches back to', () => {
    const paged = [at(1000), at(61_000)];

    // The first bar is the dataset's identity to the chart: losing it redraws
    // the series and throws away the zoom the user chose.
    expect(mergeCandles(paged, [at(121_000)])[0].t).toBe(1000);
  });

  it('answers with the snapshot when there is nothing on screen', () => {
    expect(mergeCandles([], [at(1000)]).map((item) => item.t)).toEqual([1000]);
  });

  it('leaves the dataset untouched when the snapshot is empty', () => {
    const onScreen = [at(1000)];

    expect(mergeCandles(onScreen, [])).toBe(onScreen);
  });
});
