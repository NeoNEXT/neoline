import { Injectable } from '@angular/core';
import BigNumber from 'bignumber.js';
import {
  BehaviorSubject,
  Observable,
  Subscription,
  concat,
  forkJoin,
  of,
} from 'rxjs';
import {
  catchError,
  filter,
  map,
  shareReplay,
  switchMap,
  tap,
} from 'rxjs/operators';

import {
  PerpsAssetCtx,
  PerpsConnectionState,
  PerpsMarket,
  PerpsUniverseItem,
} from '@popup/_lib/perps';
import { HyperliquidService } from './hyperliquid.service';
import { PerpsDataChannel } from './perps-data-channel.service';
import { retryTransientFetch } from './perps-fetch-failure';
import {
  PerpsMarketDatasetState,
  buildMarket,
  marketContextFields,
  mergeDexAssetContexts,
} from './perps-market-dataset';

/** One DEX's static metadata paired with its live contexts, same order. */
type MetaAndAssetCtxs = [{ universe: PerpsUniverseItem[] }, PerpsAssetCtx[]];

/**
 * What this module needs from the exchange, and nothing more.
 *
 * The registry is asked for separately because it only exists to place a HIP-3
 * DEX in the asset-id space: canonical markets are index 0 by definition and
 * skip the request entirely.
 */
interface PerpsMarketSource {
  readonly enabledDexes: string[];
  getDexRegistry(): Observable<any[]>;
  getMetaAndAssetCtxs(dex?: string): Observable<MetaAndAssetCtxs>;
}

/**
 * How old the list may be before a new observer pays for a fresh snapshot.
 *
 * Frames keep the prices current for free, so this is not about staleness of
 * numbers — it is about the set: a market listed or delisted since the last
 * snapshot is invisible until the next one.
 */
const SNAPSHOT_TTL_MS = 15000;

/** A snapshot that failed while markets are already on screen backs off. */
const RETRY_BASE_MS = 1000;
/** A 429 is an IP budget that refills over the following minute. */
const RATE_LIMITED_BASE_MS = 10000;
const RETRY_CAP_MS = 60000;

const LOADING: PerpsMarketDatasetState = {
  availability: 'loading',
  markets: [],
  updatedAt: null,
};

/**
 * 行情数据集（Market Dataset）— the market set and its current prices.
 *
 * The set comes from snapshots and the numbers come from the 数据通道（Data
 * Channel）'s frames, and the two are arbitrated here rather than at the page:
 * frames that arrive before the first snapshot are held and replayed onto it,
 * so a slow REST response cannot leave the list a generation behind, and a
 * frame can never invent or remove a market — which is why a reconnect asks
 * for a snapshot rather than trusting the stream to catch up.
 *
 * The list is a singleton shared by every page that watches it. Market detail
 * is the other shape entirely: one page reads one market and then follows that
 * market's own channel, with no shared state and no background refresh.
 */
@Injectable({ providedIn: 'root' })
export class PerpsMarketDatasetService {
  private readonly source: PerpsMarketSource;

  private readonly state$ = new BehaviorSubject<PerpsMarketDatasetState>(
    LOADING
  );
  private observers = 0;
  private liveSub: Subscription;
  private connectionState: PerpsConnectionState = 'connecting';
  /** Frames seen before the first snapshot, per DEX. */
  private readonly pendingAssetContexts = new Map<string, PerpsAssetCtx[]>();
  /** The snapshot currently in flight, shared by everyone who asks. */
  private snapshotRequest: Observable<PerpsMarket[]> | null = null;
  private retryTimer: any;
  private retryAttempts = 0;

  constructor(
    hyperliquid: HyperliquidService,
    private readonly channel: PerpsDataChannel
  ) {
    this.source = hyperliquid;
  }

  /**
   * The shared live market list.
   *
   * The first observer opens the per-DEX subscriptions and seeds them from a
   * snapshot; the last one closes them. A failure is published as
   * `unavailable` rather than erroring the stream: a retry that succeeds
   * afterwards has to reach the same subscribers, and an errored observable is
   * finished.
   */
  watchMarkets(): Observable<PerpsMarketDatasetState> {
    return new Observable<PerpsMarketDatasetState>((observer) => {
      this.observers += 1;
      if (this.observers === 1) {
        this.start();
      }
      const subscription = this.state$.subscribe(observer);
      this.ensureSnapshot();
      return () => {
        subscription.unsubscribe();
        this.observers -= 1;
        if (this.observers === 0) {
          this.stop();
        }
      };
    });
  }

  /** The current list, snapshotting first only when what is held is too old. */
  getMarkets(): Observable<PerpsMarket[]> {
    const current = this.state$.value;
    if (this.isFresh(current)) {
      return of(current.markets);
    }
    return this.loadSnapshot();
  }

