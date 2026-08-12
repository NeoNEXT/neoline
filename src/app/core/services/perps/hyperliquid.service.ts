import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import {
  Observable,
  Subject,
  BehaviorSubject,
  Subscription,
  concat,
  of,
  forkJoin,
  from,
} from 'rxjs';
import {
  map,
  catchError,
  shareReplay,
  filter,
  tap,
  switchMap,
} from 'rxjs/operators';
import { ethers } from 'ethers';
import BigNumber from 'bignumber.js';

import {
  HYPERLIQUID_API,
  PerpsAccount,
  PerpsActiveAssetData,
  PerpsAccountMode,
  PerpsAssetCtx,
  PerpsCandle,
  PerpsCandleInterval,
  PerpsDepositConfig,
  PerpsFill,
  PerpsHistoricalOrder,
  PerpsLedgerUpdate,
  PerpsMarket,
  PerpsOpenOrder,
  PerpsOrderBook,
  PerpsOrderRequest,
  PerpsExchangeResponse,
  PerpsPosition,
  PerpsUniverseItem,
  PERPS_BUILDER_ADDRESS,
  PERPS_BUILDER_FEE_TENTHS_BPS,
  PERPS_BUILDER_MAX_FEE_RATE,
  PERPS_DEPOSIT_CONFIG,
  PERPS_HIP3_DEXES,
  PERPS_MAX_SLIPPAGE_PERCENT,
  PERPS_MIN_SLIPPAGE_PERCENT,
} from '@popup/_lib/perps';
import { environment } from '@/environments/environment';
import {
  signHyperliquidApproveBuilderFee,
  signHyperliquidL1Action,
  signHyperliquidUsdClassTransfer,
  signHyperliquidWithdraw,
} from './hyperliquid-signing';

export type PerpsNetwork = 'mainnet' | 'testnet';

interface HyperliquidUserFees {
  userCrossRate: string;
  activeReferralDiscount?: string;
}

export function resolvePerpsTestnet(
  configuredNetwork: PerpsNetwork,
  production = environment.production
): boolean {
  return !production && configuredNetwork === 'testnet';
}

/**
 * Read-only access to Hyperliquid market and account data.
 *
 * Every info request is an unauthenticated POST to the same endpoint, discriminated
 * by a `type` field. Live updates arrive over a single websocket that is opened
 * lazily and shared by all subscribers.
 */
@Injectable({ providedIn: 'root' })
export class HyperliquidService {
  private readonly isTestnet = resolvePerpsTestnet(environment.perpsNetwork);

  private ws: WebSocket;
  private wsReady = false;
  /** Active subscriptions keyed by channel id, so a reconnect can restore them. */
  private activeSubs = new Map<string, any>();
  private channels = new Map<string, Subject<any>>();
  private channelObservers = new Map<string, number>();
  private reconnectAttempts = 0;
  private reconnectTimer: any;
  /** Hyperliquid closes quiet sockets after 60s; ping well before that. */
  private heartbeatTimer: any;
  private readonly heartbeatMs = 30000;

  /**
   * Cache snapshots according to their volatility:
   * - market snapshots have a short TTL and are refreshed by live contexts;
   * - the DEX registry carries no prices and outlives every market snapshot;
   * - spot state persists until a websocket update;
   * - combined account snapshots absorb short navigation/request bursts;
   * - account abstraction is refreshed infrequently.
   */
  private readonly accountCacheMs = 3000;
  private readonly accountModeCacheMs = 30 * 60 * 1000;
  private readonly marketCacheMs = 15000;
  private readonly dexRegistryCacheMs = 6 * 60 * 60 * 1000;
  private readonly userFeeCacheMs = 5 * 60 * 1000;
  private marketCache: {
    expiresAt: number;
    request: Observable<PerpsMarket[]>;
  };
  private dexRegistryCache: {
    expiresAt: number;
    request: Observable<any[]>;
  };
  private marketState$ = new BehaviorSubject<PerpsMarket[] | null>(null);
  private marketError$ = new Subject<any>();
  private marketLiveSub: Subscription;
  private marketObservers = 0;
  private pendingAssetContexts: any;
  private marketSnapshotRetryTimer: any;
  private marketSnapshotAttempts = 0;
  private accountCache = new Map<
    string,
    { expiresAt: number; request: Observable<PerpsAccount> }
  >();
  private spotStateCache = new Map<string, Observable<any>>();
  private accountModeCache = new Map<
    string,
    { expiresAt: number; request: Observable<PerpsAccountMode> }
  >();
  private userTakerFeeCache = new Map<
    string,
    { expiresAt: number; request: Observable<number> }
  >();
  /** Accounts whose builder-fee approval this session has already confirmed. */
  private builderFeeApproved = new Set<string>();
  private lastNonce = 0;

  constructor(private http: HttpClient) {}

  private get api() {
    return this.isTestnet ? HYPERLIQUID_API.testnet : HYPERLIQUID_API.mainnet;
  }

  private get supportedHip3Dexes(): string[] {
    return this.isTestnet
      ? PERPS_HIP3_DEXES.testnet
      : PERPS_HIP3_DEXES.mainnet;
  }

  /** Empty when this build has no builder configured for the active network. */
  get builderAddress(): string {
    const address = this.isTestnet
      ? PERPS_BUILDER_ADDRESS.testnet
      : PERPS_BUILDER_ADDRESS.mainnet;
    return address ? address.toLowerCase() : '';
  }

  /** The `builder` field orders carry, or undefined when the fee is disabled. */
  private get builderField():
    | { b: string; f: number }
    | undefined {
    return this.builderAddress && PERPS_BUILDER_FEE_TENTHS_BPS > 0
      ? { b: this.builderAddress, f: PERPS_BUILDER_FEE_TENTHS_BPS }
      : undefined;
  }

  /**
   * Attach the builder fee to an order action, leaving the action untouched when
   * no builder is configured. Hyperliquid rejects an order whose builder fee
   * exceeds what the account approved, so the two must move together.
   */
  private withBuilder(action: any): any {
    const builder = this.builderField;
    return builder ? { ...action, builder } : action;
  }

