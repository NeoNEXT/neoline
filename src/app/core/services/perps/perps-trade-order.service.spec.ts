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
    marginMode: null,
  },
  marginMode: 'isolated',
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

    expect(exchange.updateLeverage).toHaveBeenCalledWith(PRIVATE_KEY, 3, 5, 20, 'isolated');
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

  it('attaches opposite reduce-only protection for the normalized opening size', () => {
    service.submit(PRIVATE_KEY, intent({ protection: { takeProfitPriceExact: '120', stopLossPriceExact: '80' } })).subscribe();
    const order = exchange.submitOrder.calls.mostRecent().args[1] as PerpsOrder;
    expect(order.protection.map(({ cloid, ...child }) => child)).toEqual([
      { kind: 'tp', triggerPriceExact: '120', priceExact: '108', sizeExact: '1.25' },
      { kind: 'sl', triggerPriceExact: '80', priceExact: '72', sizeExact: '1.25' },
    ]);
    expect(new Set([order.cloid, ...order.protection.map((child) => child.cloid)]).size).toBe(3);
  });

  it('rejects invalid protection before any leverage or order write', () => {
    const failed = jasmine.createSpy('failed');
    service.submit(PRIVATE_KEY, intent({ protection: { stopLossPriceExact: '110' } })).subscribe({ error: failed });
    expect(failed).toHaveBeenCalled();
    expect(exchange.updateLeverage).not.toHaveBeenCalled();
    expect(exchange.submitOrder).not.toHaveBeenCalled();
  });

  it('uses buy-side trigger bounds for a short entry and rejects protection on a close', () => {
    service.submit(PRIVATE_KEY, intent({ side: 'short', protection: { takeProfitPriceExact: '80' } })).subscribe();
    expect(exchange.submitOrder.calls.mostRecent().args[1].protection[0].priceExact).toBe('88');
    const failed = jasmine.createSpy('failed');
    service.submit(PRIVATE_KEY, intent({ operation: 'close', protection: { takeProfitPriceExact: '120' } })).subscribe({ error: failed });
    expect(failed).toHaveBeenCalled();
    expect(exchange.submitOrder).toHaveBeenCalledTimes(1);
  });

  it('uses decimal magnitude when rounding a price just below a power of ten', () => {
    service.submit(PRIVATE_KEY, intent({
      orderType: 'limit', referencePriceExact: '9999.999999999999',
    })).subscribe();
    expect(exchange.submitOrder.calls.mostRecent().args[1].priceExact)
      .toBe('9999.9');
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

    expect(exchange.updateLeverage).toHaveBeenCalledWith(PRIVATE_KEY, 3, 7, 20, 'isolated');
    expect(exchange.submitOrder).toHaveBeenCalledTimes(1);
    expect(submission.kind).toBe('order-submitted');
  });

  for (const orderType of ['market', 'limit'] as const) {
    it(`applies cross margin before submitting a ${orderType} order`, () => {
      service.submit(PRIVATE_KEY, intent({ marginMode: 'cross', orderType })).subscribe();
      expect(exchange.updateLeverage).toHaveBeenCalledOnceWith(PRIVATE_KEY, 3, 5, 20, 'cross');
      expect(exchange.updateLeverage.calls.first().invocationOrder)
        .toBeLessThan(exchange.submitOrder.calls.first().invocationOrder);
      const order = exchange.submitOrder.calls.first().args[1];
      expect(order.reduceOnly).toBeFalse();
      expect(order.timeInForce).toBe(orderType === 'market' ? 'Ioc' : 'Gtc');
    });
  }

  for (const marginMode of ['noCross', 'strictIsolated'] as const) {
    it(`rejects cross orders on a ${marginMode} market before signing`, () => {
      const errors = jasmine.createSpy('errors');
      service.submit(PRIVATE_KEY, intent({
        marginMode: 'cross', market: { ...intent().market, marginMode },
      })).subscribe({ error: errors });
      expect(errors).toHaveBeenCalledWith(jasmine.objectContaining({ code: 'invalid-intent' }));
      expect(exchange.updateLeverage).not.toHaveBeenCalled();
      expect(exchange.submitOrder).not.toHaveBeenCalled();
    });
  }

  it('does not submit an order when applying cross margin is rejected', () => {
    exchange.updateLeverage.and.returnValue(throwError(() => new Error('Cannot change margin mode')));
    const errors = jasmine.createSpy('errors');
    service.submit(PRIVATE_KEY, intent({ marginMode: 'cross' })).subscribe({ error: errors });
    expect(errors).toHaveBeenCalledWith(jasmine.objectContaining({ code: 'leverage-write' }));
    expect(exchange.submitOrder).not.toHaveBeenCalled();
  });

  it('reduces a cross position without changing its leverage or margin mode', () => {
    service.submit(PRIVATE_KEY, intent({ marginMode: 'cross', operation: 'reduce' })).subscribe();
    expect(exchange.updateLeverage).not.toHaveBeenCalled();
    expect(exchange.submitOrder.calls.first().args[1].reduceOnly).toBeTrue();
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

  it('rejects a reverse when the refreshed margin mode differs from the reviewed mode', () => {
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
