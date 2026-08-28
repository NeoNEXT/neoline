import { HttpErrorResponse } from '@angular/common/http';
import { discardPeriodicTasks, fakeAsync, tick } from '@angular/core/testing';
import { of, throwError } from 'rxjs';

import { PerpsMarket } from '@popup/_lib/perps';
import { fakePerpsDataChannel } from './perps-data-channel.fake';
import { PerpsMarketDatasetService } from './perps-market-dataset.service';
import {
  PerpsMarketDatasetState,
  mergeDexAssetContexts,
} from './perps-market-dataset';

/** 一帧上下文，字段齐全到市场模型需要读的每一项。 */
const ctx = (midPx: string | null, markPx = '1875.7') => ({
  funding: '0.0000125',
  openInterest: '10',
  prevDayPx: '1900',
  dayNtlVlm: '1000',
  markPx,
  midPx,
  oraclePx: '1876',
});

const universe = [
  { name: 'BTC', szDecimals: 5, maxLeverage: 40 },
  { name: 'ETH', szDecimals: 4, maxLeverage: 25 },
  { name: 'OLD', szDecimals: 2, maxLeverage: 3, isDelisted: true },
];

const contexts = [ctx('63000', '63001'), ctx('1875.75'), ctx('1', '1')];

/**
 * 本模块视角下的交易场所，预置了那些改变不了什么的答复：一个空的标准永续 universe，
 * 以及一个不含 HIP-3 DEX 的注册表。这样每个测试只需写出它的断言真正依赖的那几次读取。
 */
const source = (overrides: any = {}) =>
  ({
    enabledDexes: ['', 'xyz'],
    getDexRegistry: () => of([]),
    getMetaAndAssetCtxs: () => of([{ universe: [] }, []]),
    ...overrides,
  } as any);

function build(overrides: any = {}) {
  const channel = fakePerpsDataChannel();
  const feed = source(overrides);
  return {
    feed,
    channel,
    service: new PerpsMarketDatasetService(feed, channel),
  };
}

/** 观察这个列表，并保留它发布过的每一个状态。 */
function watching(service: PerpsMarketDatasetService) {
  const seen: PerpsMarketDatasetState[] = [];
  const subscription = service
    .watchMarkets()
    .subscribe((state) => seen.push(state));
  return {
    seen,
    last: () => seen[seen.length - 1],
    stop: () => subscription.unsubscribe(),
  };
}

