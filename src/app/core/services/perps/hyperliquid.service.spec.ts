import { HttpClient } from '@angular/common/http';
import { fakeAsync, flushMicrotasks, tick } from '@angular/core/testing';
import { of, Subject, throwError } from 'rxjs';

import { PERPS_MAX_SLIPPAGE_PERCENT } from '@popup/_lib/perps';
import {
  HyperliquidService,
  resolvePerpsTestnet,
} from './hyperliquid.service';

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

  it('updates leverage before placing an opening market order', fakeAsync(() => {
    http.post.and.returnValue(
      of({ status: 'ok', response: { type: 'default' } }) as any
    );

    service
      .placeOrder(
        '0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d',
        {
          assetId: 3,
          isBuy: true,
          price: 100,
          size: 1.25,
          szDecimals: 2,
          maxLeverage: 20,
          leverage: 5,
          orderType: 'market',
          slippagePercent: 1.5,
          reduceOnly: false,
          isCross: true,
        }
      )
      .subscribe();
    flushMicrotasks();

    const actions = http.post.calls.allArgs().map((args) => args[1].action);
    expect(actions[0]).toEqual({
      type: 'updateLeverage',
      asset: 3,
      isCross: true,
      leverage: 5,
    });
    expect(actions[1].orders[0]).toEqual({
      a: 3,
      b: true,
      p: '101.5',
      s: '1.25',
      r: false,
      t: { limit: { tif: 'Ioc' } },
    });
  }));

  it('places a reduce-only limit order without changing leverage', fakeAsync(() => {
    http.post.and.returnValue(
      of({ status: 'ok', response: { type: 'order' } }) as any
    );

    service
      .placeOrder(
        '0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d',
        {
          assetId: 1,
          isBuy: false,
          price: 123.456,
          size: 0.5,
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
    });
  }));

  it('honours a slippage tolerance above the old 5% ceiling', fakeAsync(() => {
    http.post.and.returnValue(
      of({ status: 'ok', response: { type: 'order' } }) as any
    );

    service
      .placeOrder(
        '0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d',
        {
          assetId: 3,
          isBuy: true,
          price: 100,
          size: 1,
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
          assetId: 3,
          isBuy: true,
          price: mid,
          size: 0.01,
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
          assetId: 3,
          isBuy: false,
          price: mid,
          size: 0.01,
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

  it('clamps a tolerance beyond the configured ceiling', fakeAsync(() => {
    http.post.and.returnValue(
      of({ status: 'ok', response: { type: 'order' } }) as any
    );

    service
      .placeOrder(
        '0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d',
        {
          assetId: 3,
          isBuy: true,
          price: 100,
          size: 1,
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

  it('uses isolated leverage for an isolated-only market', fakeAsync(() => {
    http.post.and.returnValue(
      of({ status: 'ok', response: { type: 'default' } }) as any
    );

    service
      .placeOrder(
        '0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d',
        {
          assetId: 7,
          isBuy: true,
          price: 1,
          size: 10,
          szDecimals: 0,
          maxLeverage: 3,
          leverage: 2,
          orderType: 'market',
          slippagePercent: 5,
          reduceOnly: false,
          isCross: false,
        }
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
          { name: 'neol' },
          { name: 'unsupported-two' },
        ]);
      }
      if (body.type === 'metaAndAssetCtxs' && body.dex === 'neol') {
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
        { type: 'metaAndAssetCtxs', dex: 'neol' },
      ]);
      expect(markets[0].coin).toBe('neol:NEO');
      expect(markets[0].dex).toBe('neol');
      // `neol` remains at registry index 2 even though index 1 is unsupported.
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
    expect(updates).toHaveBeenCalledWith(orders);
    expect(http.post).not.toHaveBeenCalled();
  });

  it('reads the mid price and falls back to the mark when the book is empty', (done) => {
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
      expect(eth.midPx).toBe(1899.5);
      expect(cashcat.midPx).toBe(1);
      // The 24h change follows the displayed mid, not the mark beside it.
      expect(eth.changePercent).toBeCloseTo(((1899.5 - 1800) / 1800) * 100, 8);
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
          assetId: 3,
          isBuy: true,
          price: 100,
          size: 1,
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

  it('omits a configured builder when the configured fee is zero', fakeAsync(() => {
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
      assetId: 3,
      isBuy: true,
      price: 100,
      size: 1,
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
    expect(bodies.length).toBe(1);
    expect(bodies[0].action.builder).toBeUndefined();

    // A disabled fee never needs an approval round trip.
    http.post.calls.reset();
    service.placeOrder(key, request).subscribe();
    flushMicrotasks();

    expect(http.post).toHaveBeenCalledTimes(1);
    expect(http.post.calls.mostRecent().args[1].action.builder).toBeUndefined();
  }));

  it('does not query approval state when the configured fee is zero', fakeAsync(() => {
    const builder = '0x000000000000000000000000000000000000beef';
    spyOnProperty(service, 'builderAddress', 'get').and.returnValue(builder);
    http.post.and.callFake(((_url: string, body: any) => {
      if (body.type === 'maxBuilderFee') {
        return of(45) as any;
      }
      return of({ status: 'ok', response: { type: 'default' } }) as any;
    }) as any);

    service
      .placeOrder(
        '0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d',
        {
          assetId: 3,
          isBuy: true,
          price: 100,
          size: 1,
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
    expect(bodies.length).toBe(1);
    expect(bodies[0].action.type).toBe('order');
    expect(bodies[0].action.builder).toBeUndefined();
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
    expect(orders[0].oid).toBe(42);

    service
      .cancelOrder(
        '0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d',
        3,
        42
      )
      .subscribe();
    flushMicrotasks();

    expect(http.post.calls.mostRecent().args[1].action).toEqual({
      type: 'cancel',
      cancels: [{ a: 3, o: 42 }],
    });
  }));

  it('signs a spot to perps USDC class transfer', fakeAsync(() => {
    http.post.and.returnValue(
      of({ status: 'ok', response: { type: 'default' } }) as any
    );

    service
      .transferUsdClass(
        '0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d',
        '12.5',
        true
      )
      .subscribe();
    flushMicrotasks();

    const action = http.post.calls.mostRecent().args[1].action;
    expect(action.type).toBe('usdClassTransfer');
    expect(action.amount).toBe('12.5');
    expect(action.toPerp).toBeTrue();
    expect(action.nonce).toBe(http.post.calls.mostRecent().args[1].nonce);
  }));

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
      expect(account.totalBalance).toBeCloseTo(999.91, 8);
      expect(account.availableBalance).toBeCloseTo(998.01, 8);
      expect(account.withdrawable).toBe(0);
      expect(account.totalMarginUsed).toBe(0.96);
      expect(account.marginRatio).toBeNull();
      done();
    });
  });

  it('does not fold spot USDC into trading collateral for a standard account', (done) => {
    mockAccountRequests('disabled', '0');

    service.getAccount('0xABC').subscribe((account) => {
      expect(account.unified).toBeFalse();
      expect(account.totalBalance).toBeCloseTo(1.9, 8);
      expect(account.availableBalance).toBe(0);
      expect(account.spotUsdc).toBeCloseTo(998.97, 8);
      expect(account.marginRatio).toBeCloseTo((0.48 / 1.9) * 100, 8);
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
      expect(account.marginRatio).toBe(2.5);
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
      expect(book.bids).toEqual([{ price: 99, size: 2 }]);
      expect(book.asks).toEqual([{ price: 101, size: 3 }]);

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
      expect(data.maxTradeSzs).toEqual([0.5323, 0.5223]);
      expect(data.availableToTrade).toEqual([1008.75, 989.78]);
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

      expect(updated.totalBalance).toBeCloseTo(1199.9, 8);
      expect(updated.availableBalance).toBe(1198);
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

      expect(updated.accountValue).toBe(5);
      expect(updated.totalMarginUsed).toBe(2);
      expect(updated.spotUsdc).toBeCloseTo(998.97, 8);
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

    expect(account.totalBalance).toBeCloseTo(1199.9, 8);
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

  it('uses assetId to merge main dex websocket market contexts', () => {
    const markets: any[] = [
      { assetId: 1, coin: 'SECOND', dayVolume: 0 },
      { assetId: 0, coin: 'FIRST', dayVolume: 0 },
    ];

    const updated = service.updateMarketsFromAssetContexts(markets, {
      ctxs: [
        [
          '',
          [
            {
              markPx: '10',
              oraclePx: '11',
              prevDayPx: '8',
              dayNtlVlm: '100',
              openInterest: '2',
              funding: '0.001',
            },
            {
              markPx: '20',
              oraclePx: '21',
              prevDayPx: '10',
              dayNtlVlm: '200',
              openInterest: '3',
              funding: '0.002',
            },
          ],
        ],
      ],
    });

    const first = updated.find((market) => market.coin === 'FIRST');
    const second = updated.find((market) => market.coin === 'SECOND');
    expect(first.markPx).toBe(10);
    expect(first.openInterest).toBe(20);
    expect(second.markPx).toBe(20);
    expect(second.openInterest).toBe(60);
    expect(updated[0].coin).toBe('SECOND');
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
        ? of([null, { name: 'neol' }])
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
          : of([null, { name: 'neol' }]);
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
    expect(account.spotUsdc).toBe(10);
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