  /** Tenths of a basis point this account has already approved for our builder. */
  getMaxBuilderFee(address: string): Observable<number> {
    if (!this.builderAddress) {
      return of(0);
    }
    return this.post<number>({
      type: 'maxBuilderFee',
      user: address.toLowerCase(),
      builder: this.builderAddress,
    }).pipe(map((value) => this.toFiniteNumber(value)));
  }

  /**
   * Make sure the account has approved our builder fee before an order carries
   * it. The approval is a one-time signature per account, so the result is
   * remembered for the session.
   *
   * A failed *query* is not fatal — the approval is attempted anyway, and a
   * redundant one is harmless. A failed *approval* is: the order that follows
   * would be rejected by the exchange, so the error is surfaced rather than
   * swallowed into a silent no-fee order.
   */
  private ensureBuilderFeeApproved(privateKey: string): Observable<void> {
    if (!this.builderField) {
      return of(undefined);
    }
    const user = new ethers.Wallet(privateKey).address.toLowerCase();
    if (this.builderFeeApproved.has(user)) {
      return of(undefined);
    }
    return this.getMaxBuilderFee(user).pipe(
      catchError(() => of(0)),
      switchMap((approved) => {
        if (approved >= PERPS_BUILDER_FEE_TENTHS_BPS) {
          this.builderFeeApproved.add(user);
          return of(undefined);
        }
        return this.approveBuilderFee(privateKey).pipe(
          map(() => {
            this.builderFeeApproved.add(user);
            return undefined;
          })
        );
      })
    );
  }

  /** Sign the one-time approval letting our builder charge its fee. */
  approveBuilderFee(privateKey: string): Observable<PerpsExchangeResponse> {
    const nonce = this.nextNonce();
    return from(
      signHyperliquidApproveBuilderFee(
        privateKey,
        this.builderAddress,
        PERPS_BUILDER_MAX_FEE_RATE,
        nonce,
        !this.isTestnet
      )
    ).pipe(
      switchMap(({ action, signature }) =>
        this.postExchange(action, signature, nonce)
      )
    );
  }

  /** Bridge2 funding chain/token matching the configured endpoint. */
  get depositConfig(): PerpsDepositConfig {
    return this.isTestnet
      ? PERPS_DEPOSIT_CONFIG.testnet
      : PERPS_DEPOSIT_CONFIG.mainnet;
  }

  //#region info requests

  private post<T>(body: any): Observable<T> {
    return this.http.post<T>(this.api.info, body, {
      headers: { 'Content-Type': 'application/json' },
    });
  }

  /**
   * User-specific perps taker rate, including the active referral discount.
   * Staking and volume tier adjustments are already reflected in userCrossRate.
   */
  getUserTakerFeeRate(address: string): Observable<number> {
    const user = address.toLowerCase();
    const cached = this.userTakerFeeCache.get(user);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.request;
    }