describe('PerpsMarketDatasetService snapshots', () => {
  it('preserves the current margin-mode metadata in the market model', (done) => {
    const { service } = build({
      getMetaAndAssetCtxs: () =>
        of([
          {
            universe: [
              {
                name: 'CASHCAT',
                szDecimals: 0,
                maxLeverage: 3,
                marginMode: 'strictIsolated',
              },
            ],
          },
          [ctx('1', '1')],
        ]),
    });

    service.getMarkets().subscribe((markets) => {
      expect(markets[0].marginMode).toBe('strictIsolated');
      done();
    });
  });

  it('loads only supported HIP-3 markets with their protocol asset ids', (done) => {
    const asked: any[] = [];
    const { service } = build({
      getDexRegistry: () =>
        of([
          null,
          { name: 'unsupported-one' },
          { name: 'xyz' },
          { name: 'unsupported-two' },
        ]),
      getMetaAndAssetCtxs: (dex?: string) => {
        asked.push(dex);
        return dex === 'xyz'
          ? of([
              { universe: [{ name: 'NEO', szDecimals: 2, maxLeverage: 5 }] },
              [ctx('10', '10')],
            ])
          : of([{ universe: [] }, []]);
      },
    });

    service.getMarkets().subscribe((markets) => {
      expect(asked).toEqual([undefined, 'xyz']);
      expect(markets[0].coin).toBe('xyz:NEO');
      expect(markets[0].key).toBe('xyz:NEO');
      expect(markets[0].dex).toBe('xyz');
      // 即便下标 1 不受支持，`xyz` 仍然停在注册表下标 2 上。
      expect(markets[0].assetId).toBe(120000);
      done();
    });
  });

  it('does not substitute mark price when a book side is empty', (done) => {
    const { service } = build({
      getMetaAndAssetCtxs: () =>
        of([
          {
            universe: [
              { name: 'ETH', szDecimals: 4, maxLeverage: 25 },
              { name: 'CASHCAT', szDecimals: 0, maxLeverage: 3 },
            ],
          },
          [
            {
              markPx: '1900',
              midPx: '1899.5',
              oraclePx: '1900',
              prevDayPx: '1800',
              dayNtlVlm: '100',
              openInterest: '10',
              funding: '0',
            },
            {
              markPx: '1',
              // 只要有一侧盘口为空，Hyperliquid 就会报出 null 的中间价。
              midPx: null,
              oraclePx: '1',
              prevDayPx: '1',
              dayNtlVlm: '100',
              openInterest: '10',
              funding: '0',
            },
          ],
        ]),
    });

    service.getMarkets().subscribe((markets) => {
      const eth = markets.find((market) => market.coin === 'ETH');
      const cashcat = markets.find((market) => market.coin === 'CASHCAT');
      expect(eth.midPxExact).toBe('1899.5');
      // 缺失的中间价是 null，绝不是零：零是一个价格，缺失不是。
      expect(cashcat.midPxExact).toBeNull();
      // 24 小时涨跌跟随显示用的中间价，而不是它旁边的标记价格。
      expect(Number(eth.changePercentExact)).toBeCloseTo(
        ((1899.5 - 1800) / 1800) * 100,
        8
      );
      expect(cashcat.changePercentExact).toBeNull();
      done();
    });
  });

  it('shares one in-flight snapshot across callers', () => {
    let calls = 0;
    const { service } = build({
      getMetaAndAssetCtxs: () => {
        calls += 1;
        return of([{ universe: [] }, []]);
      },
    });

    service.getMarkets().subscribe();
    service.getMarkets().subscribe();

    expect(calls).toBe(1);
  });

  it('asks again once the list is older than its TTL', fakeAsync(() => {
    let calls = 0;
    const { service } = build({
      getMetaAndAssetCtxs: () => {
        calls += 1;
        return of([{ universe: [] }, []]);
      },
    });

    service.getMarkets().subscribe();
    tick(15001);
    service.getMarkets().subscribe();

    expect(calls).toBe(2);
  }));

  it('reports a list missing one DEX as incomplete, not live', () => {
    const { service } = build({
      getDexRegistry: () => of([null, { name: 'xyz' }]),
      getMetaAndAssetCtxs: (dex?: string) =>
        dex === 'xyz'
          ? throwError(() => new HttpErrorResponse({ status: 500 }))
          : of([
              { universe: [{ name: 'ETH', szDecimals: 4, maxLeverage: 25 }] },
              [ctx('1875.75')],
            ]),
    });
    const view = watching(service);

    // 一个答不上话的 builder DEX 不能把标准永续市场一起藏起来 ——
    // 但由此得到的列表也不是完整的列表。
    expect(view.last().availability).toBe('incomplete');
    expect(view.last().markets.length).toBe(1);
    view.stop();
  });
});

