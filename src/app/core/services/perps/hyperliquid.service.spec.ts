import { HttpClient } from '@angular/common/http';
import { fakeAsync, tick } from '@angular/core/testing';
import { of, Subject, throwError } from 'rxjs';

import { PerpsUserFeeRates } from '@popup/_lib/perps';
import { HyperliquidService } from './hyperliquid.service';
import { fakePerpsDataChannel } from './perps-data-channel.fake';

/** 本服务所用的写入路径：只做一次声明，不发起调用。 */
const writes = () => ({ wrote: () => new Subject<void>() } as any);

describe('HyperliquidService accounts and fees', () => {
  let http: jasmine.SpyObj<HttpClient>;
  let service: HyperliquidService;
  let channel: any;

  beforeEach(() => {
    http = jasmine.createSpyObj<HttpClient>('HttpClient', ['post']);
    channel = fakePerpsDataChannel();
    service = new HyperliquidService(http, channel, writes());
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
   * 返佣档位是交易场所为挂单流动性付给账户的钱。推荐折扣减少的是账户「付出」的部分，
   * 因此不能连「收回」的部分也一起缩水。
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

  /** 缺了一侧的响应不等于零费率账户。 */
  it('rejects a fee response without a maker rate', () => {
    http.post.and.returnValue(of({ userCrossRate: '0.00045' }) as any);
    const errors = jasmine.createSpy('errors');

    service.getUserFeeRates('0xabc').subscribe({ error: errors });

    expect(errors).toHaveBeenCalled();
  });

  it('uses open-order websocket snapshots without refetching on updates', () => {
    spyOnProperty(service, 'enabledDexes', 'get').and.returnValue(['', 'xyz']);
    const updates = jasmine.createSpy('updates');

    service.watchOpenOrders('0xABC').subscribe(updates);

    expect(http.post).not.toHaveBeenCalled();
    channel.push(
      { type: 'openOrders', user: '0xabc', dex: '' },
      { user: '0xabc', dex: '', orders: [{ oid: '42', coin: 'ETH' }] }
    );
    // 每个 DEX 都答复之后，合并出来的账目才有意义。
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

  it('loads frontend open orders from every enabled DEX', fakeAsync(() => {
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

    // 注册表不携带价格，因此它比任何一份市场快照都活得久。
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

    // 六小时的缓存绝不能变成一次偶发失败的长期栖身之所。
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

describe('HyperliquidService candle snapshots', () => {
  it('requests an explicit candle range without deriving it from a limit', () => {
    const http = jasmine.createSpyObj<HttpClient>('HttpClient', ['post']);
    http.post.and.returnValue(of([]) as any);
    const service = new HyperliquidService(http, fakePerpsDataChannel(), writes());

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

