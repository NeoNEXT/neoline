import { Injectable } from '@angular/core';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { ethers } from 'ethers';
import BigNumber from 'bignumber.js';
import { stringify as stringifyLosslessJson } from 'lossless-json';
import { Observable, Subject, from, of, throwError } from 'rxjs';
import { catchError, map, switchMap, tap } from 'rxjs/operators';

import {
  HYPERLIQUID_API,
  PerpsExchangeResponse,
  PerpsOrderExecutionResult,
  PERPS_BUILDER_ADDRESS,
  PERPS_BUILDER_FEE_TENTHS_BPS,
  PERPS_BUILDER_MAX_FEE_RATE,
  PERPS_DEPOSIT_CONFIG,
  perpsFiniteDecimal,
  resolvePerpsTestnet,
} from '@popup/_lib/perps';
import { environment } from '@/environments/environment';
import { isExchangeAnswer } from './perps-fetch-failure';
import { isNonceRejection, PerpsNonceAllocator } from './perps-nonce';
import {
  signHyperliquidApproveBuilderFee,
  signHyperliquidL1Action,
  signHyperliquidSendToEvmWithData,
} from './hyperliquid-signing';
import { normalizeIds, parseProtocolJson } from './perps-protocol-json';
import { PerpsOrder } from './perps-trade-order';

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

/** Which balance a withdrawal debits. */
export interface PerpsWithdrawSource {
  /**
   * True for a unified account, whose USDC lives in spot.
   *
   * Callers that cannot say pass `false`: the exchange refuses a debit the
   * balance cannot cover, so guessing perps costs a rejection rather than a
   * withdrawal taken from somewhere the user did not mean.
   */
  fromSpot: boolean;
}

/**
 * 交易场所写入（Exchange Write） — everything that spends the user's key.
 *
 * One module holds nonce allocation, EIP-712 signing, the builder-fee
 * approval an order's fee field depends on, lossless wire encoding, the one
 * safe re-signature, and the translation of Hyperliquid's answer into an
 * 执行结果（Execution Result）. Callers hand it an already-normalized action
 * and get back a decidable result — or 执行状态未知（Execution Status
 * Unknown), which is not the same as a failure.
 *
 * It reads nothing it does not write. A withdrawal is told which balance to
 * debit rather than looking the account up, so this module owes the account
 * side one thing only: `wrote()`, which says the facts it holds are now out of
 * date. That is a notification and stays one — no local order state machine,
 * no cross-window arbitration, no persisted intent (ADR-0003, ADR-0006).
 */
@Injectable({ providedIn: 'root' })
export class PerpsExchangeWriteService {
  private readonly isTestnet = resolvePerpsTestnet(environment.perpsNetwork);
  /**
   * Nonces are tracked per signer by the exchange, so they are allocated per
   * signer here too.
   */
  private readonly nonces = new PerpsNonceAllocator();
  /** Accounts whose builder-fee approval this session has already confirmed. */
  private readonly builderFeeApproved = new Set<string>();
  private readonly wrote$ = new Subject<void>();

  constructor(private http: HttpClient) {}

  private get api() {
    return this.isTestnet ? HYPERLIQUID_API.testnet : HYPERLIQUID_API.mainnet;
  }

  /**
   * Fires after every accepted write.
   *
   * Whoever holds account facts is expected to treat them as out of date; what
   * it does about that is its own decision, not this module's.
   */
  wrote(): Observable<void> {
    return this.wrote$.asObservable();
  }

  //#region builder fee

  /** Empty when this build has no builder configured for the active network. */
  get builderAddress(): string {
    const address = this.isTestnet
      ? PERPS_BUILDER_ADDRESS.testnet
      : PERPS_BUILDER_ADDRESS.mainnet;
    return address ? address.toLowerCase() : '';
  }

