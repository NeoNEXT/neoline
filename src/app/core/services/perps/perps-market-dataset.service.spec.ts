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

/** A context frame with every field a market model reads. */
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
 * The exchange as this module reads it, over the answers that change nothing:
 * an empty canonical universe and a registry with no HIP-3 DEXes. A test then
 * states only the reads its assertions rest on.
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

/** Watch the list and keep every state it publishes. */
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
      // `xyz` remains at registry index 2 even though index 1 is unsupported.
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
              // Hyperliquid reports a null mid whenever a side is empty.
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
      // An absent mid is null, never zero: zero is a price, absence is not.
      expect(cashcat.midPxExact).toBeNull();
      // The 24h change follows the displayed mid, not the mark beside it.
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

    // A builder DEX that cannot answer must not hide the canonical markets —
    // but the list that results is not the whole list either.
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
    // The frame beats the snapshot home.
    answer = of([
      { universe: [{ name: 'ETH', szDecimals: 4, maxLeverage: 25 }] },
      [ctx('1875.75')],
    ]);
    const view = watching(service);
    channel.push({ type: 'assetCtxs', dex: '' }, { ctxs: [ctx('1880.5')] });

    // A frame cannot invent markets, so it waits — but a slow REST response
    // must not leave the list a generation behind either.
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
    // An errored observable is finished, and a retry that succeeds afterwards
    // would have nobody left to tell.
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

    // The exchange starts refusing, with markets already on screen.
    refuse = true;
    tick(15001);
    const second = watching(service);
    expect(calls).toBe(2);

    // The plain 1s backoff would already have spent another request by here,
    // out of a budget that only refills over the following minute.
    tick(9999);
    expect(calls).toBe(2);
    tick(2);
    expect(calls).toBe(3);

    // The markets stay on screen throughout: a snapshot that failed is not
    // the user's problem while the prices in front of them are still arriving.
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
    // Prices on screen are kept: they are old, not wrong.
    expect(view.last().markets.length).toBe(1);

    channel.setConnectionState('live');

    // Frames restate prices on their own, but they can neither add nor remove
    // a market — the set is what the reconnect owes.
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

    // Nobody was watching, so that frame reached nothing — whoever arrives
    // next sees what the list said when the last observer left.
    const third = watching(service);
    expect(third.seen[0].markets[0].midPxExact).toBe('1880.5');
    third.stop();
  });
});

describe('perps market folding', () => {
  it('merges a dex context frame by universe index, not list position', () => {
    // The list is volume-sorted, so a market's position in it says nothing
    // about which context belongs to it; only `dexAssetIndex` does.
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
    // A price update must not reorder the list under the user's finger.
    expect(updated.map((market) => market.coin)).toEqual([
      'SECOND',
      'FIRST',
      'xyz:OTHER',
    ]);
    // Another DEX's markets are not even re-created, so `trackBy` sees no churn.
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
    // A canonical market is index 0 by definition, so the DEX registry — and
    // every other DEX's context array — is never requested.
    expect(asked).toEqual([undefined]);

    channel.push(
      { type: 'activeAssetCtx', coin: 'ETH' },
      { coin: 'ETH', ctx: ctx('1880.5', '1880') }
    );

    expect(seen.length).toBe(2);
    expect(seen[1].midPxExact).toBe('1880.5');
    expect(seen[1].markPxExact).toBe('1880');
    // Static metadata is not re-derived from a context frame.
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
    // An unenabled HIP-3 DEX never reaches the network at all.
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

    // Rate limiting is a reply. Asking the identical question a second later
    // returns the identical answer and spends another slot out of a budget
    // that refills over the following minute.
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

    // The page has nothing at all without this snapshot, and a connection that
    // dropped on the way in decided nothing about whether the market exists.
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

    // One attempt plus three evenly spaced retries, and nothing left running
    // afterwards — `fakeAsync` fails on a timer that outlives the test, so a
    // standing backoff cannot creep back in unnoticed.
    expect(calls).toBe(4);
    expect(failed).toHaveBeenCalled();
  }));

  it('quotes the 24h amount and percent from the same two prices', () => {
    const { service } = detail();
    const seen: PerpsMarket[] = [];
    service.watchMarketDetail('ETH').subscribe((m) => seen.push(m));

    // mid 1875.75 against prevDayPx 1900.
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

    // Market statistics unavailable: the mark is a different price kind from
    // prevDayPx, so there is no honest comparison to make — and `null` is not
    // the same claim as `0`.
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
