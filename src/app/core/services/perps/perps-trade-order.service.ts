import { Injectable } from '@angular/core';
import { ethers } from 'ethers';
import BigNumber from 'bignumber.js';
import { defer, Observable, of, throwError } from 'rxjs';
import { map, switchMap } from 'rxjs/operators';

import {
  PerpsAccount,
  PerpsAccountState,
  PerpsExchangeResponse,
  PerpsOrderExecutionResult,
  PerpsPosition,
  PerpsTradeOrderIntent,
  PERPS_MAX_SLIPPAGE_PERCENT,
  PERPS_MIN_SLIPPAGE_PERCENT,
  perpsPriceDecimals,
} from '@popup/_lib/perps';
import { HyperliquidService } from './hyperliquid.service';
import { PerpsAccountStateService } from './perps-account-state.service';
import { PerpsOrder, PerpsTradeOrderError } from './perps-trade-order';

interface PerpsOrderExchange {
  submitOrder(
    privateKey: string,
    order: PerpsOrder
  ): Observable<PerpsOrderExecutionResult>;
  updateLeverage(
    privateKey: string,
    assetId: number,
    leverage: number,
    maxLeverage: number
  ): Observable<PerpsExchangeResponse>;
}

interface PerpsOrderAccounts {
  refreshAccount(
    address: string,
    dex?: string
  ): Observable<PerpsAccountState<PerpsAccount>>;
}

export type PerpsTradeSubmission =
  | { kind: 'leverage-updated'; leverage: number }
  | { kind: 'order-submitted'; result: PerpsOrderExecutionResult };

/**
 * Turns one user-confirmed trade intent into one canonical protocol order.
 *
 * Callers do not decide reduce-only, refresh exact close/reverse sizes, quantize
 * wire values, or combine leverage changes with an order. Those invariants all
 * live behind this interface and are tested through `submit`.
 */
@Injectable({ providedIn: 'root' })
export class PerpsTradeOrderService {
  private readonly exchange: PerpsOrderExchange;
  private readonly accounts: PerpsOrderAccounts;

  constructor(
    hyperliquid: HyperliquidService,
    accountStates: PerpsAccountStateService
  ) {
    this.exchange = hyperliquid;
    this.accounts = accountStates;
  }

  submit(
    privateKey: string,
    intent: PerpsTradeOrderIntent
  ): Observable<PerpsTradeSubmission> {
    return defer(() => {
      this.validateIntent(intent);
      const address = this.signerAddress(privateKey);
      return this.resolveSize(address, intent).pipe(
        switchMap((sizeExact) => {
          const leverage = intent.leverage;
          if (this.requiresLeverageUpdate(intent)) {
            return this.exchange
              .updateLeverage(
                privateKey,
                intent.market.assetId,
                leverage,
                intent.market.maxLeverage
              )
              .pipe(
                map(() => ({ kind: 'leverage-updated', leverage } as const))
              );
          }

          const order = this.buildOrder(intent, sizeExact);
          return this.exchange.submitOrder(privateKey, order).pipe(
            map(
              (result) =>
                ({ kind: 'order-submitted', result } as const)
            )
          );
        })
      );
    });
  }

  private validateIntent(intent: PerpsTradeOrderIntent) {
    const market = intent?.market;
    if (
      typeof market?.coin !== 'string' ||
      !market.coin ||
      typeof market.key !== 'string' ||
      !market.key ||
      typeof market.dex !== 'string'
    ) {
      throw this.invalidIntent('Order is missing its market identity');
    }
    if (!Number.isSafeInteger(market.assetId) || market.assetId < 0) {
      throw this.invalidIntent('Order has an invalid asset id');
    }
    if (!Number.isInteger(market.maxLeverage) || market.maxLeverage < 1) {
      throw this.invalidIntent('Order has invalid maximum leverage');
    }
    if (
      !Number.isInteger(market.szDecimals) ||
      market.szDecimals < 0 ||
      market.szDecimals > 8
    ) {
      throw this.invalidIntent('Order has invalid size precision');
    }
    if (!['long', 'short'].includes(intent.side)) {
      throw this.invalidIntent('Order has an invalid side');
    }
    if (!['market', 'limit'].includes(intent.orderType)) {
      throw this.invalidIntent('Order has an invalid type');
    }
    if (
      !['open', 'increase', 'reduce', 'close', 'reverse'].includes(
        intent.operation
      )
    ) {
      throw this.invalidIntent('Order has an invalid operation');
    }
    if (
      !Number.isInteger(intent.leverage) ||
      intent.leverage < 1 ||
      intent.leverage > market.maxLeverage
    ) {
      throw this.invalidIntent('Order has invalid leverage');
    }
    if (
      !Number.isFinite(intent.maxSlippagePercent) ||
      intent.maxSlippagePercent < PERPS_MIN_SLIPPAGE_PERCENT ||
      intent.maxSlippagePercent > PERPS_MAX_SLIPPAGE_PERCENT
    ) {
      throw this.invalidIntent(
        'Order slippage is outside the configured range'
      );
    }
    const price = new BigNumber(intent.referencePriceExact);
    if (!price.isFinite() || !price.isGreaterThan(0)) {
      throw this.invalidIntent('Order has no execution price');
    }
    if (intent.operation !== 'close') {
      const size = new BigNumber(intent.requestedSizeExact);
      if (!size.isFinite() || !size.isGreaterThan(0)) {
        throw this.invalidIntent('Order has no positive size');
      }
    }
  }

