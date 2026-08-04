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
  PERPS_DEPOSIT_CONFIG,
} from '@popup/_lib/perps';
import { environment } from '@/environments/environment';
import {
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
@Injectable()
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

  /**
   * Cache snapshots according to their volatility:
   * - market snapshots have a short TTL and are refreshed by live contexts;
   * - spot state persists until a websocket update;
   * - combined account snapshots absorb short navigation/request bursts;
   * - account abstraction is refreshed infrequently.
   */
  private readonly accountCacheMs = 3000;
  private readonly accountModeCacheMs = 30 * 60 * 1000;
  private readonly marketCacheMs = 15000;
  private readonly userFeeCacheMs = 5 * 60 * 1000;
  private marketCache: {
    expiresAt: number;
    request: Observable<PerpsMarket[]>;
  };
  private marketState$ = new BehaviorSubject<PerpsMarket[] | null>(null);
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
  private lastNonce = 0;

  constructor(private http: HttpClient) {}

  private get api() {
    return this.isTestnet ? HYPERLIQUID_API.testnet : HYPERLIQUID_API.mainnet;
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

  /**
   * Set the requested leverage / margin mode (`isCross`) and place one order.
   * Callers currently open isolated so the per-order liquidation preview is
   * binding. Market orders use an IOC limit through the mark according to the
   * caller's configured slippage tolerance.
   */
  placeOrder(
    privateKey: string,
    request: PerpsOrderRequest
  ): Observable<PerpsExchangeResponse> {
    const leverage = Math.max(
      1,
      Math.min(request.maxLeverage, Math.floor(request.leverage))
    );
    const slippage = Math.max(
      0.001,
      Math.min(0.05, request.slippagePercent / 100)
    );
    const price =
      request.orderType === 'market'
        ? request.price * (request.isBuy ? 1 + slippage : 1 - slippage)
        : request.price;
    const action = {
      type: 'order',
      orders: [
        {
          a: request.assetId,
          b: request.isBuy,
          p: this.floatToWire(
            this.roundPrice(price, request.szDecimals)
          ),
          s: this.floatToWire(request.size),
          r: request.reduceOnly,
          t: {
            limit: {
              tif: request.orderType === 'market' ? 'Ioc' : 'Gtc',
            },
          },
        },
      ],
      grouping: 'na',
    };
    if (request.reduceOnly) {
      return this.signedL1Action(privateKey, action);
    }
    return this.signedL1Action(privateKey, {
      type: 'updateLeverage',
      asset: request.assetId,
      isCross: request.isCross,
      leverage,
    }).pipe(switchMap(() => this.signedL1Action(privateKey, action)));
  }

  withdraw(
    privateKey: string,
    destination: string,
    amount: number
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
    amount: number,
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
  deposit(privateKey: string, amount: number): Observable<string> {
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
  private floatToWire(value: number): string {
    if (!Number.isFinite(value)) {
      throw new Error('Invalid Hyperliquid number');
    }
    const rounded = Number(value.toFixed(8));
    if (Math.abs(rounded - value) >= 1e-12) {
      throw new Error('Hyperliquid number exceeds 8 decimal places');
    }
    return rounded === 0 ? '0' : rounded.toString();
  }

  /**
   * Perp prices use at most five significant figures and 6-szDecimals places.
   */
  private roundPrice(price: number, szDecimals: number): number {
    const maxDecimals = Math.max(0, 6 - szDecimals);
    const significantDecimals = Math.max(
      0,
      5 - Math.floor(Math.log10(Math.abs(price))) - 1
    );
    return Number(price.toFixed(Math.min(maxDecimals, significantDecimals)));
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
    const request = this.post<
      [{ universe: PerpsUniverseItem[] }, PerpsAssetCtx[]]
    >({
      type: 'metaAndAssetCtxs',
    }).pipe(
      map(([meta, ctxs]) => {
        const markets: PerpsMarket[] = [];
        meta.universe.forEach((item, index) => {
          const ctx = ctxs[index];
          if (item.isDelisted || !ctx) {
            return;
          }
          markets.push({
            assetId: index,
            coin: item.name,
            szDecimals: item.szDecimals,
            maxLeverage: item.maxLeverage,
            onlyIsolated: !!item.onlyIsolated,
            ...this.marketContextFields(ctx),
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
      this.loadMarketSnapshot();
      return () => {
        stateSub.unsubscribe();
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
      error: () => {
        if (this.marketObservers === 0) {
          return;
        }
        clearTimeout(this.marketSnapshotRetryTimer);
        const delay = Math.min(
          1000 * Math.pow(2, this.marketSnapshotAttempts),
          30000
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
    const ctxs = this.mainDexAssetContexts(update?.ctxs);
    if (ctxs.length === 0) {
      return markets;
    }
    const updated = markets
      .map((market) => {
        const ctx = ctxs[market.assetId];
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
    | 'oraclePx'
    | 'prevDayPx'
    | 'changePercent'
    | 'dayVolume'
    | 'openInterest'
    | 'funding'
  > {
    const markPx = Number(ctx.markPx);
    const prevDayPx = Number(ctx.prevDayPx);
    return {
      markPx,
      oraclePx: Number(ctx.oraclePx),
      prevDayPx,
      changePercent: prevDayPx
        ? ((markPx - prevDayPx) / prevDayPx) * 100
        : 0,
      dayVolume: Number(ctx.dayNtlVlm),
      openInterest: Number(ctx.openInterest) * markPx,
      funding: Number(ctx.funding),
    };
  }

  private mainDexAssetContexts(raw: any): PerpsAssetCtx[] {
    if (Array.isArray(raw)) {
      const mainDex = raw.find(
        (entry) => Array.isArray(entry) && entry[0] === ''
      );
      if (mainDex && Array.isArray(mainDex[1])) {
        return mainDex[1];
      }
      // Compatibility with a direct context array if the API shape changes.
      if (raw.every((entry) => !Array.isArray(entry))) {
        return raw;
      }
    }
    const mainDex = raw?.[''];
    return Array.isArray(mainDex) ? mainDex : [];
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
  private parseSpotUsdc(spot: any): { total: number; hold: number } {
    const balance = (spot?.balances || []).find(
      (b) => b.coin === 'USDC' || b.token === 0
    );
    return {
      total: balance ? Number(balance.total) : 0,
      hold: balance ? Number(balance.hold) : 0,
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
    const { total: spotUsdc, hold: spotUsdcHold } = this.parseSpotUsdc(spot);
    const freeSpotUsdc = Math.max(0, spotUsdc - spotUsdcHold);
    const foldedSpot = account.unified ? freeSpotUsdc : 0;
    const updated = {
      ...account,
      totalBalance: account.unified
        ? account.accountValue + freeSpotUsdc
        : account.accountValue,
      availableBalance: account.withdrawable + foldedSpot,
      spotUsdc,
      spotUsdcHold,
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
          total: account.spotUsdc,
          hold: account.spotUsdcHold,
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
    const { total: spotUsdc, hold: spotUsdcHold } = this.parseSpotUsdc(spot);
    const freeSpotUsdc = Math.max(0, spotUsdc - spotUsdcHold);
    if (!res || !res.marginSummary) {
      return {
        ...this.emptyAccount(),
        unified,
        abstractionMode: mode,
        totalBalance: unified ? freeSpotUsdc : 0,
        availableBalance: unified ? freeSpotUsdc : 0,
        spotUsdc,
        spotUsdcHold,
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
    const foldedSpot = unified ? freeSpotUsdc : 0;
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
      availableBalance: withdrawable + foldedSpot,
      spotUsdc,
      spotUsdcHold,
      positions,
    };
  }

  private toFiniteNumber(value: any): number {
    const parsed = Number(value ?? 0);
    return Number.isFinite(parsed) ? parsed : 0;
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
      availableBalance: 0,
      spotUsdc: 0,
      spotUsdcHold: 0,
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
    }).pipe(
      map((res) => (Array.isArray(res) ? res.slice(-limit) : [])),
      catchError(() => of([]))
    );
  }

  getUserFills(address: string): Observable<PerpsFill[]> {
    return this.post<PerpsFill[]>({
      type: 'userFills',
      user: address.toLowerCase(),
    }).pipe(
      map((res) => (Array.isArray(res) ? res : [])),
      catchError(() => of([]))
    );
  }

  /** Active orders that can still fill and therefore must remain manageable. */
  getOpenOrders(address: string): Observable<PerpsOpenOrder[]> {
    return this.post<PerpsOpenOrder[]>({
      type: 'frontendOpenOrders',
      user: address.toLowerCase(),
    }).pipe(map((res) => (Array.isArray(res) ? res : [])));
  }

  /** Orders that already left the book. Hyperliquid caps this at 2000 rows. */
  getHistoricalOrders(address: string): Observable<PerpsHistoricalOrder[]> {
    return this.post<PerpsHistoricalOrder[]>({
      type: 'historicalOrders',
      user: address.toLowerCase(),
    }).pipe(
      map((res) => (Array.isArray(res) ? res : [])),
      catchError(() => of([]))
    );
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
    }).pipe(
      map((res) => (Array.isArray(res) ? res : [])),
      catchError(() => of([]))
    );
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

  private closeSocket() {
    clearTimeout(this.reconnectTimer);
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
