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
import {
  isInteger,
  isSafeNumber,
  parse as parseLosslessJson,
  stringify as stringifyLosslessJson,
} from 'lossless-json';

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
  PERPS_CANDLE_LIMIT,
  PERPS_DEPOSIT_CONFIG,
  PERPS_HIP3_DEXES,
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
import { PerpsOrder } from './perps-trade-order';

export type PerpsNetwork = 'mainnet' | 'testnet';

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
 * Whether a failed write carries an answer from the exchange.
 *
 * Anything thrown while reading a response is an answer by definition — the
 * body arrived and said no. An `HttpErrorResponse` is only an answer when its
 * status is a refusal the exchange itself issued: a 4xx rejects the request
 * before it runs, while a 5xx or a status of zero says the request may have
 * been received and executed with the reply lost on the way back.
 */
export function isExchangeAnswer(error: any): boolean {
  const transport =
    error instanceof HttpErrorResponse || error?.name === 'HttpErrorResponse';
  if (!transport) {
    return true;
  }
  const status = Number(error?.status);
  return Number.isFinite(status) && status >= 400 && status < 500;
}

/**
 * Whether a failed read is worth repeating.
 *
 * The same classification `isExchangeAnswer` makes for writes, read from the
 * other side. If the exchange answered, the read has its result and asking
 * again returns the identical one: a 4xx is a refusal — rate limiting included,
 * where a second-scale retry only spends another slot out of a budget that
 * refills over the following minute — and a body that arrived and failed to
 * parse will fail to parse again. If it did not answer, nothing in the domain
 * was decided and the request is worth resending unchanged.
 */
