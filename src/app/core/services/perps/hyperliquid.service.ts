import { Injectable } from '@angular/core';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import {
  Observable,
  MonoTypeOperatorFunction,
  Subject,
  BehaviorSubject,
  Subscription,
  concat,
  combineLatest,
  of,
  forkJoin,
  from,
  throwError,
  timer,
} from 'rxjs';
import {
  map,
  catchError,
  shareReplay,
  filter,
  retry,
  tap,
  switchMap,
} from 'rxjs/operators';
import { ethers } from 'ethers';
import BigNumber from 'bignumber.js';
import { stringify as stringifyLosslessJson } from 'lossless-json';

import {
  HYPERLIQUID_API,
  PerpsAccount,
  PerpsActiveAssetData,
  PerpsAccountMode,
  PerpsAssetCtx,
  PerpsConnectionState,
  PerpsCandle,
  PerpsCandleInterval,
  PerpsDepositConfig,
  PerpsFill,
  PerpsHistoricalOrder,
  PerpsLedgerUpdate,
  PerpsMarket,
  PerpsOpenOrder,
  PerpsOrderExecutionResult,
  PerpsExchangeResponse,
  PerpsPosition,
  PerpsUniverseItem,
  PerpsUserFeeRates,
  PERPS_BUILDER_ADDRESS,
  PERPS_BUILDER_FEE_TENTHS_BPS,
  PERPS_BUILDER_MAX_FEE_RATE,
  PERPS_DEPOSIT_CONFIG,
  PERPS_HIP3_DEXES,
  perpsFiniteDecimal,
  resolvePerpsTestnet,
} from '@popup/_lib/perps';
import { environment } from '@/environments/environment';
import {
  isNonceRejection,
  PerpsNonceAllocator,
} from './perps-nonce';
import {
  signHyperliquidApproveBuilderFee,
  signHyperliquidL1Action,
  signHyperliquidSendToEvmWithData,
} from './hyperliquid-signing';
import { parsePerpsAccount } from './perps-account-state';
import { normalizeIds, parseProtocolJson } from './perps-protocol-json';
import {
  isExchangeAnswer,
  retryTransientFetch,
} from './perps-fetch-failure';
import { PerpsDataChannel } from './perps-data-channel.service';
import { PerpsExchangeWriteService } from './perps-exchange-write.service';
import { PerpsOrder } from './perps-trade-order';


interface HyperliquidUserFees {
  /** Taker rate: what crossing the spread costs. */
  userCrossRate: string;
  /** Maker rate: what adding to the book costs, negative where it pays. */
  userAddRate: string;
  activeReferralDiscount?: string;
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
  private readonly dexRegistryCacheMs = 6 * 60 * 60 * 1000;
  private readonly userFeeCacheMs = 5 * 60 * 1000;
  private dexRegistryCache: {
    expiresAt: number;
    request: Observable<any[]>;
  };
  private accountCache = new Map<
    string,
    { expiresAt: number; request: Observable<PerpsAccount> }
  >();
  private spotStateCache = new Map<string, Observable<any>>();
  private accountModeCache = new Map<
    string,
    { expiresAt: number; request: Observable<PerpsAccountMode> }
  >();
  private userFeeCache = new Map<
    string,
    { expiresAt: number; request: Observable<PerpsUserFeeRates> }
  >();

  constructor(
    private http: HttpClient,
    private channel: PerpsDataChannel,
    writes: PerpsExchangeWriteService
  ) {
    // A write the user just made is the one moment these snapshots are known
    // to be wrong. The write path says so; deciding what to do about it stays
    // here, where the snapshots live.
    writes.wrote().subscribe(() => {
      this.accountCache.clear();
      this.spotStateCache.clear();
    });
  }

  private get api() {
    return this.isTestnet ? HYPERLIQUID_API.testnet : HYPERLIQUID_API.mainnet;
  }

  /**
   * Every DEX this build shows, canonical first. Market contexts, clearinghouse
   * state and account totals all iterate this one list, so a DEX cannot end up
   * subscribed for prices but missing from the account.
   */
  get enabledDexes(): string[] {
    return ['', ...this.supportedHip3Dexes];
  }

