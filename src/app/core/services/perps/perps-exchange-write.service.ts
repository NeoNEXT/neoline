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
 * 一次已签名、但客户端始终不知道结果的写入。
 *
 * 这不是失败：交易场所很可能已经执行了该操作，界面唯一诚实的说法就是「不知道」。绝不能
 * 因为它而重新签名任何东西 —— 第二个签名正是一笔提现变成两笔的方式。
 */
export class PerpsExecutionStatusUnknownError extends Error {
  constructor(readonly reason?: unknown) {
    super('Hyperliquid returned no decidable result');
    this.name = 'PerpsExecutionStatusUnknownError';
  }
}

/** 提现从哪个余额扣款。 */
export interface PerpsWithdrawSource {
  /**
   * 统一账户为 true，它的 USDC 放在现货里。
   *
   * 说不准的调用方传 `false`：交易场所会拒绝余额不足以覆盖的扣款，所以猜成永续的代价
   * 只是一次拒绝，而不是从用户没打算动的地方扣走一笔提现。
   */
  fromSpot: boolean;
}

/**
 * 交易场所写入（Exchange Write）—— 一切要动用用户私钥的操作。
 *
 * 一个模块囊括了 nonce 分配、EIP-712 签名、订单手续费字段所依赖的 builder 费用授权、
 * 无损的上链编码、唯一一次安全的重新签名，以及把 Hyperliquid 的答复翻译成执行结果
 *（Execution Result）。调用方交给它一个已经规范化的 action，拿回一个可判定的结果 ——
 * 或者执行状态未知（Execution Status Unknown），而后者不等于失败。
 *
 * 它不读取任何自己不写的东西。提现是被告知该扣哪个余额，而不是自己去查账户，所以本模块
 * 只欠账户那一侧一件事：`wrote()`，它宣告「你手上的事实现在过期了」。这是一个通知，而且
 * 会一直只是通知 —— 没有本地订单状态机，没有跨窗口仲裁，也不持久化交易意图
 *（ADR-0003、ADR-0006）。
 */
@Injectable({ providedIn: 'root' })
export class PerpsExchangeWriteService {
  private readonly isTestnet = resolvePerpsTestnet(environment.perpsNetwork);
  /**
   * 交易场所是按签名者跟踪 nonce 的，所以这里也按签名者分配。
   */
  private readonly nonces = new PerpsNonceAllocator();
  /** 本次会话已经确认过 builder 费用授权的那些账户。 */
  private readonly builderFeeApproved = new Set<string>();
  private readonly wrote$ = new Subject<void>();

  constructor(private http: HttpClient) {}

  private get api() {
    return this.isTestnet ? HYPERLIQUID_API.testnet : HYPERLIQUID_API.mainnet;
  }

  /**
   * 每次被接受的写入之后触发。
   *
   * 手上持有账户事实的一方应当把它们视为已过期；至于要为此做什么，是它自己的决定，
   * 不归本模块管。
   */
  wrote(): Observable<void> {
    return this.wrote$.asObservable();
  }

  //#region builder 费用

  /** 本版本没有为当前网络配置 builder 时为空。 */
  get builderAddress(): string {
    const address = this.isTestnet
      ? PERPS_BUILDER_ADDRESS.testnet
      : PERPS_BUILDER_ADDRESS.mainnet;
    return address ? address.toLowerCase() : '';
  }

  /** 订单携带的 `builder` 字段；费用被禁用时为 undefined。 */
  private get builderField(): { b: string; f: number } | undefined {
    return this.builderAddress && PERPS_BUILDER_FEE_TENTHS_BPS > 0
      ? { b: this.builderAddress, f: PERPS_BUILDER_FEE_TENTHS_BPS }
      : undefined;
  }

  /**
   * 把 builder 费用附加到下单 action 上；没有配置 builder 时原样返回，不作改动。
   * Hyperliquid 会拒绝 builder 费用超出账户已授权额度的订单，所以两者必须同步。
   */
  private withBuilder(action: any): any {
    const builder = this.builderField;
    return builder ? { ...action, builder } : action;
  }