describe('PerpsMarketDatasetService live list', () => {
  const oneMarket = () =>
    of([
      { universe: [{ name: 'ETH', szDecimals: 4, maxLeverage: 25 }] },
      [ctx('1875.75')],
    ]);

  it('publishes the snapshot, then follows the per-DEX frames', () => {
    const { service, channel } = build({ getMetaAndAssetCtxs: oneMarket });
    const view = watching(service);

    expect(view.last().availability).toBe('live');
    expect(view.last().markets[0].midPxExact).toBe('1875.75');

    channel.push({ type: 'assetCtxs', dex: '' }, { ctxs: [ctx('1880.5')] });

    expect(view.last().markets[0].midPxExact).toBe('1880.5');
    expect(view.last().updatedAt).not.toBeNull();
    view.stop();
  });

  it('holds a frame that arrives before the first snapshot and replays it', () => {
    let answer: any = null;
    const { service, channel } = build({
      getMetaAndAssetCtxs: () => answer,
    });
    // 帧比快照先到家。
    answer = of([
      { universe: [{ name: 'ETH', szDecimals: 4, maxLeverage: 25 }] },
      [ctx('1875.75')],
    ]);
    const view = watching(service);
    channel.push({ type: 'assetCtxs', dex: '' }, { ctxs: [ctx('1880.5')] });

    // 帧凭空造不出市场，所以它会等 —— 但一个慢吞吞的 REST 响应，
    // 也不该让列表落后整整一代。
    expect(view.last().markets[0].midPxExact).toBe('1880.5');
    view.stop();
  });

  it('publishes unavailable rather than erroring the stream', () => {
    const failed = jasmine.createSpy('failed');
    const { service } = build({
      getMetaAndAssetCtxs: () =>
        throwError(() => new HttpErrorResponse({ status: 500 })),
    });
    const seen: PerpsMarketDatasetState[] = [];
    service.watchMarkets().subscribe({
      next: (state) => seen.push(state),
      error: failed,
    });

    expect(seen[seen.length - 1].availability).toBe('unavailable');
    // 一个已经 error 的 observable 就此终结，之后即便重试成功，
    // 也没人可以通知了。
    expect(failed).not.toHaveBeenCalled();
  });

  it('waits longer before retrying a rate-limited snapshot', fakeAsync(() => {
    let calls = 0;
    let refuse = false;
    const { service } = build({
      getMetaAndAssetCtxs: () => {
        calls += 1;
        return refuse ? throwError(() => ({ status: 429 })) : oneMarket();
      },
    });
    const view = watching(service);
    expect(calls).toBe(1);

    // 交易场所开始拒绝，而此时屏幕上已经有市场了。
    refuse = true;
    tick(15001);
    const second = watching(service);
    expect(calls).toBe(2);

    // 若是朴素的 1 秒退避，到这里已经又花掉一个请求了，
    // 而这个额度要到接下来的一分钟才补得回来。
    tick(9999);
    expect(calls).toBe(2);
    tick(2);
    expect(calls).toBe(3);

    // 整个过程中市场都留在屏幕上：只要用户眼前的价格还在到达，
    // 一次失败的快照就不是用户的问题。
    expect(view.last().markets.length).toBe(1);

    second.stop();
    view.stop();
    discardPeriodicTasks();
  }));

  it('reports the list stale while the feed is down and re-reads the set on recovery', fakeAsync(() => {
    let calls = 0;
    const { service, channel } = build({
      getMetaAndAssetCtxs: () => {
        calls += 1;
        return oneMarket();
      },
    });
    const view = watching(service);
    expect(calls).toBe(1);
    expect(view.last().availability).toBe('live');

    channel.setConnectionState('live');
    channel.setConnectionState('stale');
    expect(view.last().availability).toBe('stale');
    // 屏幕上的价格予以保留：它们是旧的，不是错的。
    expect(view.last().markets.length).toBe(1);

    channel.setConnectionState('live');

    // 帧自己会重述价格，但它既不能新增也不能移除市场 ——
    // 「有哪些市场」才是重连欠下的那笔账。
    expect(calls).toBe(2);
    expect(view.last().availability).toBe('live');

    view.stop();
    discardPeriodicTasks();
  }));

  it('closes the per-DEX subscriptions when the last observer leaves', () => {
    const { service, channel } = build({ getMetaAndAssetCtxs: oneMarket });
    const first = watching(service);
    const second = watching(service);

    first.stop();
    channel.push({ type: 'assetCtxs', dex: '' }, { ctxs: [ctx('1880.5')] });
    expect(second.last().markets[0].midPxExact).toBe('1880.5');

    second.stop();
    channel.push({ type: 'assetCtxs', dex: '' }, { ctxs: [ctx('1899')] });

    // 当时没人在看，所以那一帧谁也没送到 —— 下一个到来的人，
    // 看到的是最后一个观察者离开时列表的样子。
    const third = watching(service);
    expect(third.seen[0].markets[0].midPxExact).toBe('1880.5');
    third.stop();
  });
});

