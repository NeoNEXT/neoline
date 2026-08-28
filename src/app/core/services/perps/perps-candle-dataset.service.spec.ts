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
 * 本模块视角下的交易场所，预置了那些改变不了什么的答复：一个没人作答的时间范围，以及
 * 一批永不出声的频道。这样每个测试只需写出它的断言真正依赖的那几次调用。
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

/** 观察一个数据集，并保留它发布过的每一个状态。 */
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

    // 丢弃最老的柱子会移动数据集的起点，
    // 而图表正是靠起点来区分不同数据集的。
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
    // 一根已定型柱子的迟到消息同样不值得发布。
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

    // 在这里整帧丢弃，会在柱子于窗口中途滚动时丢掉它的收盘价，
    // 所以数据集保持精确，节流交给视图去做。
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

    // 什么都没记住，而快照还在途中 —— 其间收盘的那些柱子，
    // 是别的东西永远补不上的。
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

    // REST 的答复虽然后到，内容却比那一帧更旧。
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
   * 一个两次访问之间答复会变化的数据源，这样第二次访问才是真的在读第一次留下的东西，
   * 而不是重新取了一遍。
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

    // 第二次访问：快照始终无人作答，而屏幕上已经有柱子了。
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

    // 四根 15 分钟柱子之后，记住的内容在实时边缘之后留下的是一段可见的缺口，
    // 而不是一张图。
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

    // 在这个周期的标签下画另一个周期的柱子，等于画了一张用户没要过的东西的图。
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

    // 被淘汰的是最久没访问过的那个市场。
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

    // 向前翻页会把数据集撑得比一次快照返回的还大。记住的是它的全部，
    // 而不是最后那一个窗口。
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

    // 对于一次失败的增量补充，空白图表并不是更诚实的答案。
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

    // 在远小于窗口的时间内点四次，正如在周期切换栏上依次点过去那样。
    const a = watching(service, 'ETH', '1m');
    a.stop();
    const b = watching(service, 'ETH', '5m');
    b.stop();
    const c = watching(service, 'ETH', '15m');
    c.stop();
    const d = watching(service, 'ETH', '1h');

    // 第一次点击立刻发起了请求，好让单独点一下感觉是即时的。
    expect(getCandleRange).toHaveBeenCalledTimes(1);

    tick(300);

    // 这一串点击中余下的部分坍缩到了结束它的那一次上。
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

    // 窗口开启时，已经没人在看那个排队中的数据集了。
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

    // 窗口结束于屏幕上已有的最老那根柱子。
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

    // 第二次调用绝不能走到交易场所。
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

    // 重连后的套接字会重放订阅，但只推送此刻正开着的那根柱子，
    // 所以中间那些柱子要靠一次新的快照才能到达。
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

    // 第一次答复还悬着的时候，补缺不能开始。
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
    // 保留 t=0 那根柱子，等于假装取不到的中间段是完好的。
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
    // 价格帧可能已经恢复实时，而收盘的柱子仍然残缺。
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

    // 一根实时的尾部柱子，说明不了仍然缺失的那些收盘柱子。
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

    // 被弃用数据集的答复在用户走开之后才到。没有任何单调递增的令牌去拒绝它 ——
    // 它落进了一个没人在看的条目里。
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
    // 一根柱子的收盘价，不等于它还开着时流式推送的最后一个值，
    // 所以对它更晚的那次读数获胜。
    const merged = mergeCandles([at(61_000, '100')], [at(61_000, '111')]);

    expect(merged.length).toBe(1);
    expect(merged[0].c).toBe('111');
  });

  it('keeps history the snapshot no longer reaches back to', () => {
    const paged = [at(1000), at(61_000)];

    // 对图表而言，第一根柱子就是数据集的身份：丢了它就会重绘整条序列，
    // 并把用户选定的缩放丢掉。
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
