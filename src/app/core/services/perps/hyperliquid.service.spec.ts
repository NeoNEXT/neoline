import { HttpClient } from '@angular/common/http';
import { fakeAsync, flushMicrotasks, tick } from '@angular/core/testing';
import { ethers } from 'ethers';
import { of, Subject, throwError } from 'rxjs';

import {
  PerpsAccount,
  PerpsCandle,
  PERPS_BUILDER_FEE_TENTHS_BPS,
  PerpsUserFeeRates,
} from '@popup/_lib/perps';
import { HttpErrorResponse } from '@angular/common/http';
import {
  HyperliquidService,
} from './hyperliquid.service';
import { PerpsOrder } from './perps-trade-order';
import { keyOfSubscription } from './perps-channel-identity';

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

const PRIVATE_KEY =
  '0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d';
const ORDER: PerpsOrder = {
  assetId: 3,
  isBuy: true,
  priceExact: '101.5',
  sizeExact: '1.25',
  reduceOnly: false,
  timeInForce: 'Ioc',
  cloid: MARKET_IDENTITY.cloid,
};

/**
 * The 数据通道（Data Channel） as this service uses it.
 *
 * Frames are delivered exactly as the channel would deliver them — already
 * addressed, already protocol-precision — so a test states the frame the
 * service actually sees rather than the JSON text that produced it.
 */
function fakeChannel() {
  const channels = new Map<string, Subject<any>>();
  const open = (subscription: any) => {
    const key = keyOfSubscription(subscription);
    let channel = channels.get(key);
    if (!channel) {
      channel = new Subject<any>();
      channels.set(key, channel);
    }
    return channel;
  };
  return {
    subscribe: (subscription: any) => open(subscription).asObservable(),
    watchConnectionState: () => new Subject<any>().asObservable(),
    /** Deliver one frame to whoever subscribed to this channel. */
    push: (subscription: any, data: any) => open(subscription).next(data),
  } as any;
}

