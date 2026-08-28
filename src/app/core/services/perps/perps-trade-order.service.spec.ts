import BigNumber from 'bignumber.js';
import { of, throwError } from 'rxjs';

import {
  PerpsAccount,
  PerpsOrderExecutionResult,
  PerpsPosition,
  PerpsTradeOrderIntent,
} from '@popup/_lib/perps';
import {
  PerpsTradeOrderService,
  PerpsTradeSubmission,
} from './perps-trade-order.service';
import { PerpsOrder } from './perps-trade-order';

const PRIVATE_KEY =
  '0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d';
const ADDRESS = '0x70997970C51812dc3A010C7d01b50e0d17dc79C8';

const intent = (
  values: Partial<PerpsTradeOrderIntent> = {}
): PerpsTradeOrderIntent => ({
  market: {
    key: 'hl:ETH',
    coin: 'ETH',
    dex: '',
    assetId: 3,
    szDecimals: 2,
    maxLeverage: 20,
  },
  operation: 'open',
  side: 'long',
  referencePriceExact: '100',
  requestedSizeExact: '1.259',
  leverage: 5,
  orderType: 'market',
  maxSlippagePercent: 1.5,
  ...values,
});

const account = (
  positions: Array<Partial<PerpsPosition>>
): PerpsAccount =>
  ({ positions } as PerpsAccount);

