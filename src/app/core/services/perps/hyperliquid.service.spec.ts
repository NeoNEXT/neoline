import { HttpClient } from '@angular/common/http';
import { fakeAsync, flushMicrotasks, tick } from '@angular/core/testing';
import { ethers } from 'ethers';
import { of, Subject, throwError } from 'rxjs';

import {
  PerpsAccount,
  PERPS_BUILDER_FEE_TENTHS_BPS,
  PERPS_MAX_SLIPPAGE_PERCENT,
} from '@popup/_lib/perps';
import { HttpErrorResponse } from '@angular/common/http';
import {
  HyperliquidService,
  isExchangeAnswer,
  PerpsLeverageChangeRequiredError,
  PerpsMarketDataUnavailableError,
  resolvePerpsTestnet,
} from './hyperliquid.service';

const MARKET_IDENTITY = {
  coin: 'ETH',
  marketKey: 'hl:ETH',
  cloid: '0x00000000000000000000000000000001',
};

describe('resolvePerpsTestnet', () => {
  it('uses the configured network in local builds', () => {
    expect(resolvePerpsTestnet('mainnet', false)).toBeFalse();
    expect(resolvePerpsTestnet('testnet', false)).toBeTrue();
  });

  it('always selects mainnet in production builds', () => {
    expect(resolvePerpsTestnet('mainnet', true)).toBeFalse();
    expect(resolvePerpsTestnet('testnet', true)).toBeFalse();
  });
});