  /** The `builder` field orders carry, or undefined when the fee is disabled. */
  private get builderField(): { b: string; f: number } | undefined {
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
    return this.postInfo<number>({
      type: 'maxBuilderFee',
      user: address.toLowerCase(),
      builder: this.builderAddress,
    }).pipe(
      map((value) => {
        const parsed = Number(value);
        return Number.isFinite(parsed) ? parsed : 0;
      })
    );
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

  //#endregion

  //#region writes

  /** Serialize, sign and send one already-normalized protocol order. */
  submitOrder(
    privateKey: string,
    order: PerpsOrder
  ): Observable<PerpsOrderExecutionResult> {
    if (!Number.isSafeInteger(order.assetId) || order.assetId < 0) {
      throw new Error('Invalid Hyperliquid asset id');
    }
    assertCloid(order.cloid);
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
          t: { limit: { tif: order.timeInForce } },
          c: order.cloid,
        },
      ],
      grouping: 'na',
    });
    return this.ensureBuilderFeeApproved(privateKey).pipe(
      switchMap(() =>
        this.signedL1Action(privateKey, action, true).pipe(
          map((response) =>
            this.parseOrderExecution(response, order.sizeExact, order.cloid)
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

  cancelOrder(
    privateKey: string,
    assetId: number,
    orderId: string
  ): Observable<PerpsExchangeResponse> {
    const oid = parseUint64(orderId, 'order id');
    return this.signedL1Action(privateKey, {
      type: 'cancel',
      cancels: [{ a: assetId, o: oid }],
    });
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

  /**
   * Withdraw from HyperCore to the same address on the deposit chain.
   *
   * The exchange debits HyperCore and the rest happens without the user: the
   * amount crosses to HyperEVM, is burned through CCTP, and is delivered by the
   * forwarder. None of those legs is a transaction the user signs or pays gas
   * for, so this stays a single signed action from the caller's point of view.
   *
   * Which balance is debited is the caller's to state, because the caller is
   * already holding the account that answers it — see `PerpsWithdrawSource`.
   */
  withdraw(
    privateKey: string,
    destination: string,
    amount: string,
    { fromSpot }: PerpsWithdrawSource
  ): Observable<PerpsExchangeResponse> {
    const amountWire = this.floatToWire(amount);
    // Circle names this field chainId; the value is the CCTP domain of the
    // destination (Arbitrum = 3), not the EVM chain id 42161. Passing the chain
    // id sends the burn to a domain that does not exist.
    // SOURCE: CoreDepositWallet natspec and
    // https://developers.circle.com/cctp/howtos/withdraw-usdc-from-hypercore-to-evm
    const destinationChainId = this.depositConfig.cctp.sourceDomain;
    return this.withNonceRetry(privateKey, (nonce) =>
      from(
        signHyperliquidSendToEvmWithData(
          privateKey,
          destination,
          amountWire,
          destinationChainId,
          nonce,
          !this.isTestnet,
          fromSpot ? 'spot' : ''
        )
      ).pipe(
        switchMap(({ action, signature }) =>
          this.postExchange(action, signature, nonce)
        )
      )
    ).pipe(
      tap(() => this.wrote$.next()),
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

  /** Resolve a transport-ambiguous order by its stable client id. */
  getOrderStatus(address: string, cloid: string): Observable<any> {
    assertCloid(cloid);
    return this.postInfo<any>({
      type: 'orderStatus',
      user: address.toLowerCase(),
      oid: cloid.toLowerCase(),
    }).pipe(map((result) => normalizeIds(result)));
  }

  //#endregion

  //#region transport

  private get depositConfig() {
    return this.isTestnet
      ? PERPS_DEPOSIT_CONFIG.testnet
      : PERPS_DEPOSIT_CONFIG.mainnet;
  }

  private nextNonce(privateKey: string): number {
    return this.nonces.next(ethers.computeAddress(privateKey));
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
      tap(() => this.wrote$.next())
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
    const attempt = (remaining: number): Observable<PerpsExchangeResponse> =>
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

  private postExchange(
    action: any,
    signature: any,
    nonce: number,
    allowItemErrors = false
  ): Observable<PerpsExchangeResponse> {
    const requestBody = { action, nonce, signature };
    const body = containsBigInt(requestBody)
      ? stringifyLosslessJson(requestBody)
      : requestBody;
    return this.http
      .post(this.api.exchange, body, {
        headers: { 'Content-Type': 'application/json' },
        responseType: 'text',
      })
      .pipe(
        map((text) => {
          const response = normalizeIds(
            parseProtocolJson(text)
          ) as PerpsExchangeResponse;
          if (response?.status !== 'ok') {
            throw new Error(
              response?.error || 'Hyperliquid rejected the action'
            );
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

  /** The two unauthenticated reads that only exist to serve a write. */
  private postInfo<T>(body: any): Observable<T> {
    return this.http
      .post(this.api.info, body, {
        headers: { 'Content-Type': 'application/json' },
        responseType: 'text',
      })
      .pipe(map((text) => parseProtocolJson(text) as T));
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

  //#endregion
}

/** The client order id both submission and its recovery are addressed by. */
function assertCloid(cloid: string) {
  if (!/^0x[0-9a-fA-F]{32}$/u.test(cloid)) {
    throw new Error('Invalid Hyperliquid cloid');
  }
}

function parseUint64(value: string, label: string): bigint {
  if (!/^\d+$/u.test(value)) {
    throw new Error(`Invalid Hyperliquid ${label}`);
  }
  const parsed = BigInt(value);
  if (parsed > 0xffffffffffffffffn) {
    throw new Error(`Hyperliquid ${label} exceeds uint64`);
  }
  return parsed;
}

function containsBigInt(value: unknown): boolean {
  if (typeof value === 'bigint') {
    return true;
  }
  if (Array.isArray(value)) {
    return value.some((item) => containsBigInt(item));
  }
  return !!value && typeof value === 'object'
    ? Object.keys(value).some((key) => containsBigInt((value as any)[key]))
    : false;
}