describe('PerpsTradeOrderService', () => {
  let exchange: jasmine.SpyObj<any>;
  let accounts: jasmine.SpyObj<any>;
  let service: PerpsTradeOrderService;

  beforeEach(() => {
    exchange = jasmine.createSpyObj('PerpsOrderExchange', [
      'submitOrder',
      'updateLeverage',
    ]);
    exchange.submitOrder.and.callFake(
      (_privateKey: string, order: PerpsOrder) =>
        of({
          status: 'filled',
          cloid: order.cloid,
          submittedSizeExact: order.sizeExact,
          filledSizeExact: order.sizeExact,
          remainingSizeExact: '0',
        } as PerpsOrderExecutionResult)
    );
    exchange.updateLeverage.and.returnValue(of({ status: 'ok' }));
    accounts = jasmine.createSpyObj('PerpsOrderAccounts', [
      'refreshAccount',
    ]);
    service = new PerpsTradeOrderService(exchange, accounts);
  });

  it('turns an opening intent into one normalized IOC order', () => {
    let submission: PerpsTradeSubmission;

    service
      .submit(PRIVATE_KEY, intent())
      .subscribe((value) => (submission = value));

    expect(exchange.updateLeverage).toHaveBeenCalledWith(PRIVATE_KEY, 3, 5, 20);
    expect(accounts.refreshAccount).not.toHaveBeenCalled();
    expect(exchange.submitOrder).toHaveBeenCalledTimes(1);
    const order = exchange.submitOrder.calls.mostRecent().args[1];
    expect(order).toEqual({
      assetId: 3,
      isBuy: true,
      priceExact: '101.5',
      sizeExact: '1.25',
      reduceOnly: false,
      timeInForce: 'Ioc',
      cloid: jasmine.stringMatching(/^0x[0-9a-f]{32}$/u),
    });
    expect(submission.kind).toBe('order-submitted');
    expect((submission as any).result.cloid).toBe(order.cloid);
  });

  /**
   * 杠杆在使用它的那笔订单之前立即写入，属于同一次操作。用户只按一次按钮：交易场所侧
   * 的值与表单不一致，过去要让用户多按一次。
   */
  it('writes leverage and places the order in one submission', () => {
    let submission: PerpsTradeSubmission;

    service
      .submit(PRIVATE_KEY, intent({ leverage: 7 }))
      .subscribe((value) => (submission = value));

    expect(exchange.updateLeverage).toHaveBeenCalledWith(PRIVATE_KEY, 3, 7, 20);
    expect(exchange.submitOrder).toHaveBeenCalledTimes(1);
    expect(submission.kind).toBe('order-submitted');
  });

  /** 写入失败不会留下任何订单：交易场所压根没见过订单。 */
  it('places no order when the leverage write is rejected', () => {
    const errors = jasmine.createSpy('errors');
    exchange.updateLeverage.and.returnValue(
      throwError(() => new Error('margin tier'))
    );

    service.submit(PRIVATE_KEY, intent()).subscribe({ error: errors });

    expect(errors).toHaveBeenCalled();
    expect(exchange.submitOrder).not.toHaveBeenCalled();
  });

  it('derives reduce-only and GTC from a reduce intent', () => {
    service
      .submit(
        PRIVATE_KEY,
        intent({
          operation: 'reduce',
          side: 'short',
          orderType: 'limit',
          referencePriceExact: '123.456',
          requestedSizeExact: '0.5009',
          market: { ...intent().market, szDecimals: 3 },
        })
      )
      .subscribe();

    const order = exchange.submitOrder.calls.mostRecent().args[1];
    expect(order.priceExact).toBe('123.46');
    expect(order.sizeExact).toBe('0.5');
    expect(order.reduceOnly).toBeTrue();
    expect(order.timeInForce).toBe('Gtc');
    expect(exchange.updateLeverage).not.toHaveBeenCalled();
  });

  it('rejects slippage outside the user-configurable range', () => {
    const errors = jasmine.createSpy('errors');

    service
      .submit(PRIVATE_KEY, intent({ maxSlippagePercent: 999 }))
      .subscribe({ error: errors });

    expect(errors).toHaveBeenCalledWith(
      jasmine.objectContaining({
        code: 'invalid-intent',
        message: 'Order slippage is outside the configured range',
      })
    );
    expect(exchange.submitOrder).not.toHaveBeenCalled();
  });

  it('rejects an invalid signer before any exchange action', () => {
    const errors = jasmine.createSpy('errors');

    service.submit('not-a-private-key', intent()).subscribe({ error: errors });

    expect(errors).toHaveBeenCalledWith(
      jasmine.objectContaining({
        code: 'invalid-intent',
        message: 'Order signer is invalid',
      })
    );
    expect(exchange.updateLeverage).not.toHaveBeenCalled();
    expect(exchange.submitOrder).not.toHaveBeenCalled();
  });

  it('refreshes the correct DEX and uses the exact live size for a close', () => {
    accounts.refreshAccount.and.returnValue(
      of({
        availability: 'stale',
        account: account([
          {
            key: 'xyz:ETH',
            coin: 'xyz:ETH',
            sziExact: '0.75',
            leverageType: 'cross',
          },
        ]),
        missingDexes: [],
        updatedAt: 1,
      })
    );

    service
      .submit(
        PRIVATE_KEY,
        intent({
          operation: 'close',
          side: 'short',
          requestedSizeExact: '0',
          market: {
            ...intent().market,
            key: 'xyz:ETH',
            coin: 'xyz:ETH',
            dex: 'xyz',
          },
        })
      )
      .subscribe();

    expect(accounts.refreshAccount).toHaveBeenCalledWith(ADDRESS, 'xyz');
    const order = exchange.submitOrder.calls.mostRecent().args[1];
    expect(order.sizeExact).toBe('0.75');
    expect(order.reduceOnly).toBeTrue();
  });

  it('rejects a close when the authoritative account is unavailable', () => {
    accounts.refreshAccount.and.returnValue(
      of({
        availability: 'unavailable',
        account: null,
        missingDexes: [''],
        updatedAt: null,
      })
    );
    const errors = jasmine.createSpy('errors');

    service
      .submit(
        PRIVATE_KEY,
        intent({ operation: 'close', side: 'short' })
      )
      .subscribe({ error: errors });

    expect(errors).toHaveBeenCalledWith(
      jasmine.objectContaining({ code: 'account-unavailable' })
    );
    expect(exchange.submitOrder).not.toHaveBeenCalled();
  });

  it('matches a refreshed position by market key rather than coin alone', () => {
    accounts.refreshAccount.and.returnValue(
      of({
        availability: 'live',
        account: account([
          {
            key: 'hl:ETH',
            coin: 'xyz:ETH',
            sziExact: '0.75',
          },
        ]),
        missingDexes: [],
        updatedAt: 1,
      })
    );
    const errors = jasmine.createSpy('errors');

    service
      .submit(
        PRIVATE_KEY,
        intent({
          operation: 'close',
          side: 'short',
          market: {
            ...intent().market,
            key: 'xyz:ETH',
            coin: 'xyz:ETH',
            dex: 'xyz',
          },
        })
      )
      .subscribe({ error: errors });

    expect(errors).toHaveBeenCalledWith(
      jasmine.objectContaining({ code: 'position-changed' })
    );
    expect(exchange.submitOrder).not.toHaveBeenCalled();
  });

  it('adds the held size to the requested opposite size for an explicit reverse', () => {
    accounts.refreshAccount.and.returnValue(
      of({
        availability: 'live',
        account: account([
          {
            key: 'hl:ETH',
            coin: 'ETH',
            sziExact: '-0.75',
            leverageType: 'isolated',
          },
        ]),
        missingDexes: [],
        updatedAt: 1,
      })
    );

    service
      .submit(
        PRIVATE_KEY,
        intent({
          operation: 'reverse',
          requestedSizeExact: '1.25',
        })
      )
      .subscribe();

    const order = exchange.submitOrder.calls.mostRecent().args[1];
    expect(order.sizeExact).toBe('2');
    expect(order.reduceOnly).toBeFalse();
  });

  it('rejects a reverse when the refreshed position is cross-margin', () => {
    accounts.refreshAccount.and.returnValue(
      of({
        availability: 'live',
        account: account([
          {
            key: 'hl:ETH',
            coin: 'ETH',
            sziExact: '-0.75',
            leverageType: 'cross',
          },
        ]),
        missingDexes: [],
        updatedAt: 1,
      })
    );
    const errors = jasmine.createSpy('errors');

    service
      .submit(
        PRIVATE_KEY,
        intent({
          operation: 'reverse',
          requestedSizeExact: '1.25',
        })
      )
      .subscribe({ error: errors });

    expect(errors).toHaveBeenCalledWith(
      jasmine.objectContaining({ code: 'position-changed' })
    );
    expect(exchange.updateLeverage).not.toHaveBeenCalled();
    expect(exchange.submitOrder).not.toHaveBeenCalled();
  });

  it('keeps directional price rounding inside the slippage bound', () => {
    service
      .submit(
        PRIVATE_KEY,
        intent({
          referencePriceExact: '1925.57',
          requestedSizeExact: '0.01',
          maxSlippagePercent: 0.1,
          market: { ...intent().market, szDecimals: 4 },
        })
      )
      .subscribe();
    const buy = new BigNumber(
      exchange.submitOrder.calls.mostRecent().args[1].priceExact
    );

    service
      .submit(
        PRIVATE_KEY,
        intent({
          side: 'short',
          referencePriceExact: '1925.68',
          requestedSizeExact: '0.01',
          maxSlippagePercent: 0.1,
          market: { ...intent().market, szDecimals: 4 },
        })
      )
      .subscribe();
    const sell = new BigNumber(
      exchange.submitOrder.calls.mostRecent().args[1].priceExact
    );

    expect(buy.isLessThanOrEqualTo(new BigNumber('1925.57').times(1.001)))
      .toBeTrue();
    expect(sell.isGreaterThanOrEqualTo(new BigNumber('1925.68').times(0.999)))
      .toBeTrue();
  });
});