  private get supportedHip3Dexes(): string[] {
    return this.isTestnet
      ? PERPS_HIP3_DEXES.testnet
      : PERPS_HIP3_DEXES.mainnet;
  }

  /** Deposit chain/token matching the configured Perps endpoint. */
  get depositConfig(): PerpsDepositConfig {
    return this.isTestnet
      ? PERPS_DEPOSIT_CONFIG.testnet
      : PERPS_DEPOSIT_CONFIG.mainnet;
  }

  //#region info requests

  private post<T>(body: any): Observable<T> {
    return this.http
      .post(this.api.info, body, {
        headers: { 'Content-Type': 'application/json' },
        responseType: 'text',
      })
      .pipe(map((text) => parseProtocolJson(text) as T));
  }

  /**
   * User-specific perps fee rates, including the active referral discount.
   * Staking and volume tier adjustments are already reflected in the rates.
   *
   * Both sides are read because both are charged: a market order crosses the
   * spread and pays `userCrossRate`, while a GTC limit order usually rests and
   * fills at `userAddRate`. Quoting the taker rate on a limit order overstates
   * its cost, and on a rebate tier it reverses the sign of the answer.
   *
   * The maker rate is allowed to be negative — that is a rebate, and clamping
   * it to zero would hide money the fill pays back.
   */
  getUserFeeRates(address: string): Observable<PerpsUserFeeRates> {
    const user = address.toLowerCase();
    const cached = this.userFeeCache.get(user);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.request;
    }