export function isTransientFetchFailure(error: any): boolean {
  return !isExchangeAnswer(error);
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
/**
 * Channels the exchange scopes to one DEX. Their frames carry a `dex`, and one
 * subscription per DEX is required — sharing a channel across DEXes lets the
 * last frame overwrite every other pool.
 */
const DEX_SCOPED_CHANNELS = new Set([
  'assetCtxs',
  'clearinghouseState',
  'openOrders',
]);

/**
 * How many times a read-only fetch is repeated before its failure is the answer.
 *
 * Bounded and evenly spaced on purpose. Exponential backoff belongs to a
 * process that will still be running in a minute; this one belongs to a popup
 * the user is watching, so the budget is spent inside the time they are
 * already willing to wait for a page, and then it stops. Nothing here reschedules
 * itself afterwards — the next attempt is the user's next action.
 */
const FETCH_RETRY_ATTEMPTS = 3;
const FETCH_RETRY_DELAY_MS = 1000;

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
   * How long a `ping` may go unanswered before the socket is treated as dead.
   *
   * A socket can stop delivering without ever closing — the extension's
   * service worker suspends, a laptop sleeps, a NAT drops the flow — and in
   * that state `readyState` still reads OPEN. Only a missing `pong` reveals it,
   * which is why the answer is timed rather than merely sent.
   */
  private readonly pongTimeoutMs = 10000;
  private pongTimer: any;
  /**
   * Whether the feed is currently believed to be delivering. It is not "did a
   * message arrive recently": context frames are periodic and a quiet market
   * still produces them, but silence alone never condemns a healthy socket.
   */
  private connectionState$ = new BehaviorSubject<PerpsConnectionState>(
    'connecting'
  );
  /** Exchange-time of the newest market frame, for "last updated" display. */
  private marketFeedAt$ = new BehaviorSubject<number | null>(null);

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
  private pendingAssetContexts = new Map<string, PerpsAssetCtx[]>();
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
  private userFeeCache = new Map<
    string,
    { expiresAt: number; request: Observable<PerpsUserFeeRates> }
  >();
  /**
   * How long a channel outlives its last observer.
   *
   * Stepping through chart intervals, or leaving a market and coming back,
   * passes through zero observers for a few hundred milliseconds at a time.
   * Telling the exchange to stop and asking again immediately spends two
   * frames and a re-snapshot on data that never actually stopped arriving, so
   * a channel is held briefly and picked back up if someone returns.
   */
  private readonly channelTeardownMs = 500;
  private channelTeardowns = new Map<string, any>();
  /**
   * The candles last shown for a market and interval.
   *
   * Keyed by both because they name different datasets, and kept only for the
   * session: this is what lets a market the user already opened paint before
   * the network answers, not a store of history.
   */
  private candleCache = new Map<string, PerpsCandle[]>();
  /** Entries are bounded; each dataset itself remains append-only while cached. */
  private readonly candleCacheEntries = 8;
  /** Accounts whose builder-fee approval this session has already confirmed. */
  private builderFeeApproved = new Set<string>();
  /**
   * Nonces are tracked per signer by the exchange, so they are allocated per
   * signer here too. The allocator is a plain object rather than a service so
   * it can move into the background executor unchanged.
   */
  private readonly nonces = new PerpsNonceAllocator();

  constructor(private http: HttpClient) {}

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

  /**
   * Repeat a read-only fetch while its failure has not answered anything.
   *
   * Only a transient fetch failure is repeated: the request never reached the
   * exchange, or the exchange itself faulted. An answered refusal — any 4xx,
   * rate limiting included — is a reply, and asking the identical question a
   * second later gets the identical reply; with a 429 it also spends another
   * slot out of a budget that refills over the following minute.
   *
   * Applied per call site rather than inside `post`, because whether a late
   * answer is worth having is a property of the caller. A page loading its
   * market wants one. The order book behind a submission price does not: the
   * value that arrives three seconds later is not fresher for having been
   * waited on, it is a stale submission price walking into the freshness check.
   */
  private retryTransientFetch<T>(): MonoTypeOperatorFunction<T> {
    return retry({
      count: FETCH_RETRY_ATTEMPTS,
      delay: (error) =>
        isTransientFetchFailure(error)
          ? timer(FETCH_RETRY_DELAY_MS)
          : throwError(() => error),
    });
  }

  private post<T>(body: any): Observable<T> {
    return this.http
      .post(this.api.info, body, {
        headers: { 'Content-Type': 'application/json' },
        responseType: 'text',
      })
      .pipe(map((text) => this.parseProtocolJson(text) as T));
  }

  /** Preserve unsafe JSON integers until endpoint adapters stringify IDs. */
  private parseProtocolJson(text: unknown): any {
    if (typeof text !== 'string') {
      return text;
    }
    // HttpClient test doubles and a few browser adapters may already unwrap a
    // top-level JSON string. Nested payloads still always arrive as JSON text.
    if (!/^\s*(?:[\[{\"]|-?\d|true\b|false\b|null\b)/.test(text)) {
      return text;
    }
    return parseLosslessJson(text, null, (value) =>
      isInteger(value) && !isSafeNumber(value) ? value : Number(value)
    );
  }

  private normalizeProtocolId(value: unknown): string | undefined {
    if (typeof value === 'string' && /^\d+$/u.test(value)) {
      return value;
    }
    return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0
      ? String(value)
      : undefined;
  }

  /** Normalize every nested oid/tid before data reaches models, UI or storage. */
  private normalizeIds<T>(value: T): T {
    if (Array.isArray(value)) {
      value.forEach((item) => this.normalizeIds(item));
      return value;
    }
    if (!value || typeof value !== 'object') {
      return value;
    }
    const record = value as any;
    ['oid', 'tid'].forEach((key) => {
      if (record[key] !== undefined) {
        const id = this.normalizeProtocolId(record[key]);
        if (!id) {
          throw new Error(`Invalid Hyperliquid ${key}`);
        }
        record[key] = id;
      }
    });
    Object.keys(record).forEach((key) => this.normalizeIds(record[key]));
    return value;
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
          const response = this.normalizeIds(
            this.parseProtocolJson(text)
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
    }).pipe(map((result) => this.normalizeIds(result)));
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
        averagePriceExact: this.toFiniteDecimal(status.filled.avgPx),
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
            markets.push(this.buildMarket(item, ctx, dex, dexIndex, index));
          });
        });
        const sorted = markets.sort((a, b) =>
          new BigNumber(b.dayVolumeExact)
            .comparedTo(a.dayVolumeExact)
        );
        // Frames that arrived before this snapshot are replayed onto it, so a
        // slow REST response cannot leave the list a generation behind.
        let seeded = sorted;
        this.pendingAssetContexts.forEach((ctxs, dex) => {
          seeded = this.mergeDexAssetContexts(seeded, dex, ctxs);
        });
        return seeded;
      }),
      tap((markets) => {
        this.pendingAssetContexts.clear();
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
   * Whether the live feed is currently delivering.
   *
   * Consumers use this — not "how long since the last message" — to decide
   * whether what is on screen is still live. Context frames are periodic, so a
   * gap is worth noticing, but only the connection itself can say it is broken.
   */
  watchConnectionState(): Observable<PerpsConnectionState> {
    return this.connectionState$.asObservable();
  }

  /** Local receive time of the newest market frame, for "last updated" display. */
  watchMarketFeedAt(): Observable<number | null> {
    return this.marketFeedAt$.asObservable();
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

  /**
   * One market's live context, from that market's own feed.
   *
   * The detail page is what a user watches before tapping Long or Short, so it
   * follows that market's `activeAssetCtx` channel rather than the market
   * list's per-DEX periodic frames — see that page's ADR-0001. A frame carries
   * prices and 24h statistics together, so the page never pairs a price from
   * one message with a `prevDayPx` from another.
   *
   * Emits `null` for a coin this build does not carry: a delisted asset, a DEX
   * this build does not enable, or a bad route parameter. That is a different
   * answer from a request that failed, which errors.
   */
  watchMarketDetail(coin: string): Observable<PerpsMarket | null> {
    const dex = coin?.includes(':') ? coin.slice(0, coin.indexOf(':')) : '';
    if (!coin || !this.enabledDexes.includes(dex)) {
      return of(null);
    }
    return this.getMarketSnapshot(coin, dex).pipe(
      // The page has nothing at all without this snapshot, and it is a plain
      // read, so a connection that dropped on the way in is worth asking again
      // before the user is told the market could not be loaded.
      this.retryTransientFetch(),
      switchMap((market) =>
        market
          ? concat(
              of(market),
              // Frames that arrive while the snapshot is in flight are lost,
              // which costs nothing: every frame is a complete context, so the
              // next one restates whatever the missed ones said.
              this.subscribe({ type: 'activeAssetCtx', coin }).pipe(
                filter((frame) => !!frame?.ctx),
                map((frame) => ({
                  ...market,
                  ...this.marketContextFields(frame.ctx),
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
   * off the all-DEX snapshot the market list needs. The DEX is read from the
   * coin itself: a HIP-3 coin carries its DEX as a prefix, and a bare coin is
   * canonical by definition.
   */
  private getMarketSnapshot(
    coin: string,
    dex: string
  ): Observable<PerpsMarket | null> {
    // The registry only exists to place a HIP-3 DEX in the asset-id space;
    // canonical markets are index 0 by definition and skip the request.
    const registry = dex ? this.getDexRegistry() : of([]);
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
        const request: any = { type: 'metaAndAssetCtxs' };
        if (dex) {
          request.dex = dex;
        }
        return this.post<
          [{ universe: PerpsUniverseItem[] }, PerpsAssetCtx[]]
        >(request).pipe(
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
            return this.buildMarket(item, ctx, dex, dexIndex, index);
          })
        );
      })
    );
  }

  /**
   * One market-context subscription per DEX the product actually shows.
   *
   * The alternative, `allDexsAssetCtxs`, broadcasts every deployed HIP-3 DEX in
   * a single frame — on testnet roughly 170KB of which three quarters is DEXes
   * NeoLine does not list — and it arrives no more often than the per-DEX
   * frames do. Each frame carries prices and 24h statistics together, so the
   * list never has to pair a price from one message with a `prevDayPx` from
   * another.
   */
  private startMarketStream() {
    const stream = new Subscription();
    this.enabledDexes.forEach((dex) => {
      stream.add(
        this.subscribe({ type: 'assetCtxs', dex }).subscribe((update) =>
          this.applyAssetContextFrame(dex, update?.ctxs)
        )
      );
    });
    this.marketLiveSub = stream;
  }

  private applyAssetContextFrame(dex: string, ctxs: PerpsAssetCtx[]) {
    if (!Array.isArray(ctxs) || ctxs.length === 0) {
      return;
    }
    this.marketFeedAt$.next(Date.now());
    const current = this.marketState$.value;
    if (!current || current.length === 0) {
      // The REST snapshot defines which markets exist; hold the frame until it
      // lands rather than inventing markets from a context array.
      this.pendingAssetContexts.set(dex, ctxs);
      return;
    }
    const updated = this.mergeDexAssetContexts(current, dex, ctxs);
    this.marketState$.next(updated);
    this.marketCache = {
      expiresAt: Date.now() + this.marketCacheMs,
      request: of(updated),
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
   * Apply one DEX's context frame to the markets of that DEX.
   *
   * Context indexes match that DEX's original universe, so `dexAssetIndex` is
   * the only valid way in — a market's position in this (volume-sorted) array
   * is not an asset identifier. Markets on other DEXes keep their exact object
   * identity, and the array is deliberately not re-sorted: a live price must
   * not move a row out from under the finger about to tap it.
   */
  mergeDexAssetContexts(
    markets: PerpsMarket[],
    dex: string,
    ctxs: PerpsAssetCtx[]
  ): PerpsMarket[] {
    if (!Array.isArray(ctxs) || ctxs.length === 0) {
      return markets;
    }
    return markets.map((market) => {
      if (market.dex !== dex) {
        return market;
      }
      const ctx = ctxs[market.dexAssetIndex];
      return ctx ? { ...market, ...this.marketContextFields(ctx) } : market;
    });
  }

  /**
   * One universe entry joined with its live context.
   *
   * `assetId` is derived from the entry's position in its own DEX's universe,
   * which is why the caller passes the original index rather than the position
   * in any list built from it.
   */
  private buildMarket(
    item: PerpsUniverseItem,
    ctx: PerpsAssetCtx,
    dex: string,
    dexIndex: number,
    index: number
  ): PerpsMarket {
    const protocolCoin =
      dex && !item.name.includes(':') ? `${dex}:${item.name}` : item.name;
    const symbol = protocolCoin.includes(':')
      ? protocolCoin.slice(protocolCoin.indexOf(':') + 1)
      : protocolCoin;
    const marginMode =
      item.marginMode === 'strictIsolated' || item.marginMode === 'noCross'
        ? item.marginMode
        : null;
    return {
      key: `${dex || 'hl'}:${symbol}`,
      assetId: dex ? 100000 + dexIndex * 10000 + index : index,
      dex,
      dexAssetIndex: index,
      coin: protocolCoin,
      symbol,
      szDecimals: item.szDecimals,
      maxLeverage: item.maxLeverage,
      marginMode,
      ...this.marketContextFields(ctx),
    };
  }

  private marketContextFields(
    ctx: PerpsAssetCtx
  ): Pick<
    PerpsMarket,
    | 'markPxExact'
    | 'midPxExact'
    | 'oraclePxExact'
    | 'prevDayPxExact'
    | 'changePercentExact'
    | 'changeAmountExact'
    | 'dayVolumeExact'
    | 'openInterestExact'
    | 'openInterestSizeExact'
    | 'fundingExact'
  > {
    const markPxExact = this.toFiniteDecimal(ctx.markPx);
    const rawMidPxExact =
      ctx.midPx === null ? null : this.toFiniteDecimal(ctx.midPx);
    const midPxExact =
      rawMidPxExact && new BigNumber(rawMidPxExact).isGreaterThan(0)
        ? rawMidPxExact
        : null;
    const oraclePxExact = this.toFiniteDecimal(ctx.oraclePx);
    const prevDayPxExact = this.toFiniteDecimal(ctx.prevDayPx);
    const dayVolumeExact = this.toFiniteDecimal(ctx.dayNtlVlm);
    const openInterestSizeExact = this.toFiniteDecimal(ctx.openInterest);
    const openInterestExact = new BigNumber(openInterestSizeExact)
      .times(markPxExact)
      .toFixed();
    const fundingExact = this.toFiniteDecimal(ctx.funding);
    const changeAmount =
      midPxExact && new BigNumber(prevDayPxExact).isGreaterThan(0)
        ? new BigNumber(midPxExact).minus(prevDayPxExact)
        : null;
    const change = changeAmount
      ? changeAmount.dividedBy(prevDayPxExact).times(100)
      : null;
    return {
      markPxExact,
      midPxExact,
      oraclePxExact,
      prevDayPxExact,
      // Quoted against the mid, which is the price every screen displays, so a
      // price and the change beside it can never disagree. `prevDayPx` is the
      // mid of 24h ago, so this is mid against mid — the one comparison that
      // means anything. The mark is an oracle-weighted price that lags the book
      // by design; it stays reserved for margin, liquidation and valuation, and
      // must never stand in here. A market with no mid has no change to quote:
      // that is market statistics unavailable, which is `null` and not `0`.
      changePercentExact: change ? change.toFixed() : null,
      // Derived from the same two prices as the percentage, so the amount and
      // the percentage beside it can never describe different moves.
      changeAmountExact: changeAmount ? changeAmount.toFixed() : null,
      dayVolumeExact,
      openInterestSizeExact,
      openInterestExact,
      fundingExact,
    };
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
      markPxExact: this.toFiniteDecimal(data.markPx),
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

  /** Keep API decimal strings intact for values that can flow back into a signature. */
  private toFiniteDecimal(value: any): string {
    const parsed = new BigNumber(value ?? 0);
    return parsed.isFinite() ? (parsed.isZero() ? '0' : parsed.toFixed()) : '0';
  }

  /**
   * Historical candles. Hyperliquid returns at most the 5000 most recent candles
   * and ignores ranges beyond that, so `limit` only trims the tail we render.
   *
   * `endTime` pages backward from an already-loaded bar: the chart asks for
   * the window that ends there rather than always taking "now".
   */
  getCandles(
    coin: string,
    interval: PerpsCandleInterval,
    limit = PERPS_CANDLE_LIMIT,
    endTime = Date.now()
  ): Observable<PerpsCandle[]> {
    const startTime = endTime - this.intervalMs(interval) * limit;
    return this.getCandleRange(coin, interval, startTime, endTime).pipe(
      map((res) => res.slice(-limit))
    );
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

  /**
   * Candles already seen for this market and interval, or `null` when what is
   * held is too old to put on screen.
   *
   * Freshness is measured in bars rather than in seconds: a 1m chart is out of
   * date within minutes while a 1d chart is not. One missed bar plus transport
   * jitter is tolerated, which is where the half comes from; past that the gap
   * would be visible and a snapshot is the honest answer.
   */
  cachedCandles(
    coin: string,
    interval: PerpsCandleInterval
  ): PerpsCandle[] | null {
    const cached = this.candleCache.get(this.candleCacheKey(coin, interval));
    const last = cached?.[cached.length - 1];
    if (!last) {
      return null;
    }
    return Date.now() - last.t <= this.intervalMs(interval) * 2.5
      ? cached
      : null;
  }

  /**
   * Remember what the chart is showing, for the next visit to this market.
   *
   * The caller's array is stored as it is rather than copied: it is already
   * replaced rather than mutated on every update, so the two cannot drift.
   */
  rememberCandles(
    coin: string,
    interval: PerpsCandleInterval,
    candles: PerpsCandle[]
  ) {
    if (!coin || !candles?.length) {
      return;
    }
    const key = this.candleCacheKey(coin, interval);
    // Re-inserting moves the key to the end, which keeps the map in
    // least-recently-used order and makes the first key the one to drop.
    this.candleCache.delete(key);
    this.candleCache.set(key, candles);
    while (this.candleCache.size > this.candleCacheEntries) {
      this.candleCache.delete(this.candleCache.keys().next().value);
    }
  }

  private candleCacheKey(coin: string, interval: PerpsCandleInterval): string {
    return `${coin}:${interval}`;
  }

  getUserFills(address: string): Observable<PerpsFill[]> {
    return this.post<PerpsFill[]>({
      type: 'userFills',
      user: address.toLowerCase(),
    }).pipe(
      map((res) => this.normalizeIds(Array.isArray(res) ? res : []))
    );
  }

  /** Websocket snapshot followed by incremental fill pushes. */
  watchUserFills(address: string): Observable<any> {
    const user = address.toLowerCase();
    return this.subscribe({ type: 'userFills', user });
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
          map((res) => this.normalizeIds(Array.isArray(res) ? res : []))
        )
      )
    ).pipe(map((ordersByDex) => ordersByDex.flat()));
  }

  /** Full open-order snapshots pushed whenever the user's book changes. */
  watchOpenOrders(address: string): Observable<PerpsOpenOrder[]> {
    const user = address.toLowerCase();
    return combineLatest(
      this.enabledDexes.map((dex) =>
        this.subscribe({ type: 'openOrders', user, dex }).pipe(
          map((data) =>
            this.normalizeIds(Array.isArray(data?.orders) ? data.orders : [])
          )
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
      map((res) => this.normalizeIds(Array.isArray(res) ? res : []))
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

  /**
   * How long one candle of this interval covers.
   *
   * Case is the whole game here: `m` is a minute and `M` is a month, and an
   * unknown unit must not quietly fall back to either. A month has no fixed
   * length, so thirty days sizes the request window and nothing else — the
   * exchange still decides where its monthly bars begin and end.
   */
  intervalMs(interval: PerpsCandleInterval): number {
    const unit = interval.slice(-1);
    const value = Number(interval.slice(0, -1));
    const table = {
      m: 60e3,
      h: 3600e3,
      d: 86400e3,
      w: 7 * 86400e3,
      M: 30 * 86400e3,
    };
    const unitMs = table[unit];
    if (!unitMs) {
      throw new Error(`Unsupported Hyperliquid candle interval: ${interval}`);
    }
    return value * unitMs;
  }

  //#endregion

  //#region websocket

  /**
   * Subscribe to a websocket channel. The returned observable replays nothing;
   * callers must provide a REST/cache baseline and preserve frames that race a
   * concurrent snapshot refresh.
   */
  subscribe(subscription: any): Observable<any> {
    return new Observable<any>((observer) => {
      const key = this.channelKey(subscription);
      // A teardown still pending means the exchange was never told to stop:
      // the channel is alive and is simply picked up again.
      this.cancelChannelTeardown(key);
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
        this.scheduleChannelTeardown(key, subscription);
      };
    });
  }

  /**
   * Close an abandoned channel, once it has stayed abandoned.
   *
   * The socket outlives the channel for the same reason: closing it here would
   * make a market switch redial a connection the next page needs anyway.
   */
  private scheduleChannelTeardown(key: string, subscription: any) {
    this.cancelChannelTeardown(key);
    this.channelTeardowns.set(
      key,
      setTimeout(() => {
        this.channelTeardowns.delete(key);
        // A subscriber that came and went inside the window scheduled its own
        // teardown; only an abandoned channel is closed here.
        if (this.channelObservers.get(key)) {
          return;
        }
        this.channels.delete(key);
        this.activeSubs.delete(key);
        if (this.wsReady) {
          this.send({ method: 'unsubscribe', subscription });
        }
        if (this.channels.size === 0) {
          this.closeSocket();
        }
      }, this.channelTeardownMs)
    );
  }

  private cancelChannelTeardown(key: string) {
    const timer = this.channelTeardowns.get(key);
    if (timer !== undefined) {
      clearTimeout(timer);
      this.channelTeardowns.delete(key);
    }
  }

  /**
   * Channel identity includes every selector that distinguishes subscriptions.
   *
   * `dex` is part of that identity even when it is the empty canonical value:
   * market contexts and clearinghouse state are subscribed once per DEX, and
   * without it every DEX would share one channel and overwrite the others.
   */
  private channelKey(subscription: any): string {
    const { type, coin, interval } = subscription;
    const user =
      typeof subscription.user === 'string'
        ? subscription.user.toLowerCase()
        : undefined;
    // Always present for DEX-scoped channels, defaulting to the canonical DEX,
    // so that omitting `dex` subscribes to canonical rather than to a key no
    // frame will ever match.
    const dex = DEX_SCOPED_CHANNELS.has(type)
      ? `dex=${subscription.dex ?? ''}`
      : undefined;
    return [type, user, dex, coin, interval].filter(Boolean).join(':');
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
      this.connectionState$.next('live');
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
        this.markStale();
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
      msg = this.parseProtocolJson(event.data);
    } catch (e) {
      return;
    }
    if (!msg || !msg.channel) {
      return;
    }
    if (msg.channel === 'pong') {
      clearTimeout(this.pongTimer);
      this.pongTimer = undefined;
      return;
    }
    if (msg.channel === 'candle') {
      const candles = Array.isArray(msg.data) ? msg.data : [msg.data];
      candles.forEach((candle) => {
        if (
          typeof candle?.s === 'string' &&
          typeof candle?.i === 'string'
        ) {
          this.emit(`candle:${candle.s}:${candle.i}`, candle);
        }
      });
      return;
    }
    if (msg.channel === 'activeAssetCtx') {
      this.emit(`activeAssetCtx:${msg.data?.coin}`, msg.data);
      return;
    }
    if (msg.channel === 'assetCtxs') {
      // One frame per DEX, each carrying that DEX's whole context array.
      this.emit(`assetCtxs:dex=${msg.data?.dex ?? ''}`, msg.data);
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
        `clearinghouseState:${msg.data.user.toLowerCase()}:dex=${
          msg.data.dex ?? ''
        }`,
        msg.data
      );
      return;
    }
    if (
      msg.channel === 'openOrders' &&
      typeof msg.data?.user === 'string'
    ) {
      this.normalizeIds(msg.data);
      this.emit(
        `openOrders:${msg.data.user.toLowerCase()}:dex=${msg.data.dex ?? ''}`,
        msg.data
      );
      return;
    }
    if (
      [
        'userFills',
        'orderUpdates',
        'userNonFundingLedgerUpdates',
      ].includes(msg.channel) &&
      typeof msg.data?.user === 'string'
    ) {
      this.normalizeIds(msg.data);
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
      if (this.ws !== socket || socket.readyState !== WebSocket.OPEN) {
        return;
      }
      socket.send(JSON.stringify({ method: 'ping' }));
      // Closing the socket ourselves is what makes the failure visible: it
      // triggers `onclose`, which marks the feed stale and schedules a
      // reconnect. Waiting for the OS to time the connection out can take
      // minutes, and the whole time the screen shows prices as if they were live.
      clearTimeout(this.pongTimer);
      this.pongTimer = setTimeout(() => {
        if (this.ws === socket) {
          this.markStale();
          try {
            socket.close();
          } catch (e) {
            // Already gone; `onclose` still runs.
          }
        }
      }, this.pongTimeoutMs);
    }, this.heartbeatMs);
  }

  private stopHeartbeat() {
    clearInterval(this.heartbeatTimer);
    this.heartbeatTimer = undefined;
    clearTimeout(this.pongTimer);
    this.pongTimer = undefined;
  }

  private markStale() {
    if (this.connectionState$.value !== 'stale') {
      this.connectionState$.next('stale');
    }
  }

  private closeSocket() {
    clearTimeout(this.reconnectTimer);
    this.stopHeartbeat();
    this.wsReady = false;
    // Deliberate teardown, not a failure: the next subscriber starts over.
    this.connectionState$.next('connecting');
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
