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
import { PerpsOrder } from './perps-trade-order';


interface HyperliquidUserFees {
  /** Taker rate: what crossing the spread costs. */
  userCrossRate: string;
  /** Maker rate: what adding to the book costs, negative where it pays. */
  userAddRate: string;
  activeReferralDiscount?: string;
}

/**
 * A signed write whose result the client never learned.
 *
 * Not a failure: the exchange may well have executed the action, and the only
 * honest thing the interface can say is that it does not know. Nothing may be
 * re-signed off the back of one — a second signature is how one withdrawal
 * becomes two.
 */
export class PerpsExecutionStatusUnknownError extends Error {
  constructor(readonly reason?: unknown) {
    super('Hyperliquid returned no decidable result');
    this.name = 'PerpsExecutionStatusUnknownError';
  }
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
  /** Accounts whose builder-fee approval this session has already confirmed. */
  private builderFeeApproved = new Set<string>();
  /**
   * Nonces are tracked per signer by the exchange, so they are allocated per
   * signer here too. The allocator is a plain object rather than a service so
   * it can move into the background executor unchanged.
   */
  private readonly nonces = new PerpsNonceAllocator();

  constructor(
    private http: HttpClient,
    private channel: PerpsDataChannel
  ) {}

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
    const nonce = this.nextNonce(privateKey);
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

  private postExchange(
    action: any,
    signature: any,
    nonce: number,
    allowItemErrors = false
  ): Observable<PerpsExchangeResponse> {
    const requestBody = { action, nonce, signature };
    const body = this.containsBigInt(requestBody)
      ? stringifyLosslessJson(requestBody)
      : requestBody;
    return this.http
      .post(
        this.api.exchange,
        body,
        {
          headers: { 'Content-Type': 'application/json' },
          responseType: 'text',
        }
      )
      .pipe(
        map((text) => {
          const response = normalizeIds(
            parseProtocolJson(text)
          ) as PerpsExchangeResponse;
          if (response?.status !== 'ok') {
            throw new Error(response?.error || 'Hyperliquid rejected the action');
          }
          if (!allowItemErrors) {
            const errorStatus = response.response?.data?.statuses?.find(
              (status: any) => status?.error
            ) as { error: string };
            if (errorStatus?.error) {
              throw new Error(errorStatus.error);
            }
          }
          return response;
        })
      );
  }

  private containsBigInt(value: unknown): boolean {
    if (typeof value === 'bigint') {
      return true;
    }
    if (Array.isArray(value)) {
      return value.some((item) => this.containsBigInt(item));
    }
    return !!value && typeof value === 'object'
      ? Object.keys(value).some((key) =>
          this.containsBigInt((value as any)[key])
        )
      : false;
  }

  private nextNonce(privateKey: string): number {
    return this.nonces.next(ethers.computeAddress(privateKey));
  }

  /** Resolve a transport-ambiguous order by its stable client id. */
  getOrderStatus(address: string, cloid: string): Observable<any> {
    if (!/^0x[0-9a-fA-F]{32}$/u.test(cloid)) {
      throw new Error('Invalid Hyperliquid cloid');
    }
    return this.post<any>({
      type: 'orderStatus',
      user: address.toLowerCase(),
      oid: cloid.toLowerCase(),
    }).pipe(map((result) => normalizeIds(result)));
  }

  private clearAccountCache() {
    this.accountCache.clear();
    this.spotStateCache.clear();
  }

  private signedL1Action(
    privateKey: string,
    action: any,
    allowItemErrors = false
  ): Observable<PerpsExchangeResponse> {
    const nonce = this.nextNonce(privateKey);
    return from(
      signHyperliquidL1Action(privateKey, action, nonce, !this.isTestnet)
    ).pipe(
      switchMap((signature) =>
        this.postExchange(action, signature, nonce, allowItemErrors)
      ),
      tap(() => this.clearAccountCache())
    );
  }