    const request = this.post<HyperliquidUserFees>({
      type: 'userFees',
      user,
    }).pipe(
      map((fees) => {
        const userCrossRate = Number(fees?.userCrossRate);
        const userAddRate = Number(fees?.userAddRate);
        const referralDiscount = Number(
          fees?.activeReferralDiscount || 0
        );
        if (
          !Number.isFinite(userCrossRate) ||
          userCrossRate < 0 ||
          !Number.isFinite(userAddRate) ||
          !Number.isFinite(referralDiscount) ||
          referralDiscount < 0 ||
          referralDiscount > 1
        ) {
          throw new Error('Invalid Hyperliquid user fee response');
        }
        return {
          takerRate: userCrossRate * (1 - referralDiscount),
          // A referral discount reduces what is paid; it cannot reduce what is
          // paid back, so a rebate keeps its full size.
          makerRate:
            userAddRate < 0
              ? userAddRate
              : userAddRate * (1 - referralDiscount),
        };
      }),
      catchError((error) => {
        this.userFeeCache.delete(user);
        throw error;
      }),
      shareReplay(1)
    );
    this.userFeeCache.set(user, {
      expiresAt: Date.now() + this.userFeeCacheMs,
      request,
    });
    return request;
  }

  /**
   * Registry of builder-deployed DEXes. A DEX's position in this list is baked
   * into the asset ids of its markets, so entries are append-only and the whole
   * response is worth caching far longer than the prices it feeds. A failure is
   * never cached: it degrades this refresh to canonical markets and is retried.
   */
  getDexRegistry(): Observable<any[]> {
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

  /** One DEX's universe and its live contexts, in matching order. */
  getMetaAndAssetCtxs(
    dex?: string
  ): Observable<[{ universe: PerpsUniverseItem[] }, PerpsAssetCtx[]]> {
    const body: any = { type: 'metaAndAssetCtxs' };
    if (dex) {
      body.dex = dex;
    }
    return this.post(body);
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
  getAccount(
    address: string,
    force = false,
    dex = ''
  ): Observable<PerpsAccount> {
    const user = address.toLowerCase();
    const cacheKey = `${user}:dex=${dex}`;
    const now = Date.now();
    const cached = this.accountCache.get(cacheKey);
    if (!force && cached?.expiresAt > now) {
      return cached.request;
    }
    const request = forkJoin([
      this.post<any>({ type: 'clearinghouseState', user, dex }),
      // The spot wallet is account-wide. Only the canonical snapshot reads it,
      // so that folding it in as collateral cannot happen once per DEX.
      dex ? of(null) : this.getSpotState(user, force),
      this.getAccountMode(user),
    ]).pipe(
      map(([perps, spot, mode]) =>
        parsePerpsAccount(perps, spot, mode, dex)
      ),
      catchError((error) => {
        if (this.accountCache.get(cacheKey)?.request === request) {
          this.accountCache.delete(cacheKey);
        }
        throw error;
      }),
      shareReplay({ bufferSize: 1, refCount: false })
    );
    this.accountCache.set(cacheKey, {
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
      this.channel.subscribe({ type: 'activeAssetData', user, coin }).pipe(
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
    const maxTradeSzs: [string, string] = [
      String(data.maxTradeSzs[0]),
      String(data.maxTradeSzs[1]),
    ];
    const availableToTrade: [string, string] = [
      String(data.availableToTrade[0]),
      String(data.availableToTrade[1]),
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
      markPxExact: perpsFiniteDecimal(data.markPx),
      markPx: this.toFiniteNumber(data.markPx),
    };
  }

  /** Initial spot snapshot; subsequent values are replaced by `spotState` pushes. */
  private getSpotState(user: string, force = false): Observable<any> {
    const cached = this.spotStateCache.get(user);
    if (!force && cached) {
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
   * Only `unifiedAccount` and `portfolioMargin` treat spot USDC as perps
   * collateral; every other mode (`default`, `disabled`, …) keeps them separate.
   */
  private isUnifiedMode(mode: PerpsAccountMode): boolean {
    return mode === 'unifiedAccount' || mode === 'portfolioMargin';
  }

  private toFiniteNumber(value: any): number {
    const parsed = Number(value ?? 0);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  /** Historical candles for an explicit exchange-time range. */
  getCandleRange(
    coin: string,
    interval: PerpsCandleInterval,
    startTime: number,
    endTime: number
  ): Observable<PerpsCandle[]> {
    return this.post<PerpsCandle[]>({
      type: 'candleSnapshot',
      req: { coin, interval, startTime, endTime },
    }).pipe(map((res) => (Array.isArray(res) ? res : [])));
  }

  getUserFills(address: string): Observable<PerpsFill[]> {
    return this.post<PerpsFill[]>({
      type: 'userFills',
      user: address.toLowerCase(),
    }).pipe(
      map((res) => normalizeIds(Array.isArray(res) ? res : []))
    );
  }

  /** Active orders that can still fill and therefore must remain manageable. */
  getOpenOrders(address: string): Observable<PerpsOpenOrder[]> {
    const user = address.toLowerCase();
    return forkJoin(
      this.enabledDexes.map((dex) =>
        this.post<PerpsOpenOrder[]>({
          type: 'frontendOpenOrders',
          user,
          dex,
        }).pipe(
          map((res) => normalizeIds(Array.isArray(res) ? res : []))
        )
      )
    ).pipe(map((ordersByDex) => ordersByDex.flat()));
  }

  /** Full open-order snapshots pushed whenever the user's book changes. */
  watchOpenOrders(address: string): Observable<PerpsOpenOrder[]> {
    const user = address.toLowerCase();
    return combineLatest(
      this.enabledDexes.map((dex) =>
        this.channel.subscribe({ type: 'openOrders', user, dex }).pipe(
          map((data) => (Array.isArray(data?.orders) ? data.orders : []))
        )
      )
    ).pipe(map((ordersByDex) => ordersByDex.flat()));
  }

  /** Orders that already left the book. Hyperliquid caps this at 2000 rows. */
  getHistoricalOrders(address: string): Observable<PerpsHistoricalOrder[]> {
    return this.post<PerpsHistoricalOrder[]>({
      type: 'historicalOrders',
      user: address.toLowerCase(),
    }).pipe(
      map((res) => normalizeIds(Array.isArray(res) ? res : []))
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
    }).pipe(map((res) => (Array.isArray(res) ? res : [])));
  }

  //#endregion

}
