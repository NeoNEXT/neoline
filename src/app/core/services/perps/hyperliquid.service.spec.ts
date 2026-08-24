import { HttpClient } from '@angular/common/http';
import { fakeAsync, flushMicrotasks, tick } from '@angular/core/testing';
import { ethers } from 'ethers';
import { of, Subject, throwError } from 'rxjs';

import {
  PerpsAccount,
  PerpsCandle,
  PERPS_BUILDER_FEE_TENTHS_BPS,
  PERPS_CANDLE_LIMIT,
  PERPS_MAX_SLIPPAGE_PERCENT,
  PerpsUserFeeRates,
} from '@popup/_lib/perps';
import { HttpErrorResponse } from '@angular/common/http';
import {
  HyperliquidService,
  isExchangeAnswer,
  isTransientFetchFailure,
  PerpsLeverageChangeRequiredError,
  resolvePerpsTestnet,
} from './hyperliquid.service';

/** One closed minute, at whatever time the test needs it to have closed. */
const candleAt = (t: number): PerpsCandle => ({
  t,
  T: t + 59_999,
  s: 'ETH',
  i: '1m',
  o: '90',
  c: '100',
  h: '105',
  l: '85',
  v: '2',
  n: 10,
});

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

  it('loads both user fee sides and caches them by address', () => {
    http.post.and.returnValue(
      of({
        userCrossRate: '0.0004',
        userAddRate: '0.0001',
        activeReferralDiscount: '0.04',
      }) as any
    );
    const rates: PerpsUserFeeRates[] = [];

    service.getUserFeeRates('0xABC').subscribe((rate) => rates.push(rate));
    service.getUserFeeRates('0xabc').subscribe((rate) => rates.push(rate));

    expect(rates.map((rate) => rate.takerRate)).toEqual([
      0.000384, 0.000384,
    ]);
    expect(rates.map((rate) => rate.makerRate)).toEqual([0.000096, 0.000096]);
    expect(http.post).toHaveBeenCalledTimes(1);
    expect(http.post).toHaveBeenCalledWith(
      jasmine.any(String),
      { type: 'userFees', user: '0xabc' },
      jasmine.any(Object)
    );
  });

  /**
   * A rebate tier pays the account for resting liquidity. The referral discount
   * reduces what is paid, so it must not also shrink what is paid back.
   */
  it('keeps a negative maker rate whole', () => {
    http.post.and.returnValue(
      of({
        userCrossRate: '0.0004',
        userAddRate: '-0.00002',
        activeReferralDiscount: '0.04',
      }) as any
    );
    let rates: PerpsUserFeeRates;

    service.getUserFeeRates('0xabc').subscribe((value) => (rates = value));

    expect(rates.makerRate).toBe(-0.00002);
  });

  it('does not cache an invalid user fee response', () => {
    http.post.and.returnValues(
      of({ userCrossRate: 'invalid', userAddRate: '0.00015' }) as any,
      of({ userCrossRate: '0.00045', userAddRate: '0.00015' }) as any
    );
    const errors = jasmine.createSpy('errors');
    let recovered: PerpsUserFeeRates;

    service.getUserFeeRates('0xabc').subscribe({
      error: errors,
    });
    service
      .getUserFeeRates('0xabc')
      .subscribe((rates) => (recovered = rates));

    expect(errors).toHaveBeenCalled();
    expect(recovered.takerRate).toBe(0.00045);
    expect(http.post).toHaveBeenCalledTimes(2);
  });

  /** A response missing a side is not a zero-fee account. */
  it('rejects a fee response without a maker rate', () => {
    http.post.and.returnValue(of({ userCrossRate: '0.00045' }) as any);
    const errors = jasmine.createSpy('errors');

    service.getUserFeeRates('0xabc').subscribe({ error: errors });

    expect(errors).toHaveBeenCalled();
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
      throwError(
        () => new HttpErrorResponse({ status: 0, statusText: 'network timeout' })
      ) as any
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
    expect(result.error).toContain('Http failure response');
    expect(http.post).toHaveBeenCalledTimes(1);
  }));

  it('surfaces a definite exchange rejection instead of reporting unknown', fakeAsync(() => {
    const rejection = new HttpErrorResponse({
      status: 422,
      statusText: 'Unprocessable Entity',
    });
    http.post.and.returnValue(throwError(() => rejection) as any);
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
          szDecimals: 2,
          maxLeverage: 20,
          leverage: 5,
          orderType: 'limit',
          slippagePercent: 1,
          reduceOnly: true,
          isCross: false,
        }
      )
      .subscribe({ error: (error) => (failure = error) });
    flushMicrotasks();

    expect(failure).toBe(rejection);
  }));

  it('refreshes exact position size before signing a full close', fakeAsync(() => {
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
      true,
      ''
    );
    expect(http.post.calls.mostRecent().args[1].action.orders[0].s).toBe(
      '0.75'
    );
  }));

  it('submits P plus N for an explicit net reverse', fakeAsync(() => {
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

  it('preserves the current margin-mode metadata in the market model', (done) => {
    http.post.and.returnValue(
      of([
        {
          universe: [
            {
              name: 'CASHCAT',
              szDecimals: 0,
              maxLeverage: 3,
              marginMode: 'strictIsolated',
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
      expect(markets[0].marginMode).toBe('strictIsolated');
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
    spyOnProperty(service, 'enabledDexes', 'get').and.returnValue(['', 'xyz']);
    const updates = jasmine.createSpy('updates');

    service.watchOpenOrders('0xABC').subscribe(updates);

    expect(http.post).not.toHaveBeenCalled();
    const orders = [{ oid: 42, coin: 'ETH' }];
    (service as any).handleMessage({
      data: JSON.stringify({
        channel: 'openOrders',
        data: { user: '0xabc', dex: '', orders },
      }),
    });
    expect(updates).not.toHaveBeenCalled();
    (service as any).handleMessage({
      data: JSON.stringify({
        channel: 'openOrders',
        data: {
          user: '0xabc',
          dex: 'xyz',
          orders: [{ oid: 43, coin: 'xyz:NEO' }],
        },
      }),
    });
    expect(updates).toHaveBeenCalledWith([
      { oid: '42', coin: 'ETH' },
      { oid: '43', coin: 'xyz:NEO' },
    ]);
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
    spyOnProperty(service, 'enabledDexes', 'get').and.returnValue(['', 'xyz']);
    http.post.and.callFake(((_url: string, body: any) => {
      if (body.type === 'frontendOpenOrders') {
        return of(body.dex === '' ? [
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
        ] : [{ coin: 'xyz:NEO', oid: 43 }]);
      }
      return of({ status: 'ok', response: { type: 'default' } });
    }) as any);

    let orders;
    service.getOpenOrders('0xABC').subscribe((value) => (orders = value));
    expect(orders[0].oid).toBe('42');
    expect(orders[1].oid).toBe('43');
    expect(
      http.post.calls
        .allArgs()
        .filter((args) => args[1].type === 'frontendOpenOrders')
        .map((args) => args[1].dex)
    ).toEqual(['', 'xyz']);

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
    spyOnProperty(service, 'enabledDexes', 'get').and.returnValue(['', 'xyz']);
    http.post.and.callFake(((_url: string, body: any) =>
      of(
        body.dex === ''
          ? '[{"coin":"ETH","oid":18446744073709551615,"side":"B",' +
              '"limitPx":"1800","sz":"0.1","origSz":"0.2",' +
              '"timestamp":1,"orderType":"Limit","reduceOnly":false}]'
          : '[]'
      )) as any);

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

  it('uses spot USDC as unified account equity without adding per-DEX equity', (done) => {
    mockAccountRequests('unifiedAccount', '0.96');

    service.getAccount('0xABC').subscribe((account) => {
      expect(account.unified).toBeTrue();
      expect(account.accountValueExact).toBe('998.97');
      expect(account.totalBalanceExact).toBe('998.97');
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

  /**
   * The order page's account feed. Named explicitly because a subscription to a
   * channel the protocol does not carry fails silently: the seed arrives, no
   * frame ever follows, and the page shows a stale account that looks live.
   */
  it('follows the account on the DEX it was asked about', () => {
    spyOn(service, 'getAccount').and.returnValue(
      of({ dex: 'xyz', positions: [], spotUsdcExact: '0' } as any)
    );
    const subscribeSpy = spyOn(service, 'subscribe').and.returnValue(
      new Subject<any>()
    );

    service.watchAccount('0xABC', 'xyz').subscribe();

    expect(subscribeSpy).toHaveBeenCalledWith({
      type: 'clearinghouseState',
      user: '0xabc',
      dex: 'xyz',
    });
  });

  it('applies account frames onto the seed as they arrive', () => {
    const frames = new Subject<any>();
    spyOn(service, 'getAccount').and.returnValue(
      of({ dex: '', positions: [], spotUsdcExact: '0' } as any)
    );
    spyOn(service, 'subscribe').and.returnValue(frames);
    const seen: any[] = [];

    service.watchAccount('0xabc').subscribe((account) => seen.push(account));
    frames.next({
      user: '0xabc',
      clearinghouseState: {
        marginSummary: { accountValue: '250', totalMarginUsed: '10' },
        assetPositions: [],
      },
    });

    // The seed, then the pushed state — one account, kept current.
    expect(seen.length).toBe(2);
    expect(seen[1].accountValueExact).toBe('250');
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

      expect(updated.accountValueExact).toBe('1200');
      expect(updated.totalBalanceExact).toBe('1200');
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

      expect(updated.accountValueExact).toBe('998.97');
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

    expect(account.totalBalanceExact).toBe('1200');
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

    it('does not sum per-DEX account values in unified mode', () => {
      const aggregate = service.aggregateAccounts([
        snapshot('', {
          unified: true,
          abstractionMode: 'unifiedAccount',
          accountValueExact: '100',
          totalBalanceExact: '100',
          availableBalanceExact: '80',
          spotUsdcExact: '500',
          spotUsdcHoldExact: '20',
        }),
        snapshot('xyz', {
          unified: true,
          abstractionMode: 'unifiedAccount',
          accountValueExact: '50',
          totalBalanceExact: '50',
          availableBalanceExact: '40',
          marginRatioExact: '90',
        }),
      ]);

      expect(aggregate.accountValueExact).toBe('500');
      expect(aggregate.totalBalanceExact).toBe('500');
      expect(aggregate.availableBalanceExact).toBe('480');
      expect(aggregate.withdrawableExact).toBe('480');
      expect(aggregate.marginRatioExact).toBeNull();
      expect(aggregate.marginRatioDex).toBeNull();
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

  it('keeps a shared websocket channel until its last observer leaves', fakeAsync(() => {
    spyOn<any>(service, 'send');
    spyOn<any>(service, 'closeSocket');

    const first = service.subscribe({ type: 'allMids' }).subscribe();
    const second = service.subscribe({ type: 'allMids' }).subscribe();

    expect((service as any).activeSubs.size).toBe(1);
    first.unsubscribe();
    expect((service as any).activeSubs.size).toBe(1);
    second.unsubscribe();
    // An abandoned channel is held a moment longer, in case whoever left is
    // on their way back.
    expect((service as any).activeSubs.size).toBe(1);
    tick(500);
    expect((service as any).activeSubs.size).toBe(0);
  }));

  it('picks an abandoned channel back up instead of redialing it', fakeAsync(() => {
    const send = spyOn<any>(service, 'send');
    spyOn<any>(service, 'closeSocket');
    const candles = { type: 'candle', coin: 'ETH', interval: '15m' };

    const first = service.subscribe(candles).subscribe();
    first.unsubscribe();
    tick(200);
    const second = service.subscribe(candles).subscribe();
    tick(1000);

    // Stepping off an interval and back is one subscription to the exchange,
    // never an unsubscribe and a re-subscribe for data that never stopped.
    expect(send).toHaveBeenCalledTimes(1);
    expect(send).toHaveBeenCalledWith({
      method: 'subscribe',
      subscription: candles,
    });
    expect((service as any).activeSubs.size).toBe(1);

    second.unsubscribe();
    tick(500);
  }));

  it('remembers candles for a market and interval while they are worth showing', () => {
    const candles = [candleAt(Date.now() - 60_000)];
    service.rememberCandles('ETH', '1m', candles);

    // Handed back as they were stored: this is what lets the chart paint
    // before the network has said anything.
    expect(service.cachedCandles('ETH', '1m')).toBe(candles);
  });

  it('refuses remembered candles that have gone too far out of date', () => {
    service.rememberCandles('ETH', '1m', [candleAt(Date.now() - 5 * 60_000)]);

    // Five missed minutes on a 1m chart is a visible hole. A spinner is the
    // more honest answer than bars that are quietly behind.
    expect(service.cachedCandles('ETH', '1m')).toBeNull();
  });

  it('keeps intervals of the same market apart', () => {
    service.rememberCandles('ETH', '1m', [candleAt(Date.now())]);

    expect(service.cachedCandles('ETH', '5m')).toBeNull();
  });

  it('bounds what it remembers across a long session', () => {
    const now = Date.now();
    for (let i = 0; i < 9; i++) {
      service.rememberCandles(`COIN${i}`, '1m', [candleAt(now)]);
    }

    expect((service as any).candleCache.size).toBe(8);
    // The market visited longest ago is the one dropped.
    expect(service.cachedCandles('COIN0', '1m')).toBeNull();
    expect(service.cachedCandles('COIN8', '1m')).not.toBeNull();
  });

  it('does not trim history inside a remembered dataset', () => {
    const now = Date.now();
    const candles = Array.from({ length: 1001 }, (_, index) =>
      candleAt(now - (1000 - index) * 60_000)
    );

    service.rememberCandles('ETH', '1m', candles);

    expect(service.cachedCandles('ETH', '1m')).toBe(candles);
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

  it('reads the same classification as whether a read is worth repeating', () => {
    // An answered refusal returns the same refusal a second later; rate
    // limiting is the case that costs something to re-ask.
    expect(
      isTransientFetchFailure(new HttpErrorResponse({ status: 429 }))
    ).toBeFalse();
    expect(
      isTransientFetchFailure(new HttpErrorResponse({ status: 422 }))
    ).toBeFalse();
    expect(isTransientFetchFailure(new Error('bad json'))).toBeFalse();
    expect(
      isTransientFetchFailure(new HttpErrorResponse({ status: 0 }))
    ).toBeTrue();
    expect(
      isTransientFetchFailure(new HttpErrorResponse({ status: 503 }))
    ).toBeTrue();
  });
});

describe('HyperliquidService market detail feed', () => {
  let http: jasmine.SpyObj<HttpClient>;
  let service: HyperliquidService;

  const universe = [
    { name: 'BTC', szDecimals: 5, maxLeverage: 40 },
    { name: 'ETH', szDecimals: 4, maxLeverage: 25 },
    { name: 'OLD', szDecimals: 2, maxLeverage: 3, isDelisted: true },
  ];

  const ctx = (midPx: string | null, markPx = '1875.7') => ({
    funding: '0.0000125',
    openInterest: '10',
    prevDayPx: '1900',
    dayNtlVlm: '1000',
    markPx,
    midPx,
    oraclePx: '1876',
  });

  const contexts = [ctx('63000', '63001'), ctx('1875.75'), ctx('1', '1')];

  function answerWith(reply: (body: any) => any) {
    http.post.and.callFake(
      (_url: string, body: any) => of(reply(body)) as any
    );
  }

  function bodies(): any[] {
    return http.post.calls.allArgs().map(([, body]) => body);
  }

  beforeEach(() => {
    http = jasmine.createSpyObj<HttpClient>('HttpClient', ['post']);
    service = new HyperliquidService(http);
    spyOn<any>(service, 'send');
  });

  it('seeds from one DEX and then follows that market\'s own frames', () => {
    answerWith(() => [{ universe }, contexts]);
    const seen: any[] = [];

    service.watchMarketDetail('ETH').subscribe((market) => seen.push(market));

    expect(seen.length).toBe(1);
    expect(seen[0].coin).toBe('ETH');
    expect(seen[0].assetId).toBe(1);
    expect(seen[0].midPxExact).toBe('1875.75');
    // A canonical market is index 0 by definition, so the DEX registry — and
    // every other DEX's context array — is never requested.
    expect(bodies().length).toBe(1);
    expect(bodies()[0]).toEqual({ type: 'metaAndAssetCtxs' });

    (service as any).handleMessage({
      data: JSON.stringify({
        channel: 'activeAssetCtx',
        data: { coin: 'ETH', ctx: ctx('1880.5', '1880') },
      }),
    });

    expect(seen.length).toBe(2);
    expect(seen[1].midPxExact).toBe('1880.5');
    expect(seen[1].markPxExact).toBe('1880');
    // Static metadata is not re-derived from a context frame.
    expect(seen[1].szDecimals).toBe(4);
    expect(seen[1].maxLeverage).toBe(25);
    expect(seen[1].assetId).toBe(1);
  });

  it('routes a HIP-3 coin to its own DEX and asset-id space', () => {
    answerWith((body) =>
      body.type === 'perpDexs'
        ? [null, { name: 'xyz' }]
        : [{ universe: [{ name: 'SNDK', szDecimals: 2, maxLeverage: 5 }] }, [ctx('12.5')]]
    );
    const seen: any[] = [];

    service.watchMarketDetail('xyz:SNDK').subscribe((m) => seen.push(m));

    expect(seen[0].coin).toBe('xyz:SNDK');
    expect(seen[0].symbol).toBe('SNDK');
    expect(seen[0].dex).toBe('xyz');
    expect(seen[0].assetId).toBe(110000);
    expect(bodies()).toContain({ type: 'metaAndAssetCtxs', dex: 'xyz' });
  });

  it('answers null — not an error — for a coin this build does not carry', () => {
    answerWith(() => [{ universe }, contexts]);
    const seen: any[] = [];
    const failed = jasmine.createSpy('failed');

    service.watchMarketDetail('NOPE').subscribe((m) => seen.push(m), failed);
    service.watchMarketDetail('OLD').subscribe((m) => seen.push(m), failed);
    // An unenabled HIP-3 DEX never reaches the network at all.
    service.watchMarketDetail('other:THING').subscribe((m) => seen.push(m), failed);

    expect(seen).toEqual([null, null, null]);
    expect(failed).not.toHaveBeenCalled();
  });

  it('does not repeat a refusal the exchange did answer', fakeAsync(() => {
    http.post.and.returnValue(
      throwError(() => new HttpErrorResponse({ status: 429 })) as any
    );
    const failed = jasmine.createSpy('failed');

    service.watchMarketDetail('ETH').subscribe({ error: failed });
    tick(5000);

    // Rate limiting is a reply. Asking the identical question a second later
    // returns the identical answer and spends another slot out of a budget
    // that refills over the following minute.
    expect(http.post).toHaveBeenCalledTimes(1);
    expect(failed).toHaveBeenCalled();
  }));

  it('repeats a snapshot the exchange never answered', fakeAsync(() => {
    let attempts = 0;
    http.post.and.callFake(
      () =>
        (attempts++ === 0
          ? throwError(() => new HttpErrorResponse({ status: 503 }))
          : of([{ universe }, contexts])) as any
    );
    const seen: any[] = [];

    service.watchMarketDetail('ETH').subscribe((market) => seen.push(market));
    tick(1000);

    // The page has nothing at all without this snapshot, and a connection that
    // dropped on the way in decided nothing about whether the market exists.
    expect(attempts).toBe(2);
    expect(seen[0].coin).toBe('ETH');
  }));

  it('spends a bounded budget and then lets the failure stand', fakeAsync(() => {
    http.post.and.returnValue(
      throwError(() => new HttpErrorResponse({ status: 500 })) as any
    );
    const failed = jasmine.createSpy('failed');

    service.watchMarketDetail('ETH').subscribe({ error: failed });
    tick(30_000);

    // One attempt plus three evenly spaced retries, and nothing left running
    // afterwards — `fakeAsync` fails on a timer that outlives the test, so a
    // standing backoff cannot creep back in unnoticed.
    expect(http.post).toHaveBeenCalledTimes(4);
    expect(failed).toHaveBeenCalled();
  }));

  it('quotes the 24h amount and percent from the same two prices', () => {
    answerWith(() => [{ universe }, contexts]);
    const seen: any[] = [];
    service.watchMarketDetail('ETH').subscribe((m) => seen.push(m));

    // mid 1875.75 against prevDayPx 1900.
    expect(seen[0].changeAmountExact).toBe('-24.25');
    expect(seen[0].changePercentExact).toBe('-1.276315789473684211');
  });

  it('has no 24h change to quote when the book reports no mid', () => {
    answerWith(() => [
      { universe },
      [contexts[0], ctx(null), contexts[2]],
    ]);
    const seen: any[] = [];
    service.watchMarketDetail('ETH').subscribe((m) => seen.push(m));

    // Market statistics unavailable: the mark is a different price kind from
    // prevDayPx, so there is no honest comparison to make — and `null` is not
    // the same claim as `0`.
    expect(seen[0].midPxExact).toBeNull();
    expect(seen[0].changeAmountExact).toBeNull();
    expect(seen[0].changePercentExact).toBeNull();
  });

  it('ignores a frame that carries no context', () => {
    answerWith(() => [{ universe }, contexts]);
    const seen: any[] = [];
    service.watchMarketDetail('ETH').subscribe((m) => seen.push(m));

    (service as any).handleMessage({
      data: JSON.stringify({
        channel: 'activeAssetCtx',
        data: { coin: 'ETH' },
      }),
    });

    expect(seen.length).toBe(1);
  });
});

describe('HyperliquidService candle intervals', () => {
  const service = new HyperliquidService(null);

  it('sizes every interval the product offers', () => {
    expect(service.intervalMs('1m')).toBe(60e3);
    expect(service.intervalMs('5m')).toBe(5 * 60e3);
    expect(service.intervalMs('15m')).toBe(15 * 60e3);
    expect(service.intervalMs('1h')).toBe(3600e3);
    expect(service.intervalMs('12h')).toBe(12 * 3600e3);
    expect(service.intervalMs('1d')).toBe(86400e3);
    // Weekly and monthly used to fall through to a one-minute window, which
    // asked for two hours of history and drew an empty chart.
    expect(service.intervalMs('1w')).toBe(7 * 86400e3);
    expect(service.intervalMs('1M')).toBe(30 * 86400e3);
  });

  it('keeps the month and the minute apart', () => {
    expect(service.intervalMs('1M')).not.toBe(service.intervalMs('1m'));
  });

  it('refuses an interval it cannot size rather than guessing minutes', () => {
    expect(() => service.intervalMs('1y' as any)).toThrowError(
      /Unsupported Hyperliquid candle interval/
    );
  });
});

describe('HyperliquidService candle snapshots', () => {
  it('requests an explicit candle range without deriving it from a limit', () => {
    const http = jasmine.createSpyObj<HttpClient>('HttpClient', ['post']);
    http.post.and.returnValue(of([]) as any);
    const service = new HyperliquidService(http);

    (service as any)
      .getCandleRange('NEO', '15m', 1_000, 9_000)
      .subscribe();

    expect(http.post).toHaveBeenCalledWith(
      jasmine.any(String),
      {
        type: 'candleSnapshot',
        req: {
          coin: 'NEO',
          interval: '15m',
          startTime: 1_000,
          endTime: 9_000,
        },
      },
      jasmine.any(Object)
    );
  });

  it('pages a window that ends at the oldest bar already on screen', () => {
    const http = jasmine.createSpyObj<HttpClient>('HttpClient', ['post']);
    http.post.and.returnValue(of([]) as any);
    const service = new HyperliquidService(http);
    const endTime = 1_700_000_000_000;

    service.getCandles('NEO', '15m', PERPS_CANDLE_LIMIT, endTime).subscribe();

    expect(http.post).toHaveBeenCalledWith(
      jasmine.any(String),
      {
        type: 'candleSnapshot',
        req: {
          coin: 'NEO',
          interval: '15m',
          startTime: endTime - 15 * 60e3 * PERPS_CANDLE_LIMIT,
          endTime,
        },
      },
      jasmine.any(Object)
    );
  });
});

describe('HyperliquidService candle websocket routing', () => {
  it('routes every candle when the protocol sends an array', () => {
    const service = new HyperliquidService(null);
    spyOn<any>(service, 'send');
    const seen: PerpsCandle[] = [];
    service
      .subscribe({ type: 'candle', coin: 'ETH', interval: '1m' })
      .subscribe((candle) => seen.push(candle));
    const first = candleAt(1_000);
    const second = candleAt(61_000);

    (service as any).handleMessage({
      data: JSON.stringify({ channel: 'candle', data: [first, second] }),
    });

    expect(seen).toEqual([first, second]);
  });
});