  /**
   * One market's live context, from that market's own feed.
   *
   * The detail page is what a user watches before tapping Long or Short, so it
   * follows that market's `activeAssetCtx` channel rather than the list's
   * per-DEX periodic frames. A frame carries prices and 24h statistics
   * together, so the page never pairs a price from one message with a
   * `prevDayPx` from another.
   *
   * Emits `null` for a coin this build does not carry: a delisted asset, a DEX
   * this build does not enable, or a bad route parameter. That is a different
   * answer from a request that failed, which errors — the page has nothing to
   * show either way, but only one of them is worth offering a retry for.
   */
  watchMarketDetail(coin: string): Observable<PerpsMarket | null> {
    const dex = coin?.includes(':') ? coin.slice(0, coin.indexOf(':')) : '';
    if (!coin || !this.source.enabledDexes.includes(dex)) {
      return of(null);
    }
    return this.marketSnapshot(coin, dex).pipe(
      // The page has nothing at all without this snapshot, and it is a plain
      // read, so a connection that dropped on the way in is worth asking again
      // before the user is told the market could not be loaded. This is the
      // short, evenly-spaced budget a watching user will wait out — not the
      // list's background backoff, which exists to keep already-visible prices
      // alive and has no one staring at a blank screen.
      retryTransientFetch(),
      switchMap((market) =>
        market
          ? concat(
              of(market),
              // Frames that arrive while the snapshot is in flight are lost,
              // which costs nothing: every frame is a complete context, so the
              // next one restates whatever the missed ones said.
              this.channel.subscribe({ type: 'activeAssetCtx', coin }).pipe(
                filter((frame) => !!frame?.ctx),
                map((frame) => ({
                  ...market,
                  ...marketContextFields(frame.ctx),
                }))
              )
            )
          : of(null)
      )
    );
  }

  /**
   * Static metadata plus one context frame for a single market.
   *
   * Only that market's own DEX is asked, which is what keeps the detail page
   * off the all-DEX snapshot the list needs. The DEX is read from the coin
   * itself: a HIP-3 coin carries its DEX as a prefix, and a bare coin is
   * canonical by definition.
   */
  private marketSnapshot(
    coin: string,
    dex: string
  ): Observable<PerpsMarket | null> {
    const registry = dex ? this.source.getDexRegistry() : of([]);
    return registry.pipe(
      switchMap((perpDexs) => {
        const dexIndex = dex
          ? (Array.isArray(perpDexs) ? perpDexs : []).findIndex(
              (item) => item?.name === dex
            )
          : 0;
        if (dexIndex < 0) {
          return of(null);
        }
        return this.source.getMetaAndAssetCtxs(dex || undefined).pipe(
          map(([meta, ctxs]) => {
            const universe = meta?.universe || [];
            const index = universe.findIndex(
              (item) =>
                (dex && !item.name.includes(':')
                  ? `${dex}:${item.name}`
                  : item.name) === coin
            );
            const item = universe[index];
            const ctx = ctxs?.[index];
            if (!item || item.isDelisted || !ctx) {
              return null;
            }
            return buildMarket(item, ctx, dex, dexIndex, index);
          })
        );
      })
    );
  }

  //#region list

  /**
   * One market-context subscription per DEX the product actually shows.
   *
   * The alternative, `allDexsAssetCtxs`, broadcasts every deployed HIP-3 DEX in
   * a single frame — on testnet roughly 170KB of which three quarters is DEXes
   * NeoLine does not list — and it arrives no more often than the per-DEX
   * frames do.
   */
  private start() {
    const stream = new Subscription();
    this.source.enabledDexes.forEach((dex) => {
      stream.add(
        this.channel
          .subscribe({ type: 'assetCtxs', dex })
          .subscribe((update) => this.applyFrame(dex, update?.ctxs))
      );
    });
    stream.add(
      this.channel.watchConnectionState().subscribe((state) => {
        const recovered = this.connectionState === 'stale' && state === 'live';
        this.connectionState = state;
        if (state === 'stale') {
          if (this.state$.value.markets.length) {
            this.publish({ availability: 'stale' });
          }
        } else if (recovered) {
          // Frames restate prices on their own, but they can neither add nor
          // remove a market — so the set is what the reconnect owes.
          this.loadSnapshot().subscribe({ error: () => undefined });
        }
      })
    );
    this.liveSub = stream;
  }

  private stop() {
    this.liveSub?.unsubscribe();
    this.liveSub = undefined;
    clearTimeout(this.retryTimer);
    this.retryTimer = undefined;
  }

  private isFresh(state: PerpsMarketDatasetState): boolean {
    return (
      state.updatedAt !== null && Date.now() - state.updatedAt < SNAPSHOT_TTL_MS
    );
  }

  private ensureSnapshot() {
    const current = this.state$.value;
    if (this.snapshotRequest || this.isFresh(current)) {
      return;
    }
    this.loadSnapshot().subscribe({
      error: (error) => this.onSnapshotError(error),
    });
  }