  private requiresLeverageUpdate(intent: PerpsTradeOrderIntent): boolean {
    if (intent.operation === 'reduce' || intent.operation === 'close') {
      return false;
    }
    return !(
      intent.currentLeverage?.type === 'isolated' &&
      intent.currentLeverage.value === intent.leverage
    );
  }

  private resolveSize(
    address: string,
    intent: PerpsTradeOrderIntent
  ): Observable<string> {
    if (intent.operation !== 'close' && intent.operation !== 'reverse') {
      return of(intent.requestedSizeExact);
    }
    return this.accounts
      .refreshAccount(address, intent.market.dex)
      .pipe(
        switchMap((state) =>
          state.account
            ? of(this.positionSize(state.account, intent))
            : throwError(
                () =>
                  new PerpsTradeOrderError(
                    'account-unavailable',
                    'Account unavailable during order preparation'
                  )
              )
        )
      );
  }

  private positionSize(
    account: PerpsAccount,
    intent: PerpsTradeOrderIntent
  ): string {
    const position = account.positions?.find(
      (item) => item.key === intent.market.key
    );
    if (!this.positionIsOpposite(position, intent)) {
      throw this.positionChanged();
    }
    const held = new BigNumber(position.sziExact).absoluteValue();
    if (intent.operation === 'close') {
      return held.toFixed();
    }
    if (position.leverageType === 'cross') {
      throw this.positionChanged();
    }
    return held.plus(intent.requestedSizeExact).toFixed();
  }

  private positionIsOpposite(
    position: PerpsPosition | undefined,
    intent: PerpsTradeOrderIntent
  ): boolean {
    const signed = new BigNumber(position?.sziExact ?? 0);
    return intent.side === 'long'
      ? signed.isLessThan(0)
      : signed.isGreaterThan(0);
  }

  private buildOrder(
    intent: PerpsTradeOrderIntent,
    requestedSizeExact: string
  ): PerpsOrder {
    const isBuy = intent.side === 'long';
    const sizeExact = new BigNumber(requestedSizeExact)
      .decimalPlaces(intent.market.szDecimals, BigNumber.ROUND_FLOOR)
      .toFixed();
    if (!new BigNumber(sizeExact).isGreaterThan(0)) {
      throw this.invalidIntent('Order size is below the market lot size');
    }
    const referencePrice = new BigNumber(intent.referencePriceExact);
    const slippage = new BigNumber(intent.maxSlippagePercent).dividedBy(100);
    const boundedPrice =
      intent.orderType === 'market'
        ? referencePrice.times(
            new BigNumber(1)[isBuy ? 'plus' : 'minus'](slippage)
          )
        : referencePrice;
    const priceExact = boundedPrice
      .decimalPlaces(
        perpsPriceDecimals(
          boundedPrice.toNumber(),
          intent.market.szDecimals
        ),
        isBuy ? BigNumber.ROUND_FLOOR : BigNumber.ROUND_CEIL
      )
      .toFixed();
    if (!new BigNumber(priceExact).isGreaterThan(0)) {
      throw this.invalidIntent('Order price is below the market tick size');
    }
    return {
      assetId: intent.market.assetId,
      isBuy,
      priceExact,
      sizeExact,
      reduceOnly:
        intent.operation === 'reduce' || intent.operation === 'close',
      timeInForce: intent.orderType === 'market' ? 'Ioc' : 'Gtc',
      cloid: ethers.hexlify(ethers.randomBytes(16)),
    };
  }

  private invalidIntent(message: string): PerpsTradeOrderError {
    return new PerpsTradeOrderError('invalid-intent', message);
  }

  private signerAddress(privateKey: string): string {
    try {
      return ethers.computeAddress(privateKey);
    } catch {
      throw this.invalidIntent('Order signer is invalid');
    }
  }

  private positionChanged(): PerpsTradeOrderError {
    return new PerpsTradeOrderError(
      'position-changed',
      'The position changed before the order was signed'
    );
  }
}