  /** Serialize, sign and send one already-normalized protocol order. */
  submitOrder(
    privateKey: string,
    order: PerpsOrder
  ): Observable<PerpsOrderExecutionResult> {
    if (!Number.isSafeInteger(order.assetId) || order.assetId < 0) {
      throw new Error('Invalid Hyperliquid asset id');
    }
    if (!/^0x[0-9a-fA-F]{32}$/u.test(order.cloid)) {
      throw new Error('Invalid Hyperliquid cloid');
    }
    if (
      !new BigNumber(order.priceExact).isGreaterThan(0) ||
      !new BigNumber(order.sizeExact).isGreaterThan(0)
    ) {
      throw new Error('Invalid Hyperliquid order values');
    }
    const action = this.withBuilder({
      type: 'order',
      orders: [
        {
          a: order.assetId,
          b: order.isBuy,
          p: this.floatToWire(order.priceExact),
          s: this.floatToWire(order.sizeExact),
          r: order.reduceOnly,
          t: {
            limit: {
              tif: order.timeInForce,
            },
          },
          c: order.cloid,
        },
      ],
      grouping: 'na',
    });
    return this.ensureBuilderFeeApproved(privateKey).pipe(
      switchMap(() =>
        this.signedL1Action(privateKey, action, true).pipe(
          map((response) =>
            this.parseOrderExecution(
              response,
              order.sizeExact,
              order.cloid
            )
          ),
          // Once the signed order was sent, a transport failure cannot prove
          // rejection. Preserve cloid and stop: retrying could duplicate risk.
          catchError((error) =>
            isExchangeAnswer(error)
              ? throwError(() => error)
              : of({
                  status: 'unknown' as const,
                  cloid: order.cloid,
                  submittedSizeExact: order.sizeExact,
                  filledSizeExact: '0',
                  remainingSizeExact: order.sizeExact,
                  error: error?.message || String(error),
                })
          )
        )
      )
    );
  }

  updateLeverage(
    privateKey: string,
    assetId: number,
    leverage: number,
    maxLeverage: number
  ): Observable<PerpsExchangeResponse> {
    const normalized = Math.max(1, Math.min(maxLeverage, Math.floor(leverage)));
    return this.signedL1Action(privateKey, {
      type: 'updateLeverage',
      asset: assetId,
      isCross: false,
      leverage: normalized,
    });
  }

  /** Add or remove isolated margin using the protocol's exact 6-decimal unit. */
  updateIsolatedMargin(
    privateKey: string,
    assetId: number,
    isBuy: boolean,
    deltaUsdExact: string
  ): Observable<PerpsExchangeResponse> {
    const ntli = new BigNumber(deltaUsdExact).times(1_000_000);
    if (!ntli.isFinite() || !ntli.isInteger() || ntli.isZero()) {
      throw new Error('Isolated margin change must use at most 6 decimals');
    }
    return this.signedL1Action(privateKey, {
      type: 'updateIsolatedMargin',
      asset: assetId,
      isBuy,
      ntli: BigInt(ntli.toFixed(0)),
    });
  }

  private parseOrderExecution(
    response: PerpsExchangeResponse,
    submittedSizeExact: string,
    cloid: string
  ): PerpsOrderExecutionResult {
    const status: any = response.response?.data?.statuses?.[0];
    const submitted = new BigNumber(submittedSizeExact);
    if (status?.filled) {
      const filled = new BigNumber(status.filled.totalSz || 0);
      const remaining = BigNumber.maximum(submitted.minus(filled), 0);
      return {
        status: remaining.isZero() ? 'filled' : 'partial',
        cloid,
        orderId: status.filled.oid,
        submittedSizeExact: submitted.toFixed(),
        filledSizeExact: filled.toFixed(),
        remainingSizeExact: remaining.toFixed(),
        averagePriceExact: perpsFiniteDecimal(status.filled.avgPx),
        raw: response,
      };
    }
    if (status?.resting) {
      return {
        status: 'resting',
        cloid,
        orderId: status.resting.oid,
        submittedSizeExact: submitted.toFixed(),
        filledSizeExact: '0',
        remainingSizeExact: submitted.toFixed(),
        raw: response,
      };
    }
    if (status?.error) {
      const unfilled = /ioc|no liquidity/i.test(status.error);
      return {
        status: unfilled ? 'unfilled' : 'rejected',
        cloid,
        submittedSizeExact: submitted.toFixed(),
        filledSizeExact: '0',
        remainingSizeExact: submitted.toFixed(),
        error: status.error,
        raw: response,
      };
    }
    return {
      status: 'rejected',
      cloid,
      submittedSizeExact: submitted.toFixed(),
      filledSizeExact: '0',
      remainingSizeExact: submitted.toFixed(),
      error: 'Hyperliquid returned no order status',
      raw: response,
    };
  }