  private onSnapshotError(error: any) {
    if (this.observers === 0) {
      return;
    }
    if (!this.state$.value.markets.length) {
      this.publish({ availability: 'unavailable' });
      return;
    }
    // Markets are already on screen, so the failure is not the user's problem
    // yet — keep showing them and ask again on a widening interval.
    clearTimeout(this.retryTimer);
    const base = error?.status === 429 ? RATE_LIMITED_BASE_MS : RETRY_BASE_MS;
    const delay = Math.min(
      base * Math.pow(2, this.retryAttempts),
      RETRY_CAP_MS
    );
    this.retryAttempts += 1;
    this.retryTimer = setTimeout(() => this.ensureSnapshot(), delay);
  }

  /**
   * All tradable markets joined with their live context, sorted by 24h volume.
   *
   * Delisted assets are dropped — they still occupy an index in `universe`, so
   * the asset id is taken from the original position and must not be
   * recomputed.
   */
  private loadSnapshot(): Observable<PerpsMarket[]> {
    if (this.snapshotRequest) {
      return this.snapshotRequest;
    }
    const request = this.source.getDexRegistry().pipe(
      switchMap((perpDexs) => this.snapshotRequests(perpDexs)),
      map((responses) => this.foldSnapshot(responses)),
      tap(({ markets, missing }) => {
        this.pendingAssetContexts.clear();
        this.retryAttempts = 0;
        this.snapshotRequest = null;
        this.publish({
          availability: missing ? 'incomplete' : 'live',
          markets,
          updatedAt: Date.now(),
        });
      }),
      map(({ markets }) => markets),
      catchError((error) => {
        this.snapshotRequest = null;
        throw error;
      }),
      // One in-flight snapshot, shared: several pages arriving together must
      // not each spend a request out of the same IP budget.
      shareReplay({ bufferSize: 1, refCount: false })
    );
    this.snapshotRequest = request;
    return request;
  }

  private snapshotRequests(
    perpDexs: any[]
  ): Observable<Array<{ dex: string; dexIndex: number; response: MetaAndAssetCtxs } | null>> {
    const requests = [
      this.source.getMetaAndAssetCtxs().pipe(
        map((response) => ({ dex: '', dexIndex: 0, response }))
      ),
    ];
    const supported = new Set(this.source.enabledDexes.filter(Boolean));
    (Array.isArray(perpDexs) ? perpDexs : []).forEach((item, dexIndex) => {
      const dex = item?.name;
      if (!dex || dexIndex === 0 || !supported.has(dex)) {
        return;
      }
      requests.push(
        this.source.getMetaAndAssetCtxs(dex).pipe(
          map((response) => ({ dex, dexIndex, response })),
          // One unavailable builder DEX must not hide canonical markets — but
          // the list that results is `incomplete`, not `live`.
          catchError(() => of(null))
        )
      );
    });
    return forkJoin(requests);
  }

  private foldSnapshot(
    responses: Array<{ dex: string; dexIndex: number; response: MetaAndAssetCtxs } | null>
  ): { markets: PerpsMarket[]; missing: boolean } {
    const markets: PerpsMarket[] = [];
    responses.filter(Boolean).forEach(({ dex, dexIndex, response }) => {
      const [meta, ctxs] = response || ([] as any);
      (meta?.universe || []).forEach((item, index) => {
        const ctx = ctxs?.[index];
        if (item.isDelisted || !ctx) {
          return;
        }
        markets.push(buildMarket(item, ctx, dex, dexIndex, index));
      });
    });
    const sorted = markets.sort((a, b) =>
      new BigNumber(b.dayVolumeExact).comparedTo(a.dayVolumeExact)
    );
    // Frames that arrived before this snapshot are replayed onto it, so a slow
    // REST response cannot leave the list a generation behind.
    let seeded = sorted;
    this.pendingAssetContexts.forEach((ctxs, dex) => {
      seeded = mergeDexAssetContexts(seeded, dex, ctxs);
    });
    return { markets: seeded, missing: responses.some((r) => r === null) };
  }

  private applyFrame(dex: string, ctxs: PerpsAssetCtx[]) {
    if (!Array.isArray(ctxs) || ctxs.length === 0) {
      return;
    }
    const current = this.state$.value;
    if (!current.markets.length) {
      // The snapshot defines which markets exist; hold the frame until it
      // lands rather than inventing markets from a context array.
      this.pendingAssetContexts.set(dex, ctxs);
      return;
    }
    this.publish({
      markets: mergeDexAssetContexts(current.markets, dex, ctxs),
      updatedAt: Date.now(),
      availability:
        current.availability === 'incomplete' ? 'incomplete' : 'live',
    });
  }

  private publish(patch: Partial<PerpsMarketDatasetState>) {
    this.state$.next({ ...this.state$.value, ...patch });
  }

  //#endregion
}
