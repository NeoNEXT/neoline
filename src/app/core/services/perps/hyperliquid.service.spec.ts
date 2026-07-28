import { HttpClient } from '@angular/common/http';
import { fakeAsync, flushMicrotasks, tick } from '@angular/core/testing';
import { of, Subject, throwError } from 'rxjs';

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
      p: '105',
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
        12.5,
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

    expect(http.post).toHaveBeenCalledTimes(1);
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

    expect(http.post).toHaveBeenCalledTimes(2);
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