  /** 该账户已经为我们的 builder 授权的额度，单位是十分之一个基点。 */
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
   * 在订单携带 builder 费用之前，确保账户已经授权它。该授权对每个账户是一次性签名，
   * 所以结果会在本次会话内记住。
   *
   * *查询*失败不致命 —— 无论如何都会尝试授权一次，多余的授权没有害处。*授权*失败则是
   * 致命的：随后的订单会被交易场所拒绝，所以这个错误要抛出来，而不是被吞掉、悄悄变成
   * 一笔不带手续费的订单。
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

  /** 签署这份一次性授权，允许我们的 builder 收取它的费用。 */
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

  //#region 写入

  /** 序列化、签名并发送一个已经规范化的协议订单。 */
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
          // 已签名的订单一旦发出，传输故障就证明不了「被拒绝」。
          // 保住 cloid 并就此停手：重试可能让风险敞口翻倍。
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
   * 从 HyperCore 提现到入金链上的同一地址。
   *
   * 交易场所从 HyperCore 扣款，余下的事都不需要用户参与：这笔钱跨到 HyperEVM、经由 CCTP
   * 销毁，再由转发器投递。这几段中没有任何一段是用户要签名或付 gas 的交易，所以从调用方
   * 的角度看，它仍然是一次单独的已签名操作。
   *
   * 扣哪个余额由调用方说了算，因为调用方手上本来就握着能回答这个问题的账户 ——
   * 见 `PerpsWithdrawSource`。
   */
  withdraw(
    privateKey: string,
    destination: string,
    amount: string,
    { fromSpot }: PerpsWithdrawSource
  ): Observable<PerpsExchangeResponse> {
    const amountWire = this.floatToWire(amount);
    // Circle 把这个字段命名为 chainId；但它的值是目的地的 CCTP domain（Arbitrum = 3），
    // 而不是 EVM 链 id 42161。传链 id 会把这次销毁发往一个并不存在的 domain。
    // 来源：CoreDepositWallet natspec 以及
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
      // 提现动的是本金，所以它不成功的两种方式必须一路区分到屏幕上：交易场所答了「不」
      // 就是什么都没执行，而一个从未到达的响应背后，操作却可能已经跑过了。
      catchError((error) => {
        throw isExchangeAnswer(error)
          ? error
          : new PerpsExecutionStatusUnknownError(error);
      })
    );
  }

  /** 用稳定的客户端订单标识，查清一笔传输结果不明的订单。 */
  getOrderStatus(address: string, cloid: string): Observable<any> {
    assertCloid(cloid);
    return this.postInfo<any>({
      type: 'orderStatus',
      user: address.toLowerCase(),
      oid: cloid.toLowerCase(),
    }).pipe(map((result) => normalizeIds(result)));
  }

  //#endregion

  //#region 传输

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
   * 签名并发送；若交易场所拒绝的正是 nonce 本身，则重新签名一次。
   *
   * 之所以安全，恰恰是因为交易场所作了答：被拒绝意味着什么都没执行，所以第二次尝试不可能
   * 让操作重复。丢失或失败的响应属于相反的情形 —— 操作可能已经跑过 —— 它会被原样重新抛出，
   * 交由调用方按「执行状态未知」处理。
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
    // 传输故障不是答复；这个操作的命运是未知的，
    // 绝不能由我们自作主张再签一次名。
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

  /** 仅仅是为写入服务而存在的那两次免鉴权读取。 */
  private postInfo<T>(body: any): Observable<T> {
    return this.http
      .post(this.api.info, body, {
        headers: { 'Content-Type': 'application/json' },
        responseType: 'text',
      })
      .pipe(map((text) => parseProtocolJson(text) as T));
  }

  /**
   * Hyperliquid 的上链数字最多 8 位小数，且不允许尾随零。
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

/** 提交与事后追查共同据以寻址的客户端订单标识。 */
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