describe('HyperliquidService account balances', () => {
  let http: jasmine.SpyObj<HttpClient>;
  let service: HyperliquidService;

  beforeEach(() => {
    http = jasmine.createSpyObj<HttpClient>('HttpClient', ['post']);
    service = new HyperliquidService(http);
  });

  it('loads the user taker fee and caches it by address', () => {
    http.post.and.returnValue(
      of({
        userCrossRate: '0.0004',
        activeReferralDiscount: '0.04',
      }) as any
    );
    const rates: number[] = [];

    service
      .getUserTakerFeeRate('0xABC')
      .subscribe((rate) => rates.push(rate));
    service
      .getUserTakerFeeRate('0xabc')
      .subscribe((rate) => rates.push(rate));

    expect(rates).toEqual([0.000384, 0.000384]);
    expect(http.post).toHaveBeenCalledTimes(1);
    expect(http.post).toHaveBeenCalledWith(
      jasmine.any(String),
      { type: 'userFees', user: '0xabc' },
      jasmine.any(Object)
    );
  });

  it('does not cache an invalid user fee response', () => {
    http.post.and.returnValues(
      of({ userCrossRate: 'invalid' }) as any,
      of({ userCrossRate: '0.00045' }) as any
    );
    const errors = jasmine.createSpy('errors');
    let recoveredRate: number;

    service.getUserTakerFeeRate('0xabc').subscribe({
      error: errors,
    });
    service
      .getUserTakerFeeRate('0xabc')
      .subscribe((rate) => (recoveredRate = rate));

    expect(errors).toHaveBeenCalled();
    expect(recoveredRate).toBe(0.00045);
    expect(http.post).toHaveBeenCalledTimes(2);
  });

  it('queries an ambiguous order by cloid', () => {
    http.post.and.returnValue(
      of({
        status: 'order',
        order: { status: 'open', order: { oid: '9007199254740993' } },
      }) as any
    );
    let result: any;

    service
      .getOrderStatus('0xABC', MARKET_IDENTITY.cloid)
      .subscribe((value) => (result = value));

    expect(http.post).toHaveBeenCalledWith(
      jasmine.any(String),
      {
        type: 'orderStatus',
        user: '0xabc',
        oid: MARKET_IDENTITY.cloid,
      },
      jasmine.any(Object)
    );
    expect(result.status).toBe('order');
  });

  it('requires a separately confirmed leverage update before opening', () => {
    expect(() =>
      service.placeOrder(
        '0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d',
        {
          ...MARKET_IDENTITY,
          assetId: 3,
          isBuy: true,
          price: 100,
          size: '1.25',
          szDecimals: 2,
          maxLeverage: 20,
          leverage: 5,
          orderType: 'market',
          slippagePercent: 1.5,
          reduceOnly: false,
          isCross: false,
        }
      )
    ).toThrowError(PerpsLeverageChangeRequiredError);
    expect(http.post).not.toHaveBeenCalled();
  });

  it('updates isolated leverage as an independent action', fakeAsync(() => {
    http.post.and.returnValue(
      of({ status: 'ok', response: { type: 'default' } }) as any
    );

    service
      .updateLeverage(
        '0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d',
        3,
        5,
        20
      )
      .subscribe();
    flushMicrotasks();

    expect(http.post.calls.mostRecent().args[1].action).toEqual({
      type: 'updateLeverage',
      asset: 3,
      isCross: false,
      leverage: 5,
    });
  }));

  it('converts isolated margin changes to exact signed micro-USDC', fakeAsync(() => {
    http.post.and.returnValue(
      of({ status: 'ok', response: { type: 'default' } }) as any
    );

    service
      .updateIsolatedMargin(
        '0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d',
        3,
        true,
        '-1.000001'
      )
      .subscribe();
    flushMicrotasks();

    const body = JSON.parse(http.post.calls.mostRecent().args[1]);
    expect(body.action).toEqual({
      type: 'updateIsolatedMargin',
      asset: 3,
      isBuy: true,
      ntli: -1000001,
    });
  }));

  it('places an opening order directly when leverage and margin mode match', fakeAsync(() => {
    http.post.and.returnValue(
      of({ status: 'ok', response: { type: 'order' } }) as any
    );

    service
      .placeOrder(
        '0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d',
        {
          ...MARKET_IDENTITY,
          assetId: 3,
          isBuy: true,
          price: 100,
          size: '1.25',
          szDecimals: 2,
          maxLeverage: 20,
          leverage: 5,
          orderType: 'market',
          slippagePercent: 1.5,
          reduceOnly: false,
          isCross: false,
          currentLeverage: { type: 'isolated', value: 5 },
        }
      )
      .subscribe();
    flushMicrotasks();

    const actions = http.post.calls.allArgs().map((args) => args[1].action);
    expect(actions).toHaveSize(1);
    expect(actions[0].type).toBe('order');
  }));

  it('does not combine a leverage update and order into one operation', () => {
    expect(() =>
      service.placeOrder(
        '0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d',
        {
          ...MARKET_IDENTITY,
          assetId: 3,
          isBuy: true,
          price: 100,
          size: '1.25',
          szDecimals: 2,
          maxLeverage: 20,
          leverage: 5,
          orderType: 'market',
          slippagePercent: 1.5,
          reduceOnly: false,
          isCross: false,
          currentLeverage: { type: 'isolated', value: 3 },
        }
      )
    ).toThrowError(PerpsLeverageChangeRequiredError);
    expect(http.post).not.toHaveBeenCalled();
  });

  it('places a reduce-only limit order without changing leverage', fakeAsync(() => {
    http.post.and.returnValue(
      of({ status: 'ok', response: { type: 'order' } }) as any
    );

    service
      .placeOrder(
        '0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d',
        {
          ...MARKET_IDENTITY,
          assetId: 1,
          isBuy: false,
          price: 123.456,
          size: '0.5',
          szDecimals: 3,
          maxLeverage: 20,
          leverage: 5,
          orderType: 'limit',
          slippagePercent: 1,
          reduceOnly: true,
          isCross: true,
        }
      )
      .subscribe();
    flushMicrotasks();

    expect(http.post).toHaveBeenCalledTimes(1);
    expect(http.post.calls.mostRecent().args[1].action.orders[0]).toEqual({
      a: 1,
      b: false,
      p: '123.46',
      s: '0.5',
      r: true,
      t: { limit: { tif: 'Gtc' } },
      c: MARKET_IDENTITY.cloid,
    });
  }));

  it('rounds the submitted size down to szDecimals', fakeAsync(() => {
    http.post.and.returnValue(
      of({ status: 'ok', response: { type: 'order' } }) as any
    );

    service
      .placeOrder(
        '0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d',
        {
          ...MARKET_IDENTITY,
          assetId: 1,
          isBuy: true,
          price: 100,
          size: '0.025599999999999999',
          szDecimals: 4,
          maxLeverage: 20,
          leverage: 5,
          orderType: 'limit',
          slippagePercent: 1,
          reduceOnly: true,
          isCross: true,
        }
      )
      .subscribe();
    flushMicrotasks();

    expect(http.post.calls.mostRecent().args[1].action.orders[0].s).toBe(
      '0.0255'
    );
  }));

  it('refuses a size that floors below the market lot', () => {
    expect(() =>
      service.placeOrder(
        '0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d',
        {
          ...MARKET_IDENTITY,
          assetId: 1,
          isBuy: true,
          price: 100,
          size: '0.0004',
          szDecimals: 3,
          maxLeverage: 20,
          leverage: 5,
          orderType: 'limit',
          slippagePercent: 1,
          reduceOnly: true,
          isCross: true,
        }
      )
    ).toThrowError('Order size is below the market lot size');
    expect(http.post).not.toHaveBeenCalled();
  });

  it('honours a slippage tolerance above the old 5% ceiling', fakeAsync(() => {
    http.post.and.returnValue(
      of({ status: 'ok', response: { type: 'order' } }) as any
    );

    service
      .placeOrder(
        '0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d',
        {
          ...MARKET_IDENTITY,
          assetId: 3,
          isBuy: true,
          price: 100,
          size: '1',
          szDecimals: 2,
          maxLeverage: 20,
          leverage: 5,
          orderType: 'market',
          slippagePercent: 8,
          reduceOnly: true,
          isCross: true,
        }
      )
      .subscribe();
    flushMicrotasks();

    expect(http.post.calls.mostRecent().args[1].action.orders[0].p).toBe('108');
  }));

  it('refreshes L2 and recomputes a reviewed USD market intent', fakeAsync(() => {
    const now = 1_700_000_000_000;
    spyOn(Date, 'now').and.returnValue(now);
    http.post.and.callFake(((_url: string, body: any) => {
      if (body.type === 'l2Book') {
        return of({
          coin: 'ETH',
          time: now,
          levels: [
            [{ px: '99', sz: '10' }],
            [{ px: '101', sz: '10' }],
          ],
        }) as any;
      }
      return of({ status: 'ok', response: { type: 'order' } }) as any;
    }) as any);

    service
      .placeOrder(
        '0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d',
        {
          ...MARKET_IDENTITY,
          assetId: 3,
          isBuy: true,
          price: '100',
          size: '9',
          notionalExact: '125',
          fullClose: false,
          szDecimals: 2,
          maxLeverage: 20,
          leverage: 5,
          orderType: 'market',
          slippagePercent: 1,
          reduceOnly: true,
          isCross: false,
        }
      )
      .subscribe();
    flushMicrotasks();

    const order = http.post.calls.mostRecent().args[1].action.orders[0];
    expect(order.s).toBe('1.25');
    expect(order.p).toBe('101');
    expect(order.c).toBe(MARKET_IDENTITY.cloid);
  }));

  it('refuses a stale L2 snapshot before signing a market order', fakeAsync(() => {
    const now = 1_700_000_000_000;
    spyOn(Date, 'now').and.returnValue(now);
    http.post.and.returnValue(
      of({
        coin: 'ETH',
        time: now - 10_001,
        levels: [
          [{ px: '99', sz: '10' }],
          [{ px: '101', sz: '10' }],
        ],
      }) as any
    );
    let failure: unknown;

    service
      .placeOrder(
        '0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d',
        {
          ...MARKET_IDENTITY,
          assetId: 3,
          isBuy: true,
          price: '100',
          size: '1',
          notionalExact: '100',
          fullClose: false,
          szDecimals: 2,
          maxLeverage: 20,
          leverage: 5,
          orderType: 'market',
          slippagePercent: 1,
          reduceOnly: true,
          isCross: false,
        }
      )
      .subscribe({ error: (error) => (failure = error) });
    flushMicrotasks();

    expect(failure).toEqual(jasmine.any(PerpsMarketDataUnavailableError));
    expect(http.post).toHaveBeenCalledTimes(1);
  }));

  it('distinguishes partial fills from complete fills', () => {
    const result = (service as any).parseOrderExecution(
      {
        status: 'ok',
        response: {
          type: 'order',
          data: {
            statuses: [
              { filled: { totalSz: '0.4', avgPx: '101.25', oid: '42' } },
            ],
          },
        },
      },
      '1',
      MARKET_IDENTITY.cloid
    );

    expect(result.status).toBe('partial');
    expect(result.filledSizeExact).toBe('0.4');
    expect(result.remainingSizeExact).toBe('0.6');
    expect(result.averagePriceExact).toBe('101.25');
  });

  it('returns unknown instead of retrying after a signed transport failure', fakeAsync(() => {
    http.post.and.returnValue(
      throwError(() => new Error('network timeout')) as any
    );
    let result: any;

    service
      .placeOrder(
        '0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d',
        {
          ...MARKET_IDENTITY,
          assetId: 3,
          isBuy: true,
          price: '100',
          size: '1',
          szDecimals: 2,
          maxLeverage: 20,
          leverage: 5,
          orderType: 'limit',
          slippagePercent: 1,
          reduceOnly: true,
          isCross: false,
        }
      )
      .subscribe((value) => (result = value));
    flushMicrotasks();

    expect(result.status).toBe('unknown');
    expect(result.cloid).toBe(MARKET_IDENTITY.cloid);
    expect(result.error).toBe('network timeout');
    expect(http.post).toHaveBeenCalledTimes(1);
  }));

  it('refreshes exact position size before signing a full close', fakeAsync(() => {
    const now = Date.now();
    spyOn(service, 'getOrderBook').and.returnValue(
      of({
        coin: 'ETH',
        time: now,
        bids: [{ priceExact: '99', sizeExact: '10', price: 99, size: 10 }],
        asks: [
          { priceExact: '101', sizeExact: '10', price: 101, size: 10 },
        ],
      })
    );
    spyOn(service, 'getAccount').and.returnValue(
      of({
        positions: [
          { key: 'hl:ETH', coin: 'ETH', sziExact: '0.75', szi: 0.75 },
        ],
      } as any)
    );
    http.post.and.returnValue(
      of({ status: 'ok', response: { type: 'order' } }) as any
    );

    service
      .placeOrder(
        '0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d',
        {
          ...MARKET_IDENTITY,
          assetId: 3,
          isBuy: false,
          price: '100',
          size: '1',
          fullClose: true,
          szDecimals: 2,
          maxLeverage: 20,
          leverage: 5,
          orderType: 'market',
          slippagePercent: 1,
          reduceOnly: true,
          isCross: false,
        }
      )
      .subscribe();
    flushMicrotasks();

    expect(service.getAccount).toHaveBeenCalledWith(
      '0x70997970C51812dc3A010C7d01b50e0d17dc79C8',
      true
    );
    expect(http.post.calls.mostRecent().args[1].action.orders[0].s).toBe(
      '0.75'
    );
  }));

  it('submits P plus N for an explicit net reverse', fakeAsync(() => {
    const now = Date.now();
    spyOn(service, 'getOrderBook').and.returnValue(
      of({
        coin: 'ETH',
        time: now,
        bids: [{ priceExact: '99', sizeExact: '10', price: 99, size: 10 }],
        asks: [
          { priceExact: '101', sizeExact: '10', price: 101, size: 10 },
        ],
      })
    );
    spyOn(service, 'getAccount').and.returnValue(
      of({
        positions: [
          {
            key: 'hl:ETH',
            coin: 'ETH',
            sziExact: '-0.75',
            szi: -0.75,
            leverageType: 'isolated',
          },
        ],
      } as any)
    );
    http.post.and.returnValue(
      of({ status: 'ok', response: { type: 'order' } }) as any
    );

    service
      .placeOrder(
        '0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d',
        {
          ...MARKET_IDENTITY,
          intent: 'reverse',
          assetId: 3,
          isBuy: true,
          price: '100',
          size: '1.25',
          notionalExact: '125',
          fullClose: false,
          szDecimals: 2,
          maxLeverage: 20,
          leverage: 5,
          orderType: 'market',
          slippagePercent: 1,
          reduceOnly: false,
          isCross: false,
          currentLeverage: { type: 'isolated', value: 5 },
        }
      )
      .subscribe();
    flushMicrotasks();

    expect(http.post.calls.mostRecent().args[1].action.orders[0].s).toBe('2');
    expect(http.post.calls.mostRecent().args[1].action.orders[0].r).toBeFalse();
  }));

  it('never rounds an IOC buy above its maximum slippage price', fakeAsync(() => {
    http.post.and.returnValue(
      of({ status: 'ok', response: { type: 'order' } }) as any
    );
    const mid = 1925.57;
    const slippagePercent = 0.1;

    service
      .placeOrder(
        '0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d',
        {
          ...MARKET_IDENTITY,
          assetId: 3,
          isBuy: true,
          price: mid,
          size: '0.01',
          szDecimals: 4,
          maxLeverage: 20,
          leverage: 5,
          orderType: 'market',
          slippagePercent,
          reduceOnly: true,
          isCross: false,
        }
      )
      .subscribe();
    flushMicrotasks();

    const wirePrice = Number(
      http.post.calls.mostRecent().args[1].action.orders[0].p
    );
    expect(wirePrice).toBeLessThanOrEqual(
      mid * (1 + slippagePercent / 100)
    );
  }));

  it('never rounds an IOC sell below its minimum slippage price', fakeAsync(() => {
    http.post.and.returnValue(
      of({ status: 'ok', response: { type: 'order' } }) as any
    );
    const mid = 1925.68;
    const slippagePercent = 0.1;

    service
      .placeOrder(
        '0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d',
        {
          ...MARKET_IDENTITY,
          assetId: 3,
          isBuy: false,
          price: mid,
          size: '0.01',
          szDecimals: 4,
          maxLeverage: 20,
          leverage: 5,
          orderType: 'market',
          slippagePercent,
          reduceOnly: true,
          isCross: false,
        }
      )
      .subscribe();
    flushMicrotasks();

    const wirePrice = Number(
      http.post.calls.mostRecent().args[1].action.orders[0].p
    );
    expect(wirePrice).toBeGreaterThanOrEqual(
      mid * (1 - slippagePercent / 100)
    );
  }));

  it('never rounds a limit buy above the price the user typed', fakeAsync(() => {
    http.post.and.returnValue(
      of({ status: 'ok', response: { type: 'order' } }) as any
    );
    // Five significant figures leave two decimals here, so 9.87654321 has to
    // land on 9.87 rather than the nearer 9.88.
    const limitPrice = 9.87654321;

    service
      .placeOrder(
        '0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d',
        {
          ...MARKET_IDENTITY,
          assetId: 3,
          isBuy: true,
          price: limitPrice,
          size: '1',
          szDecimals: 4,
          maxLeverage: 20,
          leverage: 5,
          orderType: 'limit',
          slippagePercent: 3,
          reduceOnly: true,
          isCross: false,
        }
      )
      .subscribe();
    flushMicrotasks();

    expect(http.post.calls.mostRecent().args[1].action.orders[0].p).toBe(
      '9.87'
    );
  }));

  it('never rounds a limit sell below the price the user typed', fakeAsync(() => {
    http.post.and.returnValue(
      of({ status: 'ok', response: { type: 'order' } }) as any
    );
    const limitPrice = 9.87104321;

    service
      .placeOrder(
        '0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d',
        {
          ...MARKET_IDENTITY,
          assetId: 3,
          isBuy: false,
          price: limitPrice,
          size: '1',
          szDecimals: 4,
          maxLeverage: 20,
          leverage: 5,
          orderType: 'limit',
          slippagePercent: 3,
          reduceOnly: true,
          isCross: false,
        }
      )
      .subscribe();
    flushMicrotasks();

    expect(http.post.calls.mostRecent().args[1].action.orders[0].p).toBe(
      '9.88'
    );
  }));

  it('refuses a price that floors below the market tick', () => {
    expect(() =>
      service.placeOrder(
        '0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d',
        {
          ...MARKET_IDENTITY,
          assetId: 3,
          isBuy: true,
          price: 0.0000004,
          size: '1',
          szDecimals: 1,
          maxLeverage: 20,
          leverage: 5,
          orderType: 'limit',
          slippagePercent: 3,
          reduceOnly: true,
          isCross: false,
        }
      )
    ).toThrowError(/tick size/);
  });

  it('clamps a tolerance beyond the configured ceiling', fakeAsync(() => {
    http.post.and.returnValue(
      of({ status: 'ok', response: { type: 'order' } }) as any
    );

    service
      .placeOrder(
        '0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d',
        {
          ...MARKET_IDENTITY,
          assetId: 3,
          isBuy: true,
          price: 100,
          size: '1',
          szDecimals: 2,
          maxLeverage: 20,
          leverage: 5,
          orderType: 'market',
          slippagePercent: 999,
          reduceOnly: true,
          isCross: true,
        }
      )
      .subscribe();
    flushMicrotasks();

    // Derived from the constant rather than pinned, so retuning the ceiling
    // does not turn this into a false failure. Compared numerically because the
    // wire value is rounded while the expectation carries float error.
    const ceiling = 100 * (1 + PERPS_MAX_SLIPPAGE_PERCENT / 100);
    expect(
      Number(http.post.calls.mostRecent().args[1].action.orders[0].p)
    ).toBeCloseTo(ceiling, 8);
  }));

  it('always writes leverage in isolated mode', fakeAsync(() => {
    http.post.and.returnValue(
      of({ status: 'ok', response: { type: 'default' } }) as any
    );

    service
      .updateLeverage(
        '0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d',
        7,
        2,
        3
      )
      .subscribe();
    flushMicrotasks();

    expect(http.post.calls.first().args[1].action).toEqual({
      type: 'updateLeverage',
      asset: 7,
      isCross: false,
      leverage: 2,
    });
  }));

  it('preserves isolated-only metadata in the market model', (done) => {
    http.post.and.returnValue(
      of([
        {
          universe: [
            {
              name: 'CASHCAT',
              szDecimals: 0,
              maxLeverage: 3,
              onlyIsolated: true,
            },
          ],
        },
        [
          {
            markPx: '1',
            oraclePx: '1',
            prevDayPx: '1',
            dayNtlVlm: '100',
            openInterest: '10',
            funding: '0',
          },
        ],
      ]) as any
    );

    service.getMarkets().subscribe((markets) => {
      expect(markets[0].onlyIsolated).toBeTrue();
      done();
    });
  });

  it('loads only supported HIP-3 markets with their protocol asset ids', (done) => {
    http.post.and.callFake(((_url: string, body: any) => {
      if (body.type === 'perpDexs') {
        return of([
          null,
          { name: 'unsupported-one' },
          { name: 'xyz' },
          { name: 'unsupported-two' },
        ]);
      }
      if (body.type === 'metaAndAssetCtxs' && body.dex === 'xyz') {
        return of([
          { universe: [{ name: 'NEO', szDecimals: 2, maxLeverage: 5 }] },
          [{ markPx: '10', midPx: '10', oraclePx: '10', prevDayPx: '9', dayNtlVlm: '100', openInterest: '2', funding: '0' }],
        ]);
      }
      return of([{ universe: [] }, []]);
    }) as any);

    service.getMarkets().subscribe((markets) => {
      const dexRequests = http.post.calls
        .allArgs()
        .map((args) => args[1])
        .filter((body) => body.type === 'metaAndAssetCtxs' && body.dex);
      expect(dexRequests).toEqual([
        { type: 'metaAndAssetCtxs', dex: 'xyz' },
      ]);
      expect(markets[0].coin).toBe('xyz:NEO');
      expect(markets[0].key).toBe('xyz:NEO');
      expect(markets[0].dex).toBe('xyz');
      // `xyz` remains at registry index 2 even though index 1 is unsupported.
      expect(markets[0].assetId).toBe(120000);
      done();
    });
  });

  it('uses websocket snapshots for fills without a duplicate REST request', () => {
    spyOn<any>(service, 'send');
    const updates = jasmine.createSpy('updates');

    service.watchUserFills('0xABC').subscribe(updates);

    expect(http.post).not.toHaveBeenCalled();
    (service as any).handleMessage({
      data: JSON.stringify({
        channel: 'userFills',
        data: { user: '0xabc', fills: [], isSnapshot: true },
      }),
    });
    expect(updates).toHaveBeenCalledWith({
      user: '0xabc',
      fills: [],
      isSnapshot: true,
    });
  });

  it('uses open-order websocket snapshots without refetching on updates', () => {
    spyOn<any>(service, 'send');
    const updates = jasmine.createSpy('updates');

    service.watchOpenOrders('0xABC').subscribe(updates);

    expect(http.post).not.toHaveBeenCalled();
    const orders = [{ oid: 42, coin: 'ETH' }];
    (service as any).handleMessage({
      data: JSON.stringify({
        channel: 'openOrders',
        data: { user: '0xabc', orders },
      }),
    });
    expect(updates).toHaveBeenCalledWith([{ oid: '42', coin: 'ETH' }]);
    expect(http.post).not.toHaveBeenCalled();
  });

  it('does not substitute mark price when a book side is empty', (done) => {
    http.post.and.returnValue(
      of([
        {
          universe: [
            { name: 'ETH', szDecimals: 4, maxLeverage: 25 },
            { name: 'CASHCAT', szDecimals: 0, maxLeverage: 3 },
          ],
        },
        [
          {
            markPx: '1900',
            midPx: '1899.5',
            oraclePx: '1900',
            prevDayPx: '1800',
            dayNtlVlm: '100',
            openInterest: '10',
            funding: '0',
          },
          {
            markPx: '1',
            // Hyperliquid reports a null mid whenever a side of the book is empty.
            midPx: null,
            oraclePx: '1',
            prevDayPx: '1',
            dayNtlVlm: '100',
            openInterest: '10',
            funding: '0',
          },
        ],
      ]) as any
    );

    service.getMarkets().subscribe((markets) => {
      const eth = markets.find((market) => market.coin === 'ETH');
      const cashcat = markets.find((market) => market.coin === 'CASHCAT');
      expect(eth.midPxExact).toBe('1899.5');
      // An absent mid is null, never zero: zero is a price, absence is not.
      expect(cashcat.midPxExact).toBeNull();
      // The 24h change follows the displayed mid, not the mark beside it.
      expect(Number(eth.changePercentExact)).toBeCloseTo(
        ((1899.5 - 1800) / 1800) * 100,
        8
      );
      // No mid means no change to quote — market statistics unavailable.
      expect(cashcat.changePercentExact).toBeNull();
      done();
    });
  });

  it('omits the builder fee when no builder address is configured', fakeAsync(() => {
    http.post.and.returnValue(
      of({ status: 'ok', response: { type: 'default' } }) as any
    );

    service
      .placeOrder(
        '0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d',
        {
          ...MARKET_IDENTITY,
          assetId: 3,
          isBuy: true,
          price: 100,
          size: '1',
          szDecimals: 2,
          maxLeverage: 20,
          leverage: 5,
          orderType: 'market',
          slippagePercent: 1,
          reduceOnly: true,
          isCross: false,
        }
      )
      .subscribe();
    flushMicrotasks();

    // No approval round-trip and no builder field: the order pays the exchange only.
    expect(http.post).toHaveBeenCalledTimes(1);
    expect(
      http.post.calls.mostRecent().args[1].action.builder
    ).toBeUndefined();
  }));

  // The address is the only switch: a configured builder always charges the
  // fee. Emptying `PERPS_BUILDER_ADDRESS` is what turns it off, so these cover
  // the on-state that the empty-address test above cannot reach.
  it('attaches a configured builder and approves the fee once per account', fakeAsync(() => {
    const builder = '0x000000000000000000000000000000000000beef';
    spyOnProperty(service, 'builderAddress', 'get').and.returnValue(builder);
    http.post.and.callFake(((_url: string, body: any) => {
      if (body.type === 'maxBuilderFee') {
        // Nothing approved yet.
        return of(0) as any;
      }
      return of({ status: 'ok', response: { type: 'default' } }) as any;
    }) as any);

    const request = {
      ...MARKET_IDENTITY,
      assetId: 3,
      isBuy: true,
      price: 100,
      size: '1',
      szDecimals: 2,
      maxLeverage: 20,
      leverage: 5,
      orderType: 'market' as const,
      slippagePercent: 1,
      reduceOnly: true,
      isCross: false,
    };
    const key =
      '0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d';

    service.placeOrder(key, request).subscribe();
    flushMicrotasks();

    const bodies = http.post.calls.allArgs().map((args) => args[1]);
    expect(bodies.length).toBe(3);
    expect(bodies[0].type).toBe('maxBuilderFee');
    expect(bodies[1].action.type).toBe('approveBuilderFee');
    expect(bodies[2].action.builder).toEqual({
      b: builder,
      f: PERPS_BUILDER_FEE_TENTHS_BPS,
    });

    // The approval is remembered for the session: the next order signs once.
    http.post.calls.reset();
    service.placeOrder(key, request).subscribe();
    flushMicrotasks();

    expect(http.post).toHaveBeenCalledTimes(1);
    expect(http.post.calls.mostRecent().args[1].action.builder).toEqual({
      b: builder,
      f: PERPS_BUILDER_FEE_TENTHS_BPS,
    });
  }));

  it('skips the approval when the account already authorised the fee', fakeAsync(() => {
    const builder = '0x000000000000000000000000000000000000beef';
    spyOnProperty(service, 'builderAddress', 'get').and.returnValue(builder);
    http.post.and.callFake(((_url: string, body: any) => {
      if (body.type === 'maxBuilderFee') {
        return of(PERPS_BUILDER_FEE_TENTHS_BPS) as any;
      }
      return of({ status: 'ok', response: { type: 'default' } }) as any;
    }) as any);

    service
      .placeOrder(
        '0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d',
        {
          ...MARKET_IDENTITY,
          assetId: 3,
          isBuy: true,
          price: 100,
          size: '1',
          szDecimals: 2,
          maxLeverage: 20,
          leverage: 5,
          orderType: 'market',
          slippagePercent: 1,
          reduceOnly: true,
          isCross: false,
        }
      )
      .subscribe();
    flushMicrotasks();

    const bodies = http.post.calls.allArgs().map((args) => args[1]);
    expect(bodies.length).toBe(2);
    expect(bodies[0].type).toBe('maxBuilderFee');
    expect(bodies[1].action.type).toBe('order');
    expect(bodies[1].action.builder).toEqual({
      b: builder,
      f: PERPS_BUILDER_FEE_TENTHS_BPS,
    });
  }));

  it('loads frontend open orders and cancels by asset and order id', fakeAsync(() => {
    http.post.and.callFake(((_url: string, body: any) => {
      if (body.type === 'frontendOpenOrders') {
        return of([
          {
            coin: 'ETH',
            oid: 42,
            side: 'B',
            limitPx: '1800',
            sz: '0.1',
            origSz: '0.2',
            timestamp: 1,
            orderType: 'Limit',
            reduceOnly: false,
          },
        ]);
      }
      return of({ status: 'ok', response: { type: 'default' } });
    }) as any);

    let orders;
    service.getOpenOrders('0xABC').subscribe((value) => (orders = value));
    expect(orders[0].oid).toBe('42');

    service
      .cancelOrder(
        '0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d',
        3,
        '42'
      )
      .subscribe();
    flushMicrotasks();

    expect(http.post.calls.mostRecent().args[1]).toContain(
      '"cancels":[{"a":3,"o":42}]'
    );
  }));

  it('preserves uint64 order and trade ids through websocket decoding', () => {
    spyOn<any>(service, 'send');
    const updates = jasmine.createSpy('updates');
    service.watchUserFills('0xABC').subscribe(updates);

    (service as any).handleMessage({
      data:
        '{"channel":"userFills","data":{"user":"0xabc","fills":' +
        '[{"oid":18446744073709551615,"tid":1125899906842623}]}}',
    });

    expect(updates).toHaveBeenCalledWith({
      user: '0xabc',
      fills: [
        { oid: '18446744073709551615', tid: '1125899906842623' },
      ],
    });
  });

  it('preserves uint64 ids in raw REST JSON before model conversion', () => {
    http.post.and.returnValue(
      of(
        '[{"coin":"ETH","oid":18446744073709551615,"side":"B",' +
          '"limitPx":"1800","sz":"0.1","origSz":"0.2",' +
          '"timestamp":1,"orderType":"Limit","reduceOnly":false}]'
      ) as any
    );

    let orders;
    service.getOpenOrders('0xABC').subscribe((value) => (orders = value));

    expect(orders[0].oid).toBe('18446744073709551615');
  });

  it('signs and submits a uint64 order id without a Number conversion', fakeAsync(() => {
    http.post.and.returnValue(
      of({ status: 'ok', response: { type: 'default' } }) as any
    );

    service
      .cancelOrder(
        '0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d',
        3,
        '18446744073709551615'
      )
      .subscribe();
    flushMicrotasks();

    expect(http.post.calls.mostRecent().args[1]).toContain(
      '"o":18446744073709551615'
    );
  }));

  it('rejects an order id above uint64 before signing', () => {
    expect(() =>
      service.cancelOrder(
        '0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d',
        3,
        '18446744073709551616'
      )
    ).toThrowError('Hyperliquid order id exceeds uint64');
  });

  it('preserves exact funding balances for MAX signatures', (done) => {
    http.post.and.callFake(((_url: string, body: any) => {
      switch (body.type) {
        case 'clearinghouseState':
          return of({
            marginSummary: {
              accountValue: '9007199254740993.000001',
              totalMarginUsed: '0',
              totalNtlPos: '0',
            },
            withdrawable: '9007199254740993.000001',
            assetPositions: [],
          });
        case 'spotClearinghouseState':
          return of({
            balances: [
              {
                coin: 'USDC',
                token: 0,
                total: '9007199254740993.000002',
                hold: '0.000001',
              },
            ],
          });
        case 'userAbstraction':
          return of('default');
        default:
          throw new Error(`Unexpected request: ${body.type}`);
      }
    }) as any);

    service.getAccount('0xABC').subscribe((account) => {
      expect(account.accountValueExact).toBe('9007199254740993.000001');
      expect(account.totalBalanceExact).toBe('9007199254740993.000001');
      expect(account.withdrawableExact).toBe('9007199254740993.000001');
      expect(account.availableBalanceExact).toBe('9007199254740993.000001');
      expect(account.spotUsdcExact).toBe('9007199254740993.000002');
      expect(account.spotUsdcHoldExact).toBe('0.000001');
      done();
    });
  });

  function mockAccountRequests(mode: string, hold: string) {
    http.post.and.callFake(((_url: string, body: any) => {
      switch (body.type) {
        case 'clearinghouseState':
          return of({
            marginSummary: {
              accountValue: '1.90',
              totalMarginUsed: '0.96',
              totalNtlPos: '19.215',
            },
            crossMaintenanceMarginUsed: '0.48',
            withdrawable: '0',
            assetPositions: [],
          });
        case 'spotClearinghouseState':
          return of({
            balances: [
              {
                coin: 'USDC',
                token: 0,
                total: '998.97',
                hold,
              },
            ],
          });
        case 'userAbstraction':
          return of(mode);
        default:
          throw new Error(`Unexpected request: ${body.type}`);
      }
    }) as any);
  }

  it('folds free spot USDC into a unified account without double-counting holds', (done) => {
    mockAccountRequests('unifiedAccount', '0.96');

    service.getAccount('0xABC').subscribe((account) => {
      expect(account.unified).toBeTrue();
      expect(account.totalBalanceExact).toBe('999.91');
      expect(account.availableBalanceExact).toBe('998.01');
      expect(account.withdrawableExact).toBe('0');
      expect(account.totalMarginUsedExact).toBe('0.96');
      expect(account.marginRatioExact).toBeNull();
      done();
    });
  });

  it('does not fold spot USDC into trading collateral for a standard account', (done) => {
    mockAccountRequests('disabled', '0');

    service.getAccount('0xABC').subscribe((account) => {
      expect(account.unified).toBeFalse();
      expect(account.totalBalanceExact).toBe('1.9');
      expect(account.availableBalanceExact).toBe('0');
      expect(account.spotUsdcExact).toBe('998.97');
      expect(Number(account.marginRatioExact)).toBeCloseTo(
        (0.48 / 1.9) * 100,
        8
      );
      expect(account.marginRatioExact).toMatch(/^25\.2631578947/);
      done();
    });
  });

  it('uses cross-margin equity for a standard account risk ratio', (done) => {
    http.post.and.callFake(((_url: string, body: any) => {
      if (body.type === 'clearinghouseState') {
        return of({
          marginSummary: {
            accountValue: '5',
            totalMarginUsed: '3',
            totalNtlPos: '30',
          },
          crossMarginSummary: {
            accountValue: '80',
          },
          crossMaintenanceMarginUsed: '2',
          withdrawable: '1',
          assetPositions: [],
        });
      }
      if (body.type === 'spotClearinghouseState') {
        return of({
          balances: [{ coin: 'USDC', token: 0, total: '100', hold: '3' }],
        });
      }
      return of('disabled');
    }) as any);

    service.getAccount('0xABC').subscribe((account) => {
      expect(account.marginRatioExact).toBe('2.5');
      done();
    });
  });

  it('routes spotState updates to the matching user only', () => {
    spyOn<any>(service, 'send');
    const first = jasmine.createSpy('first');
    const second = jasmine.createSpy('second');

    service.subscribe({ type: 'spotState', user: '0xaaa' }).subscribe(first);
    service.subscribe({ type: 'spotState', user: '0xbbb' }).subscribe(second);

    (service as any).handleMessage({
      data: JSON.stringify({
        channel: 'spotState',
        data: {
          user: '0xaaa',
          spotState: { balances: [] },
        },
      }),
    });

    expect(first).toHaveBeenCalled();
    expect(second).not.toHaveBeenCalled();
  });

  it('routes clearinghouseState updates to the matching user only', () => {
    spyOn<any>(service, 'send');
    const first = jasmine.createSpy('first');
    const second = jasmine.createSpy('second');

    service
      .subscribe({ type: 'clearinghouseState', user: '0xaaa' })
      .subscribe(first);
    service
      .subscribe({ type: 'clearinghouseState', user: '0xbbb' })
      .subscribe(second);

    (service as any).handleMessage({
      data: JSON.stringify({
        channel: 'clearinghouseState',
        data: {
          user: '0xaaa',
          clearinghouseState: { marginSummary: {} },
        },
      }),
    });

    expect(first).toHaveBeenCalled();
    expect(second).not.toHaveBeenCalled();
  });

  it('loads and routes level-2 books by coin', (done) => {
    http.post.and.returnValue(
      of({
        coin: 'ETH',
        time: 123,
        levels: [
          [{ px: '99', sz: '2', n: 1 }],
          [{ px: '101', sz: '3', n: 1 }],
        ],
      }) as any
    );

    service.getOrderBook('ETH').subscribe((book) => {
      expect(book.bids).toEqual([
        { price: 99, size: 2, priceExact: '99', sizeExact: '2' },
      ]);
      expect(book.asks).toEqual([
        { price: 101, size: 3, priceExact: '101', sizeExact: '3' },
      ]);

      spyOn<any>(service, 'send');
      const eth = jasmine.createSpy('eth');
      const btc = jasmine.createSpy('btc');
      service.subscribe({ type: 'l2Book', coin: 'ETH' }).subscribe(eth);
      service.subscribe({ type: 'l2Book', coin: 'BTC' }).subscribe(btc);
      (service as any).handleMessage({
        data: JSON.stringify({
          channel: 'l2Book',
          data: { coin: 'ETH', time: 124, levels: [[], []] },
        }),
      });

      expect(eth).toHaveBeenCalled();
      expect(btc).not.toHaveBeenCalled();
      done();
    });
  });

  it('loads and normalizes directional active asset availability', (done) => {
    http.post.and.returnValue(
      of({
        user: '0xAbC',
        coin: 'ETH',
        leverage: { type: 'cross', value: 2 },
        maxTradeSzs: ['0.5323', '0.5223'],
        availableToTrade: ['1008.75', '989.78'],
        markPx: '1895',
      }) as any
    );

    service.getActiveAssetData('0xABC', 'ETH').subscribe((data) => {
      expect(http.post.calls.mostRecent().args[1]).toEqual({
        type: 'activeAssetData',
        user: '0xabc',
        coin: 'ETH',
      });
      expect(data.maxTradeSzs).toEqual(['0.5323', '0.5223']);
      expect(data.availableToTrade).toEqual(['1008.75', '989.78']);
      expect(data.markPx).toBe(1895);
      done();
    });
  });

  it('routes activeAssetData updates by user and coin', () => {
    spyOn<any>(service, 'send');
    const eth = jasmine.createSpy('eth');
    const btc = jasmine.createSpy('btc');

    service
      .subscribe({ type: 'activeAssetData', user: '0xaaa', coin: 'ETH' })
      .subscribe(eth);
    service
      .subscribe({ type: 'activeAssetData', user: '0xaaa', coin: 'BTC' })
      .subscribe(btc);

    (service as any).handleMessage({
      data: JSON.stringify({
        channel: 'activeAssetData',
        data: {
          user: '0xAaA',
          coin: 'ETH',
          availableToTrade: ['100', '80'],
        },
      }),
    });

    expect(eth).toHaveBeenCalled();
    expect(btc).not.toHaveBeenCalled();
  });

  it('routes allDexsAssetCtxs market updates', () => {
    spyOn<any>(service, 'send');
    const listener = jasmine.createSpy('listener');

    service.subscribe({ type: 'allDexsAssetCtxs' }).subscribe(listener);
    (service as any).handleMessage({
      data: JSON.stringify({
        channel: 'allDexsAssetCtxs',
        data: { ctxs: [['', []]] },
      }),
    });

    expect(listener).toHaveBeenCalledWith({ ctxs: [['', []]] });
  });

  it('starts and stops the websocket heartbeat with the socket lifecycle', fakeAsync(() => {
    const send = jasmine.createSpy('send');
    const socket: any = {
      readyState: WebSocket.OPEN,
      send,
      close: jasmine.createSpy('close'),
    };
    (service as any).ws = socket;

    (service as any).startHeartbeat(socket);
    tick(30000);
    expect(send).toHaveBeenCalledWith(JSON.stringify({ method: 'ping' }));

    (service as any).stopHeartbeat();
    send.calls.reset();
    tick(30000);
    expect(send).not.toHaveBeenCalled();
  }));

  it('merges spotState updates without another info request', (done) => {
    mockAccountRequests('unifiedAccount', '0.96');

    service.getAccount('0xABC').subscribe((account) => {
      const updated = service.updateAccountFromSpotState(account, {
        user: '0xabc',
        spotState: {
          balances: [
            { coin: 'USDC', token: 0, total: '1200', hold: '2' },
          ],
        },
      });

      expect(updated.totalBalanceExact).toBe('1199.9');
      expect(updated.availableBalanceExact).toBe('1198');
      expect(http.post).toHaveBeenCalledTimes(3);
      done();
    });
  });

  it('merges clearinghouseState updates without another info request', (done) => {
    mockAccountRequests('unifiedAccount', '0.96');

    service.getAccount('0xABC').subscribe((account) => {
      const updated = service.updateAccountFromClearinghouseState(account, {
        user: '0xabc',
        clearinghouseState: {
          marginSummary: {
            accountValue: '5',
            totalMarginUsed: '2',
            totalNtlPos: '20',
          },
          withdrawable: '3',
          assetPositions: [],
        },
      });

      expect(updated.accountValueExact).toBe('5');
      expect(updated.totalMarginUsedExact).toBe('2');
      expect(updated.spotUsdcExact).toBe('998.97');
      expect(http.post).toHaveBeenCalledTimes(3);
      done();
    });
  });

  it('shares repeated account snapshots for the same user', () => {
    mockAccountRequests('unifiedAccount', '0.96');

    service.getAccount('0xABC').subscribe();
    service.getAccount('0xabc').subscribe();

    expect(http.post).toHaveBeenCalledTimes(3);
  });

  it('refreshes only clearinghouseState after the account cache expires', fakeAsync(() => {
    mockAccountRequests('unifiedAccount', '0.96');

    service.getAccount('0xABC').subscribe();
    tick(3001);
    service.getAccount('0xABC').subscribe();

    const requestTypes = http.post.calls
      .allArgs()
      .map((args) => args[1].type);
    expect(requestTypes).toEqual([
      'clearinghouseState',
      'spotClearinghouseState',
      'userAbstraction',
      'clearinghouseState',
    ]);
  }));

  it('keeps websocket spotState data on the next account refresh', fakeAsync(() => {
    mockAccountRequests('unifiedAccount', '0.96');
    let account;

    service.getAccount('0xABC').subscribe((value) => (account = value));
    account = service.updateAccountFromSpotState(account, {
      user: '0xabc',
      spotState: {
        balances: [
          { coin: 'USDC', token: 0, total: '1200', hold: '2' },
        ],
      },
    });
    tick(3001);
    service.getAccount('0xABC').subscribe((value) => (account = value));

    expect(account.totalBalanceExact).toBe('1199.9');
    expect(http.post).toHaveBeenCalledTimes(4);
  }));

  it('shares repeated market snapshots', () => {
    http.post.and.returnValue(of([{ universe: [] }, []]) as any);

    service.getMarkets().subscribe();
    service.getMarkets().subscribe();

    expect(
      http.post.calls
        .allArgs()
        .filter((args) => args[1].type === 'metaAndAssetCtxs').length
    ).toBe(1);
  });

  describe('cross-DEX aggregation', () => {
    const snapshot = (
      dex: string,
      overrides: Partial<PerpsAccount> = {}
    ): PerpsAccount => ({
      unified: false,
      abstractionMode: 'disabled',
      dex,
      accountValueExact: '0',
      totalBalanceExact: '0',
      totalMarginUsedExact: '0',
      totalNtlPosExact: '0',
      marginRatioExact: null,
      withdrawableExact: '0',
      availableBalanceExact: '0',
      spotUsdcExact: '0',
      spotUsdcHoldExact: '0',
      positions: [],
      ...overrides,
    });

    it('sums balances at protocol precision', () => {
      const aggregate = service.aggregateAccounts([
        snapshot('', {
          accountValueExact: '0.1',
          totalBalanceExact: '0.1',
          totalMarginUsedExact: '0.07',
        }),
        snapshot('xyz', {
          accountValueExact: '0.2',
          totalBalanceExact: '0.2',
          totalMarginUsedExact: '0.14',
        }),
      ]);

      // 0.1 + 0.2 through a float is 0.30000000000000004.
      expect(aggregate.totalBalanceExact).toBe('0.3');
      expect(aggregate.totalMarginUsedExact).toBe('0.21');
    });

    it('reports the riskiest pool ratio, never a ratio of the sums', () => {
      const aggregate = service.aggregateAccounts([
        snapshot('', {
          accountValueExact: '1000',
          totalMarginUsedExact: '10',
          marginRatioExact: '1',
        }),
        snapshot('xyz', {
          accountValueExact: '10',
          totalMarginUsedExact: '9',
          marginRatioExact: '90',
        }),
      ]);

      // Summing would read as ~1.9% and hide a pool about to be liquidated.
      expect(aggregate.marginRatioExact).toBe('90');
      expect(aggregate.marginRatioDex).toBe('xyz');
    });

    it('counts the account-wide spot wallet once', () => {
      const aggregate = service.aggregateAccounts([
        snapshot('', { spotUsdcExact: '500', spotUsdcHoldExact: '20' }),
        snapshot('xyz'),
      ]);

      expect(aggregate.spotUsdcExact).toBe('500');
      expect(aggregate.spotUsdcHoldExact).toBe('20');
    });

    it('keeps each position on its own DEX and records what is missing', () => {
      const aggregate = service.aggregateAccounts(
        [
          snapshot('', {
            positions: [{ key: 'hl:ETH', dex: '', coin: 'ETH' } as any],
          }),
          snapshot('xyz', {
            positions: [
              { key: 'xyz:IWM', dex: 'xyz', coin: 'xyz:IWM' } as any,
            ],
          }),
        ],
        ['broken']
      );

      expect(aggregate.positions.map((p) => p.key)).toEqual([
        'hl:ETH',
        'xyz:IWM',
      ]);
      expect(aggregate.missingDexes).toEqual(['broken']);
    });

    it('routes a clearinghouse frame to the DEX that sent it', () => {
      const aggregate = service.aggregateAccounts([
        snapshot('', { accountValueExact: '100' }),
        snapshot('xyz', { accountValueExact: '5' }),
      ]);

      const updated = service.updateAggregatedFromClearinghouseState(
        aggregate,
        {
          user: '0xabc',
          dex: 'xyz',
          clearinghouseState: {
            marginSummary: {
              accountValue: '7',
              totalMarginUsed: '0',
              totalNtlPos: '0',
            },
            withdrawable: '7',
            assetPositions: [],
          },
        }
      );

      const canonical = updated.byDex.find((item) => item.dex === '');
      const xyz = updated.byDex.find((item) => item.dex === 'xyz');
      expect(canonical.accountValueExact).toBe('100');
      expect(xyz.accountValueExact).toBe('7');
      expect(updated.accountValueExact).toBe('107');
    });
  });

  it('merges a dex context frame by universe index, not list position', () => {
    // The list is volume-sorted, so a market's position in it says nothing
    // about which context belongs to it; only `dexAssetIndex` does.
    const markets: any[] = [
      { key: 'hl:SECOND', dex: '', dexAssetIndex: 1, coin: 'SECOND' },
      { key: 'hl:FIRST', dex: '', dexAssetIndex: 0, coin: 'FIRST' },
      { key: 'xyz:OTHER', dex: 'xyz', dexAssetIndex: 0, coin: 'xyz:OTHER' },
    ];
    const other = markets[2];

    const updated = service.mergeDexAssetContexts(markets, '', [
      {
        markPx: '10',
        midPx: '10',
        oraclePx: '11',
        prevDayPx: '8',
        dayNtlVlm: '100',
        openInterest: '2',
        funding: '0.001',
      },
      {
        markPx: '20',
        midPx: '20',
        oraclePx: '21',
        prevDayPx: '10',
        dayNtlVlm: '200',
        openInterest: '3',
        funding: '0.002',
      },
    ] as any);

    const first = updated.find((market) => market.coin === 'FIRST');
    const second = updated.find((market) => market.coin === 'SECOND');
    expect(first.markPxExact).toBe('10');
    expect(first.openInterestExact).toBe('20');
    expect(second.markPxExact).toBe('20');
    expect(second.openInterestExact).toBe('60');
    // A price update must not reorder the list under the user's finger.
    expect(updated.map((market) => market.coin)).toEqual([
      'SECOND',
      'FIRST',
      'xyz:OTHER',
    ]);
    // Another DEX's markets are not even re-created, so `trackBy` sees no churn.
    expect(updated[2]).toBe(other);
  });

  it('leaves markets untouched when a frame has no context for them', () => {
    const markets: any[] = [
      { key: 'hl:ONLY', dex: '', dexAssetIndex: 7, coin: 'ONLY' },
    ];

    expect(service.mergeDexAssetContexts(markets, '', [] as any)).toBe(markets);
    expect(service.mergeDexAssetContexts(markets, 'xyz', [{}] as any)[0]).toBe(
      markets[0]
    );
  });

  it('refreshes the market REST snapshot after its TTL', fakeAsync(() => {
    http.post.and.returnValue(of([{ universe: [] }, []]) as any);

    service.getMarkets().subscribe();
    tick(15001);
    service.getMarkets().subscribe();

    expect(
      http.post.calls
        .allArgs()
        .filter((args) => args[1].type === 'metaAndAssetCtxs').length
    ).toBe(2);
  }));

  it('reuses the DEX registry across market snapshot refreshes', fakeAsync(() => {
    http.post.and.callFake(((_url: string, body: any) =>
      body.type === 'perpDexs'
        ? of([null, { name: 'xyz' }])
        : of([{ universe: [] }, []])) as any);

    service.getMarkets().subscribe();
    tick(15001);
    service.getMarkets().subscribe();

    const types = http.post.calls.allArgs().map((args) => args[1].type);
    expect(types.filter((type) => type === 'perpDexs').length).toBe(1);
    expect(types.filter((type) => type === 'metaAndAssetCtxs').length).toBe(4);
  }));

  it('does not keep a failed DEX registry in the long-lived cache', fakeAsync(() => {
    let registryAttempts = 0;
    http.post.and.callFake(((_url: string, body: any) => {
      if (body.type === 'perpDexs') {
        registryAttempts += 1;
        return registryAttempts === 1
          ? throwError(() => new Error('temporary'))
          : of([null, { name: 'xyz' }]);
      }
      return of([{ universe: [] }, []]);
    }) as any);
    const dexRequests = () =>
      http.post.calls
        .allArgs()
        .filter((args) => args[1].type === 'metaAndAssetCtxs' && args[1].dex)
        .length;

    service.getMarkets().subscribe();
    // A registry this refresh could not read leaves canonical markets alone.
    expect(dexRequests()).toBe(0);

    tick(15001);
    service.getMarkets().subscribe();

    expect(registryAttempts).toBe(2);
    expect(dexRequests()).toBe(1);
  }));

  it('waits longer before retrying a rate-limited market snapshot', fakeAsync(() => {
    http.post.and.returnValue(throwError(() => ({ status: 429 })) as any);
    (service as any).marketObservers = 1;
    (service as any).marketState$.next([]);
    const attempts = () =>
      http.post.calls
        .allArgs()
        .filter((args) => args[1].type === 'metaAndAssetCtxs').length;

    (service as any).loadMarketSnapshot();
    expect(attempts()).toBe(1);

    // The plain 1s backoff would already have spent another request by here.
    tick(9999);
    expect(attempts()).toBe(1);
    tick(2);
    expect(attempts()).toBe(2);

    clearTimeout((service as any).marketSnapshotRetryTimer);
  }));

  it('does not keep a failed spot snapshot in the long-lived cache', fakeAsync(() => {
    let spotAttempts = 0;
    http.post.and.callFake(((_url: string, body: any) => {
      if (body.type === 'clearinghouseState') {
        return of({
          marginSummary: {
            accountValue: '1',
            totalMarginUsed: '0',
            totalNtlPos: '0',
          },
          withdrawable: '1',
          assetPositions: [],
        });
      }
      if (body.type === 'spotClearinghouseState') {
        spotAttempts += 1;
        return spotAttempts === 1
          ? throwError(() => new Error('temporary'))
          : of({
              balances: [
                { coin: 'USDC', token: 0, total: '10', hold: '0' },
              ],
            });
      }
      return of('unifiedAccount');
    }) as any);

    service.getAccount('0xABC').subscribe();
    tick(3001);
    let account;
    service.getAccount('0xABC').subscribe((value) => (account = value));

    expect(spotAttempts).toBe(2);
    expect(account.spotUsdcExact).toBe('10');
  }));

  it('does not keep a failed account mode in the 30-minute cache', fakeAsync(() => {
    let modeAttempts = 0;
    http.post.and.callFake(((_url: string, body: any) => {
      if (body.type === 'clearinghouseState') {
        return of({
          marginSummary: {
            accountValue: '1',
            totalMarginUsed: '0',
            totalNtlPos: '0',
          },
          withdrawable: '1',
          assetPositions: [],
        });
      }
      if (body.type === 'spotClearinghouseState') {
        return of({
          balances: [{ coin: 'USDC', token: 0, total: '10', hold: '0' }],
        });
      }
      modeAttempts += 1;
      return modeAttempts === 1
        ? throwError(() => new Error('temporary'))
        : of('unifiedAccount');
    }) as any);

    service.getAccount('0xABC').subscribe();
    tick(3001);
    let account;
    service.getAccount('0xABC').subscribe((value) => (account = value));

    expect(modeAttempts).toBe(2);
    expect(account.unified).toBeTrue();
  }));

  it('does not turn a clearinghouse failure into a zero-balance account', (done) => {
    http.post.and.callFake(((_url: string, body: any) => {
      if (body.type === 'clearinghouseState') {
        return throwError(() => new Error('account unavailable'));
      }
      if (body.type === 'spotClearinghouseState') {
        return of({ balances: [] });
      }
      return of('default');
    }) as any);

    service.getAccount('0xABC').subscribe({
      next: () => fail('expected the account request to fail'),
      error: (error) => {
        expect(error.message).toBe('account unavailable');
        done();
      },
    });
  });

  it('keeps a shared websocket channel until its last observer leaves', () => {
    spyOn<any>(service, 'send');
    spyOn<any>(service, 'closeSocket');

    const first = service.subscribe({ type: 'allMids' }).subscribe();
    const second = service.subscribe({ type: 'allMids' }).subscribe();

    expect((service as any).activeSubs.size).toBe(1);
    first.unsubscribe();
    expect((service as any).activeSubs.size).toBe(1);
    second.unsubscribe();
    expect((service as any).activeSubs.size).toBe(0);
  });

});