describe('perps market folding', () => {
  it('merges a dex context frame by universe index, not list position', () => {
    // 列表按成交量排序，所以一个市场在其中的位置说明不了哪份上下文属于它；
    // 只有 `dexAssetIndex` 能。
    const markets: any[] = [
      { key: 'hl:SECOND', dex: '', dexAssetIndex: 1, coin: 'SECOND' },
      { key: 'hl:FIRST', dex: '', dexAssetIndex: 0, coin: 'FIRST' },
      { key: 'xyz:OTHER', dex: 'xyz', dexAssetIndex: 0, coin: 'xyz:OTHER' },
    ];
    const other = markets[2];

    const updated = mergeDexAssetContexts(markets, '', [
      {
        markPx: '10',
        midPx: '10',
        oraclePx: '11',
        prevDayPx: '8',
        dayNtlVlm: '100',
        openInterest: '2',
        funding: '0.001',
      },
      {
        markPx: '20',
        midPx: '20',
        oraclePx: '21',
        prevDayPx: '10',
        dayNtlVlm: '200',
        openInterest: '3',
        funding: '0.002',
      },
    ] as any);

    const first = updated.find((market) => market.coin === 'FIRST');
    const second = updated.find((market) => market.coin === 'SECOND');
    expect(first.markPxExact).toBe('10');
    expect(first.openInterestExact).toBe('20');
    expect(second.markPxExact).toBe('20');
    expect(second.openInterestExact).toBe('60');
    // 价格更新不能在用户手指底下把列表重新排序。
    expect(updated.map((market) => market.coin)).toEqual([
      'SECOND',
      'FIRST',
      'xyz:OTHER',
    ]);
    // 其他 DEX 的市场连重建都没有，所以 `trackBy` 察觉不到任何变动。
    expect(updated[2]).toBe(other);
  });

  it('leaves markets untouched when a frame has no context for them', () => {
    const markets: any[] = [
      { key: 'hl:ONLY', dex: '', dexAssetIndex: 7, coin: 'ONLY' },
    ];

    expect(mergeDexAssetContexts(markets, '', [] as any)).toBe(markets);
    expect(mergeDexAssetContexts(markets, 'xyz', [{}] as any)[0]).toBe(
      markets[0]
    );
  });
});