  /**
   * Withdraw from HyperCore to the same address on the deposit chain.
   *
   * The exchange debits HyperCore and the rest happens without the user: the
   * amount crosses to HyperEVM, is burned through CCTP, and is delivered by the
   * forwarder. None of those legs is a transaction the user signs or pays gas
   * for, so this stays a single signed action from the caller's point of view.
   *
   * Which balance is debited follows the account's abstraction mode rather than
   * a constant: a unified account keeps its USDC in spot, and asking that
   * account for a perps-sourced withdrawal is asking it to debit a balance the
   * exchange reports as zero. A mode that cannot be read falls back to perps,
   * which is the safe end of the guess — the exchange refuses a debit the
   * balance cannot cover, so a wrong guess costs a rejection, not a withdrawal
   * taken from somewhere the user did not mean.
   */
  withdraw(
    privateKey: string,
    destination: string,
    amount: string
  ): Observable<PerpsExchangeResponse> {
    const amountWire = this.floatToWire(amount);
    // Circle names this field chainId; the value is the CCTP domain of the
    // destination (Arbitrum = 3), not the EVM chain id 42161. Passing the chain
    // id sends the burn to a domain that does not exist.
    // SOURCE: CoreDepositWallet natspec and
    // https://developers.circle.com/cctp/howtos/withdraw-usdc-from-hypercore-to-evm
    const destinationChainId = this.depositConfig.cctp.sourceDomain;
    const signer = new ethers.Wallet(privateKey).address.toLowerCase();
    return this.getAccountMode(signer).pipe(
      switchMap((mode) =>
        this.withNonceRetry(privateKey, (nonce) =>
          from(
            signHyperliquidSendToEvmWithData(
              privateKey,
              destination,
              amountWire,
              destinationChainId,
              nonce,
              !this.isTestnet,
              this.isUnifiedMode(mode) ? 'spot' : ''
            )
          ).pipe(
            switchMap(({ action, signature }) =>
              this.postExchange(action, signature, nonce)
            )
          )
        )
      ),
      tap(() => this.clearAccountCache()),
      // A withdrawal moves principal, so the two ways it can not succeed have
      // to stay apart all the way to the screen: an exchange that answered "no"
      // executed nothing, while a response that never arrived may have.
      catchError((error) => {
        throw isExchangeAnswer(error)
          ? error
          : new PerpsExecutionStatusUnknownError(error);
      })
    );
  }

  /**
   * Sign and send, re-signing once if the exchange refuses the nonce itself.
   *
   * Safe precisely because the exchange answered: a refusal means nothing was
   * executed, so a second attempt cannot duplicate the action. A lost or failed
   * response is the opposite case — the action may have run — and is rethrown
   * untouched for the caller to resolve as an unknown execution.
   */
  private withNonceRetry(
    privateKey: string,
    build: (nonce: number) => Observable<PerpsExchangeResponse>
  ): Observable<PerpsExchangeResponse> {
    const attempt = (
      remaining: number
    ): Observable<PerpsExchangeResponse> =>
      build(this.nextNonce(privateKey)).pipe(
        catchError((error) => {
          if (remaining > 0 && this.isDeterministicNonceRejection(error)) {
            return attempt(remaining - 1);
          }
          throw error;
        })
      );
    return attempt(1);
  }

  private isDeterministicNonceRejection(error: unknown): boolean {
    // A transport failure is not an answer; the action's fate is unknown and it
    // must never be signed again on our own initiative.
    if (error instanceof HttpErrorResponse) {
      return false;
    }
    return isNonceRejection(error);
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

  cancelOrder(
    privateKey: string,
    assetId: number,
    orderId: string
  ): Observable<PerpsExchangeResponse> {
    const oid = this.parseUint64(orderId, 'order id');
    return this.signedL1Action(privateKey, {
      type: 'cancel',
      cancels: [{ a: assetId, o: oid }],
    });
  }

  private parseUint64(value: string, label: string): bigint {
    if (!/^\d+$/u.test(value)) {
      throw new Error(`Invalid Hyperliquid ${label}`);
    }
    const parsed = BigInt(value);
    if (parsed > 0xffffffffffffffffn) {
      throw new Error(`Hyperliquid ${label} exceeds uint64`);
    }
    return parsed;
  }

  //#endregion

}