describe('HyperliquidService withdrawals', () => {
  const PRIVATE_KEY =
    '0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d';
  const SIGNER = new ethers.Wallet(PRIVATE_KEY).address;
  let http: jasmine.SpyObj<HttpClient>;
  let service: HyperliquidService;

  const exchangeOk = { status: 'ok', response: { type: 'default' } };

  const sourceDexOfLastAction = () =>
    http.post.calls.mostRecent().args[1].action.sourceDex;

  beforeEach(() => {
    http = jasmine.createSpyObj<HttpClient>('HttpClient', ['post']);
    service = new HyperliquidService(http);
  });

  it('debits spot for a unified account, where that account keeps its USDC', fakeAsync(() => {
    http.post.and.callFake((_url: string, body: any) =>
      body?.type === 'userAbstraction'
        ? (of('unifiedAccount') as any)
        : (of(exchangeOk) as any)
    );

    service.withdraw(PRIVATE_KEY, SIGNER, '12.3').subscribe();
    flushMicrotasks();

    expect(http.post.calls.first().args[1]).toEqual({
      type: 'userAbstraction',
      user: SIGNER.toLowerCase(),
    });
    // The perps clearinghouse reports 0 for this account however funded it is,
    // so a perps-sourced withdrawal is a withdrawal of nothing.
    expect(sourceDexOfLastAction()).toBe('spot');
  }));

  it('debits perps for a standard account, whose spot is a separate wallet', fakeAsync(() => {
    http.post.and.callFake((_url: string, body: any) =>
      body?.type === 'userAbstraction'
        ? (of('default') as any)
        : (of(exchangeOk) as any)
    );

    service.withdraw(PRIVATE_KEY, SIGNER, '12.3').subscribe();
    flushMicrotasks();

    expect(sourceDexOfLastAction()).toBe('');
  }));

  it('falls back to perps when the account mode cannot be read', fakeAsync(() => {
    http.post.and.callFake((_url: string, body: any) =>
      body?.type === 'userAbstraction'
        ? (throwError(() => new Error('mode unavailable')) as any)
        : (of(exchangeOk) as any)
    );

    service.withdraw(PRIVATE_KEY, SIGNER, '12.3').subscribe();
    flushMicrotasks();

    // Guessing costs a rejection either way — the exchange refuses a debit the
    // balance cannot cover — and this is the guess that cannot move money from
    // a balance the user did not mean.
    expect(sourceDexOfLastAction()).toBe('');
  }));
});

describe('isExchangeAnswer', () => {
  // The two ways a write can not succeed are not the same fact. One says
  // nothing ran; the other says nobody knows.
  it('counts anything thrown while reading a response as an answer', () => {
    expect(isExchangeAnswer(new Error('Insufficient balance'))).toBeTrue();
  });

  it('counts a refusal the exchange issued as an answer', () => {
    expect(
      isExchangeAnswer(new HttpErrorResponse({ status: 422 }))
    ).toBeTrue();
  });

  it('does not claim to know the result when the reply was lost', () => {
    expect(isExchangeAnswer(new HttpErrorResponse({ status: 0 }))).toBeFalse();
    expect(isExchangeAnswer(new HttpErrorResponse({ status: 502 }))).toBeFalse();
    expect(isExchangeAnswer(new HttpErrorResponse({ status: 500 }))).toBeFalse();
  });
});