describe('PerpsMarketDatasetService market detail', () => {
  const detail = (overrides: any = {}) =>
    build({
      getMetaAndAssetCtxs: () => of([{ universe }, contexts]),
      ...overrides,
    });

  it("seeds from one DEX and then follows that market's own frames", () => {
    const asked: any[] = [];
    const { service, channel } = detail({
      getDexRegistry: () => {
        asked.push('registry');
        return of([]);
      },
      getMetaAndAssetCtxs: (dex?: string) => {
        asked.push(dex);
        return of([{ universe }, contexts]);
      },
    });
    const seen: PerpsMarket[] = [];

    service.watchMarketDetail('ETH').subscribe((market) => seen.push(market));

    expect(seen.length).toBe(1);
    expect(seen[0].coin).toBe('ETH');
    expect(seen[0].assetId).toBe(1);
    expect(seen[0].midPxExact).toBe('1875.75');
    // 标准永续市场按定义就是下标 0，因此 DEX 注册表 ——
    // 以及其他每个 DEX 的上下文数组 —— 根本不会被请求。
    expect(asked).toEqual([undefined]);

    channel.push(
      { type: 'activeAssetCtx', coin: 'ETH' },
      { coin: 'ETH', ctx: ctx('1880.5', '1880') }
    );

    expect(seen.length).toBe(2);
    expect(seen[1].midPxExact).toBe('1880.5');
    expect(seen[1].markPxExact).toBe('1880');
    // 静态元数据不会从上下文帧里重新推导。
    expect(seen[1].szDecimals).toBe(4);
    expect(seen[1].maxLeverage).toBe(25);
    expect(seen[1].assetId).toBe(1);
  });

  it('routes a HIP-3 coin to its own DEX and asset-id space', () => {
    const asked: any[] = [];
    const { service } = detail({
      getDexRegistry: () => of([null, { name: 'xyz' }]),
      getMetaAndAssetCtxs: (dex?: string) => {
        asked.push(dex);
        return of([
          { universe: [{ name: 'SNDK', szDecimals: 2, maxLeverage: 5 }] },
          [ctx('12.5')],
        ]);
      },
    });
    const seen: PerpsMarket[] = [];

    service.watchMarketDetail('xyz:SNDK').subscribe((m) => seen.push(m));

    expect(seen[0].coin).toBe('xyz:SNDK');
    expect(seen[0].symbol).toBe('SNDK');
    expect(seen[0].dex).toBe('xyz');
    expect(seen[0].assetId).toBe(110000);
    expect(asked).toEqual(['xyz']);
  });

  it('answers null — not an error — for a coin this build does not carry', () => {
    const { service } = detail();
    const seen: (PerpsMarket | null)[] = [];
    const failed = jasmine.createSpy('failed');

    service.watchMarketDetail('NOPE').subscribe((m) => seen.push(m), failed);
    service.watchMarketDetail('OLD').subscribe((m) => seen.push(m), failed);
    // 未启用的 HIP-3 DEX 压根不会走到网络。
    service
      .watchMarketDetail('other:THING')
      .subscribe((m) => seen.push(m), failed);

    expect(seen).toEqual([null, null, null]);
    expect(failed).not.toHaveBeenCalled();
  });

  it('does not repeat a refusal the exchange did answer', fakeAsync(() => {
    let calls = 0;
    const { service } = detail({
      getMetaAndAssetCtxs: () => {
        calls += 1;
        return throwError(() => new HttpErrorResponse({ status: 429 }));
      },
    });
    const failed = jasmine.createSpy('failed');

    service.watchMarketDetail('ETH').subscribe({ error: failed });
    tick(5000);

    // 限流是一种回复。一秒后把同样的问题再问一遍，得到的是同样的答案，
    // 却又从一个要到接下来一分钟才补满的额度里花掉一个名额。
    expect(calls).toBe(1);
    expect(failed).toHaveBeenCalled();
  }));

  it('repeats a snapshot the exchange never answered', fakeAsync(() => {
    let calls = 0;
    const { service } = detail({
      getMetaAndAssetCtxs: () =>
        calls++ === 0
          ? throwError(() => new HttpErrorResponse({ status: 503 }))
          : of([{ universe }, contexts]),
    });
    const seen: PerpsMarket[] = [];

    service.watchMarketDetail('ETH').subscribe((market) => seen.push(market));
    tick(1000);

    // 没有这份快照，页面就什么都没有；而一条在去程上断掉的连接，
    // 并没有对「这个市场是否存在」做出任何裁决。
    expect(calls).toBe(2);
    expect(seen[0].coin).toBe('ETH');
  }));

  it('spends a bounded budget and then lets the failure stand', fakeAsync(() => {
    let calls = 0;
    const { service } = detail({
      getMetaAndAssetCtxs: () => {
        calls += 1;
        return throwError(() => new HttpErrorResponse({ status: 500 }));
      },
    });
    const failed = jasmine.createSpy('failed');

    service.watchMarketDetail('ETH').subscribe({ error: failed });
    tick(30_000);

    // 一次尝试外加三次均匀间隔的重试，之后不留下任何还在跑的东西 —— `fakeAsync` 会因
    // 活得比测试还久的定时器而失败，所以常驻的退避不可能悄悄溜回来。
    expect(calls).toBe(4);
    expect(failed).toHaveBeenCalled();
  }));

  it('quotes the 24h amount and percent from the same two prices', () => {
    const { service } = detail();
    const seen: PerpsMarket[] = [];
    service.watchMarketDetail('ETH').subscribe((m) => seen.push(m));

    // 中间价 1875.75 对 prevDayPx 1900。
    expect(seen[0].changeAmountExact).toBe('-24.25');
    expect(seen[0].changePercentExact).toBe('-1.276315789473684211');
  });

  it('has no 24h change to quote when the book reports no mid', () => {
    const { service } = detail({
      getMetaAndAssetCtxs: () =>
        of([{ universe }, [contexts[0], ctx(null), contexts[2]]]),
    });
    const seen: PerpsMarket[] = [];
    service.watchMarketDetail('ETH').subscribe((m) => seen.push(m));

    // 市场统计不可用：标记价格与 prevDayPx 属于不同种类的价格，因此没有诚实的比较可做
    // —— 而且 `null` 和 `0` 说的不是同一件事。
    expect(seen[0].midPxExact).toBeNull();
    expect(seen[0].changeAmountExact).toBeNull();
    expect(seen[0].changePercentExact).toBeNull();
  });

  it('ignores a frame that carries no context', () => {
    const { service, channel } = detail();
    const seen: PerpsMarket[] = [];
    service.watchMarketDetail('ETH').subscribe((m) => seen.push(m));

    channel.push({ type: 'activeAssetCtx', coin: 'ETH' }, { coin: 'ETH' });

    expect(seen.length).toBe(1);
  });
});