describe('HyperliquidService accounts, fees and writes', () => {
  let http: jasmine.SpyObj<HttpClient>;
  let service: HyperliquidService;
  let channel: any;

  beforeEach(() => {
    http = jasmine.createSpyObj<HttpClient>('HttpClient', ['post']);
    channel = fakeChannel();
    service = new HyperliquidService(http, channel);
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

  it('serializes a normalized order without reinterpreting its intent', fakeAsync(() => {
    http.post.and.returnValue(
      of({ status: 'ok', response: { type: 'order' } }) as any
    );

    service.submitOrder(PRIVATE_KEY, ORDER).subscribe();
    flushMicrotasks();

    expect(http.post.calls.mostRecent().args[1].action.orders[0]).toEqual({
      a: 3,
      b: true,
      p: '101.5',
      s: '1.25',
      r: false,
      t: { limit: { tif: 'Ioc' } },
      c: MARKET_IDENTITY.cloid,
    });
    expect(http.post.calls.mostRecent().args[1].action.builder).toBeUndefined();
  }));

  it('interprets partial fills through the adapter interface', fakeAsync(() => {
    http.post.and.returnValue(
      of({
        status: 'ok',
        response: {
          type: 'order',
          data: {
            statuses: [
              { filled: { totalSz: '0.4', avgPx: '101.25', oid: '42' } },
            ],
          },
        },
      }) as any
    );
    let result: any;

    service
      .submitOrder(PRIVATE_KEY, { ...ORDER, sizeExact: '1' })
      .subscribe((value) => (result = value));
    flushMicrotasks();

    expect(result.status).toBe('partial');
    expect(result.filledSizeExact).toBe('0.4');
    expect(result.remainingSizeExact).toBe('0.6');
    expect(result.averagePriceExact).toBe('101.25');
  }));

  it('returns unknown without retrying a signed transport failure', fakeAsync(() => {
    http.post.and.returnValue(
      throwError(
        () => new HttpErrorResponse({ status: 0, statusText: 'network timeout' })
      ) as any
    );
    let result: any;

    service
      .submitOrder(PRIVATE_KEY, ORDER)
      .subscribe((value) => (result = value));
    flushMicrotasks();

    expect(result.status).toBe('unknown');
    expect(result.cloid).toBe(ORDER.cloid);
    expect(result.submittedSizeExact).toBe(ORDER.sizeExact);
    expect(http.post).toHaveBeenCalledTimes(1);
  }));

  it('surfaces a definite exchange rejection', fakeAsync(() => {
    const rejection = new HttpErrorResponse({
      status: 422,
      statusText: 'Unprocessable Entity',
    });
    http.post.and.returnValue(throwError(() => rejection) as any);
    let failure: unknown;

    service
      .submitOrder(PRIVATE_KEY, ORDER)
      .subscribe({ error: (error) => (failure = error) });
    flushMicrotasks();

    expect(failure).toBe(rejection);
  }));

  it('approves a configured builder once and attaches it to orders', fakeAsync(() => {
    const builder = '0x000000000000000000000000000000000000beef';
    spyOnProperty(service, 'builderAddress', 'get').and.returnValue(builder);
    http.post.and.callFake(((_url: string, body: any) => {
      if (body.type === 'maxBuilderFee') {
        return of(0) as any;
      }
      return of({ status: 'ok', response: { type: 'default' } }) as any;
    }) as any);

    service.submitOrder(PRIVATE_KEY, ORDER).subscribe();
    flushMicrotasks();

    const bodies = http.post.calls.allArgs().map((args) => args[1]);
    expect(bodies).toHaveSize(3);
    expect(bodies[0].type).toBe('maxBuilderFee');
    expect(bodies[1].action.type).toBe('approveBuilderFee');
    expect(bodies[2].action.builder).toEqual({
      b: builder,
      f: PERPS_BUILDER_FEE_TENTHS_BPS,
    });

    http.post.calls.reset();
    service.submitOrder(PRIVATE_KEY, ORDER).subscribe();
    flushMicrotasks();

    expect(http.post).toHaveBeenCalledTimes(1);
    expect(http.post.calls.mostRecent().args[1].action.builder).toEqual({
      b: builder,
      f: PERPS_BUILDER_FEE_TENTHS_BPS,
    });
  }));

  it('skips approval when the account already authorized the builder fee', fakeAsync(() => {
    const builder = '0x000000000000000000000000000000000000beef';
    spyOnProperty(service, 'builderAddress', 'get').and.returnValue(builder);
    http.post.and.callFake(((_url: string, body: any) => {
      if (body.type === 'maxBuilderFee') {
        return of(PERPS_BUILDER_FEE_TENTHS_BPS) as any;
      }
      return of({ status: 'ok', response: { type: 'default' } }) as any;
    }) as any);

    service.submitOrder(PRIVATE_KEY, ORDER).subscribe();
    flushMicrotasks();

    const bodies = http.post.calls.allArgs().map((args) => args[1]);
    expect(bodies).toHaveSize(2);
    expect(bodies[0].type).toBe('maxBuilderFee');
    expect(bodies[1].action.type).toBe('order');
    expect(bodies[1].action.builder).toEqual({
      b: builder,
      f: PERPS_BUILDER_FEE_TENTHS_BPS,
    });
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

  it('uses open-order websocket snapshots without refetching on updates', () => {
    spyOnProperty(service, 'enabledDexes', 'get').and.returnValue(['', 'xyz']);
    const updates = jasmine.createSpy('updates');

    service.watchOpenOrders('0xABC').subscribe(updates);

    expect(http.post).not.toHaveBeenCalled();
    channel.push(
      { type: 'openOrders', user: '0xabc', dex: '' },
      { user: '0xabc', dex: '', orders: [{ oid: '42', coin: 'ETH' }] }
    );
    // Every DEX has to answer before the combined book means anything.
    expect(updates).not.toHaveBeenCalled();
    channel.push(
      { type: 'openOrders', user: '0xabc', dex: 'xyz' },
      { user: '0xabc', dex: 'xyz', orders: [{ oid: '43', coin: 'xyz:NEO' }] }
    );
    expect(updates).toHaveBeenCalledWith([
      { oid: '42', coin: 'ETH' },
      { oid: '43', coin: 'xyz:NEO' },
    ]);
    expect(http.post).not.toHaveBeenCalled();
  });

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

  it('re-reads spot collateral for an authoritative account refresh', () => {
    mockAccountRequests('unifiedAccount', '0.96');

    service.getAccount('0xABC').subscribe();
    service.getAccount('0xabc', true).subscribe();

    const requestTypes = http.post.calls
      .allArgs()
      .map((args) => args[1].type);
    expect(requestTypes).toEqual([
      'clearinghouseState',
      'spotClearinghouseState',
      'userAbstraction',
      'clearinghouseState',
      'spotClearinghouseState',
    ]);
  });

  it('reuses the DEX registry far past a market snapshot refresh', fakeAsync(() => {
    http.post.and.returnValue(of([null, { name: 'xyz' }]) as any);

    service.getDexRegistry().subscribe();
    tick(15001);
    service.getDexRegistry().subscribe();

    // The registry carries no prices, so it outlives every market snapshot.
    expect(http.post).toHaveBeenCalledTimes(1);
  }));

  it('does not keep a failed DEX registry in the long-lived cache', fakeAsync(() => {
    let attempts = 0;
    http.post.and.callFake((() => {
      attempts += 1;
      return attempts === 1
        ? throwError(() => new Error('temporary'))
        : of([null, { name: 'xyz' }]);
    }) as any);

    service.getDexRegistry().subscribe({ error: () => undefined });
    tick(1);
    service.getDexRegistry().subscribe();

    // A six-hour cache must not be the place a one-off failure goes to live.
    expect(attempts).toBe(2);
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

});

describe('HyperliquidService withdrawals', () => {
  const PRIVATE_KEY =
    '0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d';
  const SIGNER = new ethers.Wallet(PRIVATE_KEY).address;
  let http: jasmine.SpyObj<HttpClient>;
  let service: HyperliquidService;
  let channel: any;

  const exchangeOk = { status: 'ok', response: { type: 'default' } };

  const sourceDexOfLastAction = () =>
    http.post.calls.mostRecent().args[1].action.sourceDex;

  beforeEach(() => {
    http = jasmine.createSpyObj<HttpClient>('HttpClient', ['post']);
    channel = fakeChannel();
    service = new HyperliquidService(http, channel);
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

describe('HyperliquidService candle snapshots', () => {
  it('requests an explicit candle range without deriving it from a limit', () => {
    const http = jasmine.createSpyObj<HttpClient>('HttpClient', ['post']);
    http.post.and.returnValue(of([]) as any);
    const service = new HyperliquidService(http, fakeChannel());

    service.getCandleRange('NEO', '15m', 1_000, 9_000).subscribe();

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

});