    const request = this.post<HyperliquidUserFees>({
      type: 'userFees',
      user,
    }).pipe(
      map((fees) => {
        const userCrossRate = Number(fees?.userCrossRate);
        const referralDiscount = Number(
          fees?.activeReferralDiscount || 0
        );
        if (
          !Number.isFinite(userCrossRate) ||
          userCrossRate < 0 ||
          !Number.isFinite(referralDiscount) ||
          referralDiscount < 0 ||
          referralDiscount > 1
        ) {
          throw new Error('Invalid Hyperliquid user fee response');
        }
        return userCrossRate * (1 - referralDiscount);
      }),
      catchError((error) => {
        this.userTakerFeeCache.delete(user);
        throw error;
      }),
      shareReplay(1)
    );
    this.userTakerFeeCache.set(user, {
      expiresAt: Date.now() + this.userFeeCacheMs,
      request,
    });
    return request;
  }

  private postExchange(
    action: any,
    signature: any,
    nonce: number
  ): Observable<PerpsExchangeResponse> {
    return this.http
      .post<PerpsExchangeResponse>(
        this.api.exchange,
        { action, nonce, signature },
        { headers: { 'Content-Type': 'application/json' } }
      )
      .pipe(
        map((response) => {
          if (response?.status !== 'ok') {
            throw new Error(response?.error || 'Hyperliquid rejected the action');
          }
          const errorStatus = response.response?.data?.statuses?.find(
            (status: any) => status?.error
          ) as { error: string };
          if (errorStatus?.error) {
            throw new Error(errorStatus.error);
          }
          return response;
        })
      );
  }

  private nextNonce(): number {
    const now = Date.now();
    this.lastNonce = Math.max(now, this.lastNonce + 1);
    return this.lastNonce;
  }

  private clearAccountCache() {
    this.accountCache.clear();
    this.spotStateCache.clear();
  }

  private signedL1Action(
    privateKey: string,
    action: any
  ): Observable<PerpsExchangeResponse> {
    const nonce = this.nextNonce();
    return from(
      signHyperliquidL1Action(privateKey, action, nonce, !this.isTestnet)
    ).pipe(
      switchMap((signature) => this.postExchange(action, signature, nonce)),
      tap(() => this.clearAccountCache())
    );
  }

  /** Market orders are IOC limits priced this far through the mark. */
  private slippageFraction(slippagePercent: number): number {
    return (
      Math.max(
        PERPS_MIN_SLIPPAGE_PERCENT,
        Math.min(PERPS_MAX_SLIPPAGE_PERCENT, slippagePercent)
      ) / 100
    );
  }

  /**
   * Set the requested leverage / margin mode (`isCross`) and place one order.
   * Callers currently open isolated so the per-order liquidation preview is
   * binding. Market orders use an IOC limit priced through the mid — the price
   * the caller supplies — according to its configured slippage tolerance.
   */
  placeOrder(
    privateKey: string,
    request: PerpsOrderRequest
  ): Observable<PerpsExchangeResponse> {
    const leverage = Math.max(
      1,
      Math.min(request.maxLeverage, Math.floor(request.leverage))
    );
    const slippage = this.slippageFraction(request.slippagePercent);
    const price =
      request.orderType === 'market'
        ? new BigNumber(request.price).times(
            new BigNumber(1)[request.isBuy ? 'plus' : 'minus'](slippage)
          )
        : new BigNumber(request.price);
    const wirePrice = this.roundPrice(
      price,
      request.szDecimals,
      request.orderType === 'market'
        ? request.isBuy
          ? BigNumber.ROUND_FLOOR
          : BigNumber.ROUND_CEIL
        : BigNumber.ROUND_HALF_UP
    );
    const action = this.withBuilder({
      type: 'order',
      orders: [
        {
          a: request.assetId,
          b: request.isBuy,
          p: this.floatToWire(wirePrice),
          s: this.floatToWire(String(request.size)),
          r: request.reduceOnly,
          t: {
            limit: {
              tif: request.orderType === 'market' ? 'Ioc' : 'Gtc',
            },
          },
        },
      ],
      grouping: 'na',
    });
    return this.ensureBuilderFeeApproved(privateKey).pipe(
      switchMap(() => {
        if (request.reduceOnly) {
          return this.signedL1Action(privateKey, action);
        }
        return this.signedL1Action(privateKey, {
          type: 'updateLeverage',
          asset: request.assetId,
          isCross: request.isCross,
          leverage,
        }).pipe(switchMap(() => this.signedL1Action(privateKey, action)));
      })
    );
  }

  withdraw(
    privateKey: string,
    destination: string,
    amount: string
  ): Observable<PerpsExchangeResponse> {
    const nonce = this.nextNonce();
    const amountWire = this.floatToWire(amount);
    return from(
      signHyperliquidWithdraw(
        privateKey,
        destination,
        amountWire,
        nonce,
        !this.isTestnet
      )
    ).pipe(
      switchMap(({ action, signature }) =>
        this.postExchange(action, signature, nonce)
      ),
      tap(() => this.clearAccountCache())
    );
  }

  /** Move USDC between Hyperliquid Spot and Perps for standard accounts. */
  transferUsdClass(
    privateKey: string,
    amount: string,
    toPerp: boolean
  ): Observable<PerpsExchangeResponse> {
    const nonce = this.nextNonce();
    return from(
      signHyperliquidUsdClassTransfer(
        privateKey,
        this.floatToWire(amount),
        toPerp,
        nonce,
        !this.isTestnet
      )
    ).pipe(
      switchMap(({ action, signature }) =>
        this.postExchange(action, signature, nonce)
      ),
      tap(() => this.clearAccountCache())
    );
  }

  /** Send native USDC to Bridge2 from the same address that will be credited. */
  deposit(privateKey: string, amount: string): Observable<string> {
    const config = this.depositConfig;
    return from(
      (async () => {
        const provider = new ethers.JsonRpcProvider(config.rpc);
        const signer = new ethers.Wallet(privateKey, provider);
        const token = new ethers.Contract(
          config.address,
          ['function transfer(address to, uint256 amount) returns (bool)'],
          signer
        );
        const transaction = await token.transfer(
          config.bridgeAddress,
          ethers.parseUnits(this.floatToWire(amount), config.decimals)
        );
        await transaction.wait();
        this.clearAccountCache();
        return transaction.hash as string;
      })()
    );
  }

  /**
   * Hyperliquid wire numbers allow at most 8 decimals and no trailing zeroes.
   */
  private floatToWire(value: string): string {
    const decimal = new BigNumber(value);
    if (!decimal.isFinite()) {
      throw new Error('Invalid Hyperliquid number');
    }
    if ((decimal.decimalPlaces() || 0) > 8) {
      throw new Error('Hyperliquid number exceeds 8 decimal places');
    }
    return decimal.isZero() ? '0' : decimal.toFixed();
  }

  /**
   * Perp prices use at most five significant figures and 6-szDecimals places.
   */
  private roundPrice(
    price: BigNumber,
    szDecimals: number,
    roundingMode: BigNumber.RoundingMode = BigNumber.ROUND_HALF_UP
  ): string {
    const maxDecimals = Math.max(0, 6 - szDecimals);
    const numericPrice = price.toNumber();
    const significantDecimals = Math.max(
      0,
      5 - Math.floor(Math.log10(Math.abs(numericPrice))) - 1
    );
    return price
      .decimalPlaces(
        Math.min(maxDecimals, significantDecimals),
        roundingMode
      )
      .toFixed();
  }

  /**
   * Registry of builder-deployed DEXes. A DEX's position in this list is baked
   * into the asset ids of its markets, so entries are append-only and the whole
   * response is worth caching far longer than the prices it feeds. A failure is
   * never cached: it degrades this refresh to canonical markets and is retried.
   */
  private getDexRegistry(): Observable<any[]> {
    if (this.supportedHip3Dexes.length === 0) {
      return of([]);
    }
    const now = Date.now();
    if (this.dexRegistryCache?.expiresAt > now) {
      return this.dexRegistryCache.request;
    }
    const request = this.post<any[]>({ type: 'perpDexs' }).pipe(
      catchError(() => {
        if (this.dexRegistryCache?.request === request) {
          this.dexRegistryCache = undefined;
        }
        // Older/self-hosted API servers may not expose HIP-3 discovery yet.
        return of([]);
      }),
      shareReplay({ bufferSize: 1, refCount: false })
    );
    this.dexRegistryCache = {
      expiresAt: now + this.dexRegistryCacheMs,
      request,
    };
    return request;
  }

  /**
   * All tradable markets joined with their live context, sorted by 24h volume.
   * Delisted assets are dropped — they still occupy an index in `universe`, so the
   * asset id is taken from the original position and must not be recomputed.
   */
  getMarkets(): Observable<PerpsMarket[]> {
    const now = Date.now();
    if (this.marketCache?.expiresAt > now) {
      const current = this.marketState$.value;
      return current !== null ? of(current) : this.marketCache.request;
    }
    const supportedHip3Dexes = this.supportedHip3Dexes;
    const request = this.getDexRegistry().pipe(
      switchMap((perpDexs) => {
        const dexRequests: Array<
          Observable<{
            dex: string;
            dexIndex: number;
            response: [{ universe: PerpsUniverseItem[] }, PerpsAssetCtx[]];
          }>
        > = [
          this.post<
            [{ universe: PerpsUniverseItem[] }, PerpsAssetCtx[]]
          >({ type: 'metaAndAssetCtxs' }).pipe(
            map((response) => ({ dex: '', dexIndex: 0, response }))
          ),
        ];
        const supportedDexes = new Set(supportedHip3Dexes);
        (Array.isArray(perpDexs) ? perpDexs : []).forEach((item, dexIndex) => {
          const dex = item?.name;
          if (!dex || dexIndex === 0 || !supportedDexes.has(dex)) {
            return;
          }
          dexRequests.push(
            this.post<
              [{ universe: PerpsUniverseItem[] }, PerpsAssetCtx[]]
            >({ type: 'metaAndAssetCtxs', dex }).pipe(
              map((response) => ({ dex, dexIndex, response })),
              // One unavailable builder DEX must not hide canonical markets.
              catchError(() => of(null))
            )
          );
        });
        return forkJoin(dexRequests);
      }),
      map((dexResponses) => {
        const markets: PerpsMarket[] = [];
        dexResponses.filter(Boolean).forEach(({ dex, dexIndex, response }) => {
          const [meta, ctxs] = response || ([] as any);
          (meta?.universe || []).forEach((item, index) => {
            const ctx = ctxs?.[index];
            if (item.isDelisted || !ctx) {
              return;
            }
            markets.push({
              assetId: dex
                ? 100000 + dexIndex * 10000 + index
                : index,
              dex,
              dexAssetIndex: index,
              coin:
                dex && !item.name.includes(':')
                  ? `${dex}:${item.name}`
                  : item.name,
              szDecimals: item.szDecimals,
              maxLeverage: item.maxLeverage,
              onlyIsolated: !!item.onlyIsolated,
              ...this.marketContextFields(ctx),
            });
          });
        });
        const sorted = markets.sort((a, b) => b.dayVolume - a.dayVolume);
        return this.pendingAssetContexts
          ? this.updateMarketsFromAssetContexts(
              sorted,
              this.pendingAssetContexts
            )
          : sorted;
      }),
      tap((markets) => {
        this.pendingAssetContexts = undefined;
        this.marketSnapshotAttempts = 0;
        this.marketState$.next(markets);
      }),
      catchError((error) => {
        if (this.marketCache?.request === request) {
          this.marketCache = undefined;
        }
        throw error;
      }),
      shareReplay({ bufferSize: 1, refCount: false })
    );
    this.marketCache = {
      expiresAt: now + this.marketCacheMs,
      request,
    };
    return request;
  }

  /**
   * Shared live market stream. The first observer opens the websocket and seeds
   * it from REST; the last observer closes the market subscription.
   */
  watchMarkets(): Observable<PerpsMarket[]> {
    return new Observable<PerpsMarket[]>((observer) => {
      this.marketObservers += 1;
      if (this.marketObservers === 1) {
        this.startMarketStream();
      }
      const stateSub = this.marketState$
        .pipe(
          filter(
            (markets): markets is PerpsMarket[] => markets !== null
          )
        )
        .subscribe(observer);
      const errorSub = this.marketError$.subscribe((error) => observer.error(error));
      this.loadMarketSnapshot();
      return () => {
        stateSub.unsubscribe();
        errorSub.unsubscribe();
        this.marketObservers -= 1;
        if (this.marketObservers === 0) {
          this.marketLiveSub?.unsubscribe();
          this.marketLiveSub = undefined;
          clearTimeout(this.marketSnapshotRetryTimer);
        }
      };
    });
  }

  private startMarketStream() {
    this.marketLiveSub = this.subscribe({ type: 'allDexsAssetCtxs' }).subscribe(
      (update) => {
        const current = this.marketState$.value;
        if (!current || current.length === 0) {
          this.pendingAssetContexts = update;
          return;
        }
        const updated = this.updateMarketsFromAssetContexts(current, update);
        this.marketState$.next(updated);
        this.marketCache = {
          expiresAt: Date.now() + this.marketCacheMs,
          request: of(updated),
        };
      }
    );
  }

  getOrderBook(coin: string): Observable<PerpsOrderBook> {
    return this.post<any>({ type: 'l2Book', coin }).pipe(
      map((book) => this.parseOrderBook(book))
    );
  }

  /** Seed from REST, then follow Hyperliquid's live level-2 book snapshots. */
  watchOrderBook(coin: string): Observable<PerpsOrderBook> {
    return concat(
      this.getOrderBook(coin).pipe(catchError(() => of(null))),
      this.subscribe({ type: 'l2Book', coin }).pipe(
        map((book) => this.parseOrderBook(book))
      )
    ).pipe(filter((book) => !!book));
  }

  private parseOrderBook(book: any): PerpsOrderBook {
    if (!book || !Array.isArray(book.levels)) {
      return null;
    }
    const parseLevels = (levels: any[]) =>
      (Array.isArray(levels) ? levels : [])
        .map((level) => ({
          price: this.toFiniteNumber(level?.px),
          size: this.toFiniteNumber(level?.sz),
        }))
        .filter((level) => level.price > 0 && level.size > 0);
    return {
      coin: book.coin,
      time: this.toFiniteNumber(book.time),
      bids: parseLevels(book.levels[0]),
      asks: parseLevels(book.levels[1]),
    };
  }

  private loadMarketSnapshot() {
    this.getMarkets().subscribe({
      error: (error) => {
        if (this.marketObservers === 0) {
          return;
        }
        if (this.marketState$.value === null) {
          this.marketError$.next(error);
          return;
        }
        clearTimeout(this.marketSnapshotRetryTimer);
        // A 429 is an IP budget that only refills over the following minute, so
        // a one-second retry just spends the next slot on another refusal.
        const base = error?.status === 429 ? 10000 : 1000;
        const delay = Math.min(
          base * Math.pow(2, this.marketSnapshotAttempts),
          60000
        );
        this.marketSnapshotAttempts += 1;
        this.marketSnapshotRetryTimer = setTimeout(
          () => this.loadMarketSnapshot(),
          delay
        );
      },
    });
  }

  /**
   * Merge the main DEX entry from an `allDexsAssetCtxs` websocket payload.
   * Context indexes match the original universe, so sorted market positions
   * must never be used as asset identifiers.
   */
  updateMarketsFromAssetContexts(
    markets: PerpsMarket[],
    update: any
  ): PerpsMarket[] {
    const contextsByDex = this.assetContextsByDex(update?.ctxs);
    if (contextsByDex.size === 0) {
      return markets;
    }
    const updated = markets
      .map((market) => {
        const ctxs = contextsByDex.get(market.dex || '');
        const ctx = ctxs?.[market.dexAssetIndex ?? market.assetId];
        if (!ctx) {
          return market;
        }
        return {
          ...market,
          ...this.marketContextFields(ctx),
        };
      })
      .sort((a, b) => b.dayVolume - a.dayVolume);
    return updated;
  }

  private marketContextFields(
    ctx: PerpsAssetCtx
  ): Pick<
    PerpsMarket,
    | 'markPx'
    | 'midPx'
    | 'oraclePx'
    | 'prevDayPx'
    | 'changePercent'
    | 'dayVolume'
    | 'openInterest'
    | 'funding'
  > {
    const markPx = Number(ctx.markPx);
    const rawMidPx = Number(ctx.midPx);
    // `midPx` is null whenever a side of the book is empty; the mark is the
    // only price left to trade against then.
    const midPx =
      Number.isFinite(rawMidPx) && rawMidPx > 0 ? rawMidPx : markPx;
    const prevDayPx = Number(ctx.prevDayPx);
    return {
      markPx,
      midPx,
      oraclePx: Number(ctx.oraclePx),
      prevDayPx,
      // Quoted against the mid, which is the price every screen displays, so a
      // price and the change beside it can never disagree. The mark is an
      // oracle-weighted price that lags the book by design; it stays reserved
      // for margin, liquidation and position valuation.
      changePercent: prevDayPx ? ((midPx - prevDayPx) / prevDayPx) * 100 : 0,
      dayVolume: Number(ctx.dayNtlVlm),
      openInterest: Number(ctx.openInterest) * markPx,
      funding: Number(ctx.funding),
    };
  }

  private mainDexAssetContexts(raw: any): PerpsAssetCtx[] {
    return this.assetContextsByDex(raw).get('') || [];
  }

  private assetContextsByDex(raw: any): Map<string, PerpsAssetCtx[]> {
    const result = new Map<string, PerpsAssetCtx[]>();
    if (Array.isArray(raw)) {
      raw.forEach((entry) => {
        if (
          Array.isArray(entry) &&
          typeof entry[0] === 'string' &&
          Array.isArray(entry[1])
        ) {
          result.set(entry[0], entry[1]);
        }
      });
      if (result.size > 0) {
        return result;
      }
      // Compatibility with a direct context array if the API shape changes.
      if (raw.every((entry) => !Array.isArray(entry))) {
        result.set('', raw);
        return result;
      }
    }
    if (raw && typeof raw === 'object') {
      Object.keys(raw).forEach((dex) => {
        if (Array.isArray(raw[dex])) {
          result.set(dex, raw[dex]);
        }
      });
    }
    return result;
  }

  /**
   * Perps account state for `address`; returns an empty account when unfunded.
   * `userAbstraction` decides how the numbers are read: a unified account
   * collateralises perps from its spot USDC (so the spot balance is the source
   * of truth), while a standard account keeps perps and spot in separate wallets.
   * The spot clearinghouse is fetched either way so a funded unified account is
   * not reported as $0, and so a standard account's spot balance can be shown as
   * the separate wallet it is.
   */
  getAccount(address: string): Observable<PerpsAccount> {
    const user = address.toLowerCase();
    const now = Date.now();
    const cached = this.accountCache.get(user);
    if (cached?.expiresAt > now) {
      return cached.request;
    }
    const request = forkJoin([
      this.post<any>({ type: 'clearinghouseState', user }),
      this.getSpotState(user),
      this.getAccountMode(user),
    ]).pipe(
      map(([perps, spot, mode]) => this.parseAccount(perps, spot, mode)),
      catchError((error) => {
        if (this.accountCache.get(user)?.request === request) {
          this.accountCache.delete(user);
        }
        throw error;
      }),
      shareReplay({ bufferSize: 1, refCount: false })
    );
    this.accountCache.set(user, {
      expiresAt: now + this.accountCacheMs,
      request,
    });
    return request;
  }

  /**
   * Hyperliquid's authoritative per-side order capacity for one perp.
   * Tuple order is [long/buy, short/sell].
   */
  getActiveAssetData(
    address: string,
    coin: string
  ): Observable<PerpsActiveAssetData> {
    return this.post<any>({
      type: 'activeAssetData',
      user: address.toLowerCase(),
      coin,
    }).pipe(
      map((data) => this.parseActiveAssetData(data)),
      catchError(() => of(null))
    );
  }

  /**
   * Seed the order form from REST, then keep it aligned with account/market
   * changes through Hyperliquid's matching websocket subscription.
   */
  watchActiveAssetData(
    address: string,
    coin: string
  ): Observable<PerpsActiveAssetData> {
    const user = address.toLowerCase();
    return concat(
      this.getActiveAssetData(user, coin),
      this.subscribe({ type: 'activeAssetData', user, coin }).pipe(
        map((data) => this.parseActiveAssetData(data))
      )
    ).pipe(filter((data) => !!data));
  }

  private parseActiveAssetData(data: any): PerpsActiveAssetData {
    if (
      !data ||
      !Array.isArray(data.maxTradeSzs) ||
      !Array.isArray(data.availableToTrade)
    ) {
      return null;
    }
    const maxTradeSzs: [number, number] = [
      this.toFiniteNumber(data.maxTradeSzs[0]),
      this.toFiniteNumber(data.maxTradeSzs[1]),
    ];
    const availableToTrade: [number, number] = [
      this.toFiniteNumber(data.availableToTrade[0]),
      this.toFiniteNumber(data.availableToTrade[1]),
    ];
    return {
      user: data.user,
      coin: data.coin,
      leverage: {
        type: data.leverage?.type === 'isolated' ? 'isolated' : 'cross',
        value: this.toFiniteNumber(data.leverage?.value) || 1,
        rawUsd:
          data.leverage?.rawUsd === undefined
            ? undefined
            : this.toFiniteNumber(data.leverage.rawUsd),
      },
      maxTradeSzs,
      availableToTrade,
      markPx: this.toFiniteNumber(data.markPx),
    };
  }

  /** Initial spot snapshot; subsequent values are replaced by `spotState` pushes. */
  private getSpotState(user: string): Observable<any> {
    const cached = this.spotStateCache.get(user);
    if (cached) {
      return cached;
    }
    const request = this.post<any>({
      type: 'spotClearinghouseState',
      user,
    }).pipe(
      catchError(() => {
        if (this.spotStateCache.get(user) === request) {
          this.spotStateCache.delete(user);
        }
        return of(null);
      }),
      shareReplay({ bufferSize: 1, refCount: false })
    );
    this.spotStateCache.set(user, request);
    return request;
  }

  /**
   * Account abstraction rarely changes. Refresh it at most every 30 minutes,
   * while address and network changes invalidate it immediately.
   */
  private getAccountMode(user: string): Observable<PerpsAccountMode> {
    const now = Date.now();
    const cached = this.accountModeCache.get(user);
    if (cached?.expiresAt > now) {
      return cached.request;
    }
    const request = this.post<PerpsAccountMode>({
      type: 'userAbstraction',
      user,
    }).pipe(
      // Fail closed: an unknown mode must never fold spot into collateral.
      catchError(() => {
        if (this.accountModeCache.get(user)?.request === request) {
          this.accountModeCache.delete(user);
        }
        return of('unknown' as PerpsAccountMode);
      }),
      shareReplay({ bufferSize: 1, refCount: false })
    );
    this.accountModeCache.set(user, {
      expiresAt: now + this.accountModeCacheMs,
      request,
    });
    return request;
  }

  /**
   * USDC in the spot/unified wallet (token index 0). `total` is the whole
   * balance; `hold` is the slice already reserved as margin for open perps
   * positions, so `total - hold` is what is still free to back new orders.
   */
  private parseSpotUsdc(spot: any): {
    total: number;
    hold: number;
    totalExact: string;
    holdExact: string;
    freeExact: string;
  } {
    const balance = (spot?.balances || []).find(
      (b) => b.coin === 'USDC' || b.token === 0
    );
    const totalExact = this.toFiniteDecimal(balance?.total);
    const holdExact = this.toFiniteDecimal(balance?.hold);
    const freeExact = BigNumber.maximum(
      0,
      new BigNumber(totalExact).minus(holdExact)
    ).toFixed();
    return {
      total: Number(totalExact),
      hold: Number(holdExact),
      totalExact,
      holdExact,
      freeExact,
    };
  }

  /**
   * Merge a websocket `spotState` payload into an existing account snapshot.
   * The push already contains the complete spot balance, so refreshing three
   * REST snapshots here would only duplicate data and amplify every update.
   */
  updateAccountFromSpotState(
    account: PerpsAccount,
    update: any
  ): PerpsAccount {
    if (!account) {
      return account;
    }
    const spot = update?.spotState || update;
    if (!Array.isArray(spot?.balances)) {
      return account;
    }
    const {
      total: spotUsdc,
      hold: spotUsdcHold,
      totalExact: spotUsdcExact,
      holdExact: spotUsdcHoldExact,
      freeExact: freeSpotUsdcExact,
    } = this.parseSpotUsdc(spot);
    const freeSpotUsdc = Number(freeSpotUsdcExact);
    const foldedSpot = account.unified ? freeSpotUsdc : 0;
    const foldedSpotExact = account.unified ? freeSpotUsdcExact : '0';
    const availableBalanceExact = new BigNumber(
      account.withdrawableExact ?? account.withdrawable
    )
      .plus(foldedSpotExact)
      .toFixed();
    const updated = {
      ...account,
      totalBalance: account.unified
        ? account.accountValue + freeSpotUsdc
        : account.accountValue,
      availableBalance: account.withdrawable + foldedSpot,
      availableBalanceExact,
      spotUsdc,
      spotUsdcExact,
      spotUsdcHold,
      spotUsdcHoldExact,
    };
    const user =
      typeof update?.user === 'string' ? update.user.toLowerCase() : undefined;
    if (user) {
      this.spotStateCache.set(user, of(spot));
      this.cacheAccount(user, updated);
    }
    return updated;
  }

  /** Merge a websocket `clearinghouseState` payload with the latest spot data. */
  updateAccountFromClearinghouseState(
    account: PerpsAccount,
    update: any
  ): PerpsAccount {
    if (!account) {
      return account;
    }
    const perps = update?.clearinghouseState || update;
    if (!perps?.marginSummary) {
      return account;
    }
    const spot = {
      balances: [
        {
          coin: 'USDC',
          token: 0,
          total: account.spotUsdcExact ?? String(account.spotUsdc),
          hold: account.spotUsdcHoldExact ?? String(account.spotUsdcHold),
        },
      ],
    };
    const updated = this.parseAccount(
      perps,
      spot,
      account.abstractionMode
    );
    const user =
      typeof update?.user === 'string' ? update.user.toLowerCase() : undefined;
    if (user) {
      this.cacheAccount(user, updated);
    }
    return updated;
  }

  private cacheAccount(user: string, account: PerpsAccount) {
    this.accountCache.set(user, {
      expiresAt: Date.now() + this.accountCacheMs,
      request: of(account),
    });
  }

  /**
   * Only `unifiedAccount` and `portfolioMargin` treat spot USDC as perps
   * collateral; every other mode (`default`, `disabled`, …) keeps them separate.
   */
  private isUnifiedMode(mode: PerpsAccountMode): boolean {
    return mode === 'unifiedAccount' || mode === 'portfolioMargin';
  }

  private parseAccount(
    res: any,
    spot?: any,
    mode: PerpsAccountMode = 'unknown'
  ): PerpsAccount {
    const unified = this.isUnifiedMode(mode);
    const {
      total: spotUsdc,
      hold: spotUsdcHold,
      totalExact: spotUsdcExact,
      holdExact: spotUsdcHoldExact,
      freeExact: freeSpotUsdcExact,
    } = this.parseSpotUsdc(spot);
    const freeSpotUsdc = Number(freeSpotUsdcExact);
    if (!res || !res.marginSummary) {
      return {
        ...this.emptyAccount(),
        unified,
        abstractionMode: mode,
        totalBalance: unified ? freeSpotUsdc : 0,
        availableBalance: unified ? freeSpotUsdc : 0,
        availableBalanceExact: unified ? freeSpotUsdcExact : '0',
        spotUsdc,
        spotUsdcExact,
        spotUsdcHold,
        spotUsdcHoldExact,
      };
    }
    const positions: PerpsPosition[] = (res.assetPositions || [])
      .map((item) => item.position)
      .filter((p) => p && Number(p.szi) !== 0)
      .map((p) => {
        const szi = Number(p.szi);
        return {
          coin: p.coin,
          szi,
          isLong: szi > 0,
          entryPx: Number(p.entryPx),
          positionValue: Number(p.positionValue),
          unrealizedPnl: Number(p.unrealizedPnl),
          returnOnEquity: Number(p.returnOnEquity),
          // Null for positions that cannot be liquidated at any price.
          liquidationPx: p.liquidationPx === null ? 0 : Number(p.liquidationPx),
          leverage: Number(p.leverage?.value ?? 1),
          leverageType: p.leverage?.type ?? 'cross',
          marginUsed: Number(p.marginUsed),
        } as PerpsPosition;
      });
    const accountValue = this.toFiniteNumber(res.marginSummary.accountValue);
    const withdrawable = this.toFiniteNumber(res.withdrawable);
    const withdrawableExact = this.toFiniteDecimal(res.withdrawable);
    const foldedSpot = unified ? freeSpotUsdc : 0;
    const availableBalanceExact = new BigNumber(withdrawableExact)
      .plus(unified ? freeSpotUsdcExact : 0)
      .toFixed();
    const maintenanceMarginUsed = this.toFiniteNumber(
      res.crossMaintenanceMarginUsed
    );
    const standardRiskCapital = this.toFiniteNumber(
      res.crossMarginSummary?.accountValue ?? accountValue
    );
    return {
      unified,
      abstractionMode: mode,
      accountValue,
      totalBalance: unified ? accountValue + freeSpotUsdc : accountValue,
      totalMarginUsed: this.toFiniteNumber(res.marginSummary.totalMarginUsed),
      totalNtlPos: this.toFiniteNumber(res.marginSummary.totalNtlPos),
      marginRatio: unified
        ? null
        : this.calculateMarginRatio(
            maintenanceMarginUsed,
            standardRiskCapital
          ),
      withdrawable,
      withdrawableExact,
      availableBalance: withdrawable + foldedSpot,
      availableBalanceExact,
      spotUsdc,
      spotUsdcExact,
      spotUsdcHold,
      spotUsdcHoldExact,
      positions,
    };
  }

  private toFiniteNumber(value: any): number {
    const parsed = Number(value ?? 0);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  /** Keep API decimal strings intact for values that can flow back into a signature. */
  private toFiniteDecimal(value: any): string {
    const parsed = new BigNumber(value ?? 0);
    return parsed.isFinite() ? (parsed.isZero() ? '0' : parsed.toFixed()) : '0';
  }

  private calculateMarginRatio(
    maintenanceMarginUsed: number,
    riskCapital: number
  ): number {
    return riskCapital > 0 ? (maintenanceMarginUsed / riskCapital) * 100 : 0;
  }

  private emptyAccount(): PerpsAccount {
    return {
      unified: false,
      abstractionMode: 'unknown',
      accountValue: 0,
      totalBalance: 0,
      totalMarginUsed: 0,
      totalNtlPos: 0,
      marginRatio: null,
      withdrawable: 0,
      withdrawableExact: '0',
      availableBalance: 0,
      availableBalanceExact: '0',
      spotUsdc: 0,
      spotUsdcExact: '0',
      spotUsdcHold: 0,
      spotUsdcHoldExact: '0',
      positions: [],
    };
  }

  /**
   * Historical candles. Hyperliquid returns at most the 5000 most recent candles
   * and ignores ranges beyond that, so `limit` only trims the tail we render.
   */
  getCandles(
    coin: string,
    interval: PerpsCandleInterval,
    limit = 120
  ): Observable<PerpsCandle[]> {
    const endTime = Date.now();
    const startTime = endTime - this.intervalMs(interval) * limit;
    return this.post<PerpsCandle[]>({
      type: 'candleSnapshot',
      req: { coin, interval, startTime, endTime },
    }).pipe(map((res) => (Array.isArray(res) ? res.slice(-limit) : [])));
  }

  getUserFills(address: string): Observable<PerpsFill[]> {
    return this.post<PerpsFill[]>({
      type: 'userFills',
      user: address.toLowerCase(),
    }).pipe(map((res) => (Array.isArray(res) ? res : [])));
  }

  /** Websocket snapshot followed by incremental fill pushes. */
  watchUserFills(address: string): Observable<any> {
    const user = address.toLowerCase();
    return this.subscribe({ type: 'userFills', user });
  }

  /** Active orders that can still fill and therefore must remain manageable. */
  getOpenOrders(address: string): Observable<PerpsOpenOrder[]> {
    return this.post<PerpsOpenOrder[]>({
      type: 'frontendOpenOrders',
      user: address.toLowerCase(),
    }).pipe(map((res) => (Array.isArray(res) ? res : [])));
  }

  /** Full open-order snapshots pushed whenever the user's book changes. */
  watchOpenOrders(address: string): Observable<PerpsOpenOrder[]> {
    const user = address.toLowerCase();
    return this.subscribe({ type: 'openOrders', user }).pipe(
      map((data) => (Array.isArray(data?.orders) ? data.orders : []))
    );
  }

  /** Orders that already left the book. Hyperliquid caps this at 2000 rows. */
  getHistoricalOrders(address: string): Observable<PerpsHistoricalOrder[]> {
    return this.post<PerpsHistoricalOrder[]>({
      type: 'historicalOrders',
      user: address.toLowerCase(),
    }).pipe(map((res) => (Array.isArray(res) ? res : [])));
  }

  /**
   * Bridge deposits/withdrawals plus transfers. Funding payments live on a
   * separate endpoint and are intentionally excluded here.
   */
  getLedgerUpdates(address: string): Observable<PerpsLedgerUpdate[]> {
    return this.post<PerpsLedgerUpdate[]>({
      type: 'userNonFundingLedgerUpdates',
      user: address.toLowerCase(),
      startTime: 0,
    }).pipe(map((res) => (Array.isArray(res) ? res : [])));
  }

  cancelOrder(
    privateKey: string,
    assetId: number,
    orderId: number
  ): Observable<PerpsExchangeResponse> {
    return this.signedL1Action(privateKey, {
      type: 'cancel',
      cancels: [{ a: assetId, o: orderId }],
    });
  }

  intervalMs(interval: PerpsCandleInterval): number {
    const unit = interval.slice(-1);
    const value = Number(interval.slice(0, -1));
    const table = { m: 60e3, h: 3600e3, d: 86400e3 };
    return value * (table[unit] || 60e3);
  }

  //#endregion

  //#region websocket

  /**
   * Subscribe to a websocket channel. The returned observable replays nothing;
   * callers should seed their view from the REST snapshot first.
   */
  subscribe(subscription: any): Observable<any> {
    return new Observable<any>((observer) => {
      const key = this.channelKey(subscription);
      let channel = this.channels.get(key);
      if (!channel) {
        channel = new Subject<any>();
        this.channels.set(key, channel);
        this.activeSubs.set(key, subscription);
        this.send({ method: 'subscribe', subscription });
      }
      this.channelObservers.set(
        key,
        (this.channelObservers.get(key) || 0) + 1
      );
      const channelSub = channel.subscribe(observer);
      return () => {
        channelSub.unsubscribe();
        const observers = (this.channelObservers.get(key) || 1) - 1;
        if (observers > 0) {
          this.channelObservers.set(key, observers);
          return;
        }
        this.channelObservers.delete(key);
        this.channels.delete(key);
        this.activeSubs.delete(key);
        if (this.wsReady) {
          this.send({ method: 'unsubscribe', subscription });
        }
        if (this.channels.size === 0) {
          this.closeSocket();
        }
      };
    });
  }

  /**
   * Channel identity includes every selector that distinguishes subscriptions.
   */
  private channelKey(subscription: any): string {
    const { type, coin, interval } = subscription;
    const user =
      typeof subscription.user === 'string'
        ? subscription.user.toLowerCase()
        : undefined;
    return [type, user, coin, interval].filter(Boolean).join(':');
  }

  private send(payload: any) {
    if (this.wsReady && this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(payload));
    } else {
      this.openSocket();
    }
  }

  private openSocket() {
    if (this.ws && this.ws.readyState <= WebSocket.OPEN) {
      return;
    }
    let socket: WebSocket;
    try {
      socket = new WebSocket(this.api.ws);
    } catch (e) {
      return;
    }
    this.ws = socket;
    socket.onopen = () => {
      if (this.ws !== socket) {
        socket.close();
        return;
      }
      this.wsReady = true;
      this.reconnectAttempts = 0;
      this.startHeartbeat(socket);
      this.activeSubs.forEach((subscription) =>
        socket.send(JSON.stringify({ method: 'subscribe', subscription }))
      );
    };
    socket.onmessage = (event) => {
      if (this.ws === socket) {
        this.handleMessage(event);
      }
    };
    socket.onclose = () => {
      if (this.ws !== socket) {
        return;
      }
      this.wsReady = false;
      this.stopHeartbeat();
      this.ws = undefined;
      if (this.channels.size > 0) {
        this.scheduleReconnect();
      }
    };
    socket.onerror = () => {
      // `onclose` always follows, which is where reconnection is handled.
    };
  }

  private handleMessage(event: MessageEvent) {
    let msg: any;
    try {
      msg = JSON.parse(event.data);
    } catch (e) {
      return;
    }
    if (!msg || !msg.channel) {
      return;
    }
    if (msg.channel === 'candle') {
      const d = msg.data;
      this.emit(`candle:${d?.s}:${d?.i}`, d);
      return;
    }
    if (msg.channel === 'activeAssetCtx') {
      this.emit(`activeAssetCtx:${msg.data?.coin}`, msg.data);
      return;
    }
    if (msg.channel === 'l2Book' && typeof msg.data?.coin === 'string') {
      this.emit(`l2Book:${msg.data.coin}`, msg.data);
      return;
    }
    if (
      msg.channel === 'activeAssetData' &&
      typeof msg.data?.user === 'string' &&
      typeof msg.data?.coin === 'string'
    ) {
      this.emit(
        `activeAssetData:${msg.data.user.toLowerCase()}:${msg.data.coin}`,
        msg.data
      );
      return;
    }
    if (
      msg.channel === 'spotState' &&
      typeof msg.data?.user === 'string'
    ) {
      this.emit(`spotState:${msg.data.user.toLowerCase()}`, msg.data);
      return;
    }
    if (
      msg.channel === 'clearinghouseState' &&
      typeof msg.data?.user === 'string'
    ) {
      this.emit(
        `clearinghouseState:${msg.data.user.toLowerCase()}`,
        msg.data
      );
      return;
    }
    if (
      [
        'userFills',
        'openOrders',
        'orderUpdates',
        'userNonFundingLedgerUpdates',
      ].includes(msg.channel) &&
      typeof msg.data?.user === 'string'
    ) {
      this.emit(
        `${msg.channel}:${msg.data.user.toLowerCase()}`,
        msg.data
      );
      return;
    }
    this.emit(msg.channel, msg.data);
  }

  private emit(key: string, data: any) {
    const channel = this.channels.get(key);
    if (channel) {
      channel.next(data);
    }
  }

  private scheduleReconnect() {
    clearTimeout(this.reconnectTimer);
    // Back off to at most 30s so a long outage does not hammer the endpoint.
    const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts), 30000);
    this.reconnectAttempts += 1;
    this.reconnectTimer = setTimeout(() => {
      this.openSocket();
    }, delay);
  }

  private startHeartbeat(socket: WebSocket) {
    this.stopHeartbeat();
    this.heartbeatTimer = setInterval(() => {
      if (this.ws === socket && socket.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify({ method: 'ping' }));
      }
    }, this.heartbeatMs);
  }

  private stopHeartbeat() {
    clearInterval(this.heartbeatTimer);
    this.heartbeatTimer = undefined;
  }

  private closeSocket() {
    clearTimeout(this.reconnectTimer);
    this.stopHeartbeat();
    this.wsReady = false;
    const socket = this.ws;
    this.ws = undefined;
    if (socket) {
      try {
        socket.close();
      } catch (e) {
        // Already closing; nothing to clean up.
      }
    }
  }

  //#endregion
}
