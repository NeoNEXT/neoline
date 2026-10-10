import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { fakeAsync, flushMicrotasks } from '@angular/core/testing';
import { ethers } from 'ethers';
import { of, throwError } from 'rxjs';

import { PERPS_BUILDER_FEE_TENTHS_BPS } from '@popup/_lib/perps';
import { PerpsExchangeWriteService } from './perps-exchange-write.service';
import { PerpsOrder } from './perps-trade-order';

const PRIVATE_KEY =
  '0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d';
const SIGNER = new ethers.Wallet(PRIVATE_KEY).address;
const CLOID = '0x00000000000000000000000000000001';
const BUILDER = '0x000000000000000000000000000000000000beef';

const ORDER: PerpsOrder = {
  assetId: 3,
  isBuy: true,
  priceExact: '101.5',
  sizeExact: '1.25',
  reduceOnly: false,
  timeInForce: 'Ioc',
  cloid: CLOID,
};

const exchangeOk = { status: 'ok', response: { type: 'default' } };

describe('PerpsExchangeWriteService orders', () => {
  let http: jasmine.SpyObj<HttpClient>;
  let service: PerpsExchangeWriteService;

  const lastAction = () => http.post.calls.mostRecent().args[1].action;

  beforeEach(() => {
    http = jasmine.createSpyObj<HttpClient>('HttpClient', ['post']);
    service = new PerpsExchangeWriteService(http);
  });

  it('serializes a normalized order without reinterpreting its intent', fakeAsync(() => {
    http.post.and.returnValue(of({ status: 'ok', response: { type: 'order' } }) as any);

    service.submitOrder(PRIVATE_KEY, ORDER).subscribe();
    flushMicrotasks();

    expect(lastAction().orders[0]).toEqual({
      a: 3,
      b: true,
      p: '101.5',
      s: '1.25',
      r: false,
      t: { limit: { tif: 'Ioc' } },
      c: CLOID,
    });
    expect(lastAction().builder).toBeUndefined();
  }));

  for (const rejected of [false, true]) {
    it(`keeps the filled parent result when a protection child is ${rejected ? 'rejected' : 'accepted'}`, fakeAsync(() => {
      http.post.and.returnValue(of({ status: 'ok', response: { type: 'order', data: { statuses: [
        { filled: { totalSz: '1.25', avgPx: '100', oid: '1' } },
        rejected ? { error: 'Invalid trigger price' } : { resting: { oid: '2' } },
      ] } } }) as any);
      let result;
      service.submitOrder(PRIVATE_KEY, { ...ORDER, protection: [{
        kind: 'tp', triggerPriceExact: '120', priceExact: '108', sizeExact: '1.25',
        cloid: '0x00000000000000000000000000000002',
      }] }).subscribe((value) => result = value);
      flushMicrotasks();
      expect(lastAction().grouping).toBe('normalTpsl');
      expect(lastAction().orders[1]).toEqual({ a: 3, b: false, p: '108', s: '1.25', r: true,
        t: { trigger: { isMarket: true, triggerPx: '120', tpsl: 'tp' } }, c: '0x00000000000000000000000000000002',
      });
      expect(result.status).toBe('filled');
      expect(!!result.protectionError).toBe(rejected);
      expect(http.post).toHaveBeenCalledTimes(1);
    }));
  }

  for (const scenario of [
    { parentSize: '1.25', child: 'waitingForFill', unconfirmed: true },
    { parentSize: '1.25', child: 'waitingForTrigger', unconfirmed: false },
    { parentSize: '0.4', child: 'waitingForFill', unconfirmed: true },
  ]) {
    it(`preserves the parent fill and checks protection ${JSON.stringify(scenario)}`, fakeAsync(() => {
      http.post.and.returnValue(of({ status: 'ok', response: { type: 'order', data: { statuses: [
        { filled: { totalSz: scenario.parentSize, avgPx: '100', oid: '1' } }, scenario.child,
      ] } } }) as any);
      let result;
      service.submitOrder(PRIVATE_KEY, { ...ORDER, protection: [{
        kind: 'sl', triggerPriceExact: '80', priceExact: '72', sizeExact: '1.25',
        cloid: '0x00000000000000000000000000000002',
      }] }).subscribe((value) => result = value);
      flushMicrotasks();
      expect(result.status).toBe(scenario.parentSize === '1.25' ? 'filled' : 'partial');
      expect(!!result.protectionError).toBe(scenario.unconfirmed);
      expect(http.post).toHaveBeenCalledTimes(1);
    }));
  }

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

    service.submitOrder(PRIVATE_KEY, ORDER).subscribe((value) => (result = value));
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

  for (const body of [
    '{"status":',
    '<html>upstream error</html>',
    { status: 'ok', response: { type: 'order', data: {
      statuses: [{ filled: { totalSz: 'invalid', avgPx: '100', oid: '42' } }],
    } } },
    { status: 'ok', response: { type: 'order', data: {
      statuses: [{ resting: {} }],
    } } },
    { status: 'ok', response: { type: 'order', data: { statuses: [] } } },
    { status: 'ok', response: { type: 'order', data: {
      statuses: [{ filled: { totalSz: '1', avgPx: '100', oid: 'invalid' } }],
    } } },
  ]) {
    it(`keeps an undecidable order response unknown: ${JSON.stringify(body)}`, fakeAsync(() => {
      http.post.and.returnValue(of(body) as any);
      let result: any;
      let failure: any;
      service.submitOrder(PRIVATE_KEY, ORDER).subscribe({
        next: (value) => (result = value),
        error: (error) => (failure = error),
      });
      flushMicrotasks();
      expect(failure).toBeUndefined();
      expect(result?.status).toBe('unknown');
      expect(result?.cloid).toBe(CLOID);
      expect(http.post).toHaveBeenCalledTimes(1);
    }));
  }

  it('preserves the explicit top-level rejection reason', fakeAsync(() => {
    http.post.and.returnValue(of({ status: 'err', response: 'Invalid nonce' }) as any);
    let failure: any;
    service.submitOrder(PRIVATE_KEY, ORDER).subscribe({ error: (error) => (failure = error) });
    flushMicrotasks();
    expect(failure?.message).toBe('Invalid nonce');
    expect(http.post).toHaveBeenCalledTimes(1);
  }));

  it('queries an ambiguous order by cloid', () => {
    http.post.and.returnValue(
      of({
        status: 'order',
        order: { status: 'open', order: { oid: '9007199254740993' } },
      }) as any
    );
    let result: any;

    service.getOrderStatus('0xABC', CLOID).subscribe((value) => (result = value));

    expect(http.post).toHaveBeenCalledWith(
      jasmine.any(String),
      { type: 'orderStatus', user: '0xabc', oid: CLOID },
      jasmine.any(Object)
    );
    expect(result.status).toBe('order');
  });
});

describe('PerpsExchangeWriteService leverage and cancels', () => {
  let http: jasmine.SpyObj<HttpClient>;
  let service: PerpsExchangeWriteService;

  beforeEach(() => {
    http = jasmine.createSpyObj<HttpClient>('HttpClient', ['post']);
    service = new PerpsExchangeWriteService(http);
    http.post.and.returnValue(of(exchangeOk) as any);
  });

  it('updates leverage as an independent action', fakeAsync(() => {
    service.updateLeverage(PRIVATE_KEY, 3, 5, 20, 'isolated').subscribe();
    flushMicrotasks();

    expect(http.post.calls.mostRecent().args[1].action).toEqual({
      type: 'updateLeverage',
      asset: 3,
      isCross: false,
      leverage: 5,
    });
  }));

  it('writes cross margin and clamps leverage to the market maximum', fakeAsync(() => {
    service.updateLeverage(PRIVATE_KEY, 7, 5, 3, 'cross').subscribe();
    flushMicrotasks();

    expect(http.post.calls.first().args[1].action).toEqual({
      type: 'updateLeverage',
      asset: 7,
      isCross: true,
      leverage: 3,
    });
  }));

  it('cancels by asset and order id', fakeAsync(() => {
    service.cancelOrder(PRIVATE_KEY, 3, '42').subscribe();
    flushMicrotasks();

    expect(http.post.calls.mostRecent().args[1]).toContain(
      '"cancels":[{"a":3,"o":42}]'
    );
  }));

  it('signs and submits a uint64 order id without a Number conversion', fakeAsync(() => {
    service.cancelOrder(PRIVATE_KEY, 3, '18446744073709551615').subscribe();
    flushMicrotasks();

    expect(http.post.calls.mostRecent().args[1]).toContain(
      '"o":18446744073709551615'
    );
  }));

  it('rejects an order id above uint64 before signing', () => {
    expect(() =>
      service.cancelOrder(PRIVATE_KEY, 3, '18446744073709551616')
    ).toThrowError('Hyperliquid order id exceeds uint64');
  });
});

describe('PerpsExchangeWriteService builder fee', () => {
  let http: jasmine.SpyObj<HttpClient>;
  let service: PerpsExchangeWriteService;

  const bodies = () => http.post.calls.allArgs().map((args) => args[1]);
  const builderReply = (body: any, approved = 0) => of(
    body.type === 'userAbstraction' ? 'disabled' :
    body.type === 'clearinghouseState' ? { marginSummary: { accountValue: '100' } } :
    body.type === 'maxBuilderFee' ? approved : exchangeOk
  );

  beforeEach(() => {
    http = jasmine.createSpyObj<HttpClient>('HttpClient', ['post']);
    service = new PerpsExchangeWriteService(http);
    spyOnProperty(service, 'builderAddress', 'get').and.returnValue(BUILDER);
  });

  it('approves a configured builder once and attaches it to orders', fakeAsync(() => {
    http.post.and.callFake(((_url: string, body: any) =>
      builderReply(body)) as any);

    service.submitOrder(PRIVATE_KEY, ORDER).subscribe();
    flushMicrotasks();

    expect(bodies()).toHaveSize(5);
    expect(bodies()[0]).toEqual({ type: 'userAbstraction', user: BUILDER });
    expect(bodies()[1]).toEqual({ type: 'clearinghouseState', user: BUILDER });
    expect(bodies()[2].type).toBe('maxBuilderFee');
    expect(bodies()[3].action.type).toBe('approveBuilderFee');
    expect(bodies()[4].action.builder).toEqual({
      b: BUILDER,
      f: PERPS_BUILDER_FEE_TENTHS_BPS,
    });

    http.post.calls.reset();
    service.submitOrder(PRIVATE_KEY, ORDER).subscribe();
    flushMicrotasks();

    // 用户授权在会话内复用，builder 的当前模式和权益仍须重新读取。
    expect(http.post).toHaveBeenCalledTimes(3);
    expect(http.post.calls.mostRecent().args[1].action.builder).toEqual({
      b: BUILDER,
      f: PERPS_BUILDER_FEE_TENTHS_BPS,
    });
  }));

  it('skips approval when the account already authorized the builder fee', fakeAsync(() => {
    http.post.and.callFake(((_url: string, body: any) =>
      builderReply(body, PERPS_BUILDER_FEE_TENTHS_BPS)) as any);

    service.submitOrder(PRIVATE_KEY, ORDER).subscribe();
    flushMicrotasks();

    expect(bodies()).toHaveSize(4);
    expect(bodies()[2].type).toBe('maxBuilderFee');
    expect(bodies()[3].action.type).toBe('order');
    expect(bodies()[3].action.builder).toEqual({
      b: BUILDER,
      f: PERPS_BUILDER_FEE_TENTHS_BPS,
    });
  }));

  for (const scenario of [
    { mode: 'unifiedAccount', value: '100' },
    { mode: 'portfolioMargin', value: '100' },
    { mode: 'dexAbstraction', value: '100' },
    { mode: 'default', value: '100' },
    { mode: 'disabled', value: '99.99999999' },
    { mode: 'disabled', value: 'invalid' },
  ]) {
    it(`does not authorize or send orders for an ineligible builder ${JSON.stringify(scenario)}`, fakeAsync(() => {
      http.post.and.callFake(((_url: string, body: any) => of(
        body.type === 'userAbstraction' ? scenario.mode :
        { marginSummary: { accountValue: scenario.value } }
      )) as any);
      let failure: Error;
      service.submitOrder(PRIVATE_KEY, ORDER).subscribe({ error: (error) => failure = error });
      flushMicrotasks();
      expect(failure?.message).toContain(scenario.mode === 'disabled' ? '100 USDC' : 'Standard');
      expect(bodies().some((body) => body.action)).toBeFalse();
    }));
  }

  it('rechecks builder eligibility even after user approval was cached', fakeAsync(() => {
    let mode = 'disabled';
    http.post.and.callFake(((_url: string, body: any) =>
      body.type === 'userAbstraction' ? of(mode) : builderReply(body)) as any);
    service.submitOrder(PRIVATE_KEY, ORDER).subscribe();
    flushMicrotasks();
    http.post.calls.reset();
    mode = 'portfolioMargin';
    let failure: Error;
    service.submitOrder(PRIVATE_KEY, ORDER).subscribe({ error: (error) => failure = error });
    flushMicrotasks();
    expect(failure?.message).toContain('Standard');
    expect(bodies().some((body) => body.action)).toBeFalse();
  }));

  it('does not sign a direct builder approval when eligibility cannot be read', fakeAsync(() => {
    http.post.and.returnValue(throwError(() => new HttpErrorResponse({ status: 503 })) as any);
    let failure: HttpErrorResponse;
    service.approveBuilderFee(PRIVATE_KEY).subscribe({ error: (error) => failure = error });
    flushMicrotasks();
    expect(failure?.status).toBe(503);
    expect(bodies().some((body) => body.action)).toBeFalse();
  }));
});

describe('PerpsExchangeWriteService withdrawals', () => {
  let http: jasmine.SpyObj<HttpClient>;
  let service: PerpsExchangeWriteService;

  const sourceDexOfLastAction = () =>
    http.post.calls.mostRecent().args[1].action.sourceDex;

  beforeEach(() => {
    http = jasmine.createSpyObj<HttpClient>('HttpClient', ['post']);
    service = new PerpsExchangeWriteService(http);
    http.post.and.returnValue(of(exchangeOk) as any);
  });

  it('debits spot when told the account keeps its USDC there', fakeAsync(() => {
    service
      .withdraw(PRIVATE_KEY, SIGNER, '12.3', { fromSpot: true })
      .subscribe();
    flushMicrotasks();

    // 统一账户的永续清算所无论有多少资金都报 0，
    // 所以从永续侧发起的提现等于提了个寂寞。
    expect(sourceDexOfLastAction()).toBe('spot');
    // 为查明这一点不需要读取任何东西：调用方本来就知道。
    expect(bodiesOf(http).some((body) => body?.type === 'userAbstraction')).toBeFalse();
  }));

  it('debits perps otherwise', fakeAsync(() => {
    service
      .withdraw(PRIVATE_KEY, SIGNER, '12.3', { fromSpot: false })
      .subscribe();
    flushMicrotasks();

    expect(sourceDexOfLastAction()).toBe('');
  }));

  it('separates a refusal from a reply that never arrived', fakeAsync(() => {
    http.post.and.returnValue(
      throwError(() => new HttpErrorResponse({ status: 0 })) as any
    );
    let failure: any;

    service
      .withdraw(PRIVATE_KEY, SIGNER, '12.3', { fromSpot: false })
      .subscribe({ error: (error) => (failure = error) });
    flushMicrotasks();

    // 提现动的是本金：丢失的回复背后操作也可能已经执行，
    // 绝不能把它报告成失败。
    expect(failure.name).toBe('PerpsExecutionStatusUnknownError');
  }));

  for (const body of ['{"status":', '<html>upstream error</html>', {}, null]) {
    it(`keeps an undecidable withdrawal unknown: ${JSON.stringify(body)}`, fakeAsync(() => {
      http.post.and.returnValue(of(body) as any);
      const accepted = jasmine.createSpy('accepted');
      const wrote = jasmine.createSpy('wrote');
      service.wrote().subscribe(wrote);
      let failure: any;

      service.withdraw(PRIVATE_KEY, SIGNER, '12.3', { fromSpot: false })
        .subscribe({ next: accepted, error: (error) => (failure = error) });
      flushMicrotasks();

      expect(failure?.name).toBe('PerpsExecutionStatusUnknownError');
      expect(accepted).not.toHaveBeenCalled();
      expect(wrote).not.toHaveBeenCalled();
      expect(http.post).toHaveBeenCalledTimes(1);
    }));
  }

  it('preserves an explicit withdrawal rejection', fakeAsync(() => {
    http.post.and.returnValue(of({ status: 'err', response: 'Insufficient balance' }) as any);
    let failure: any;
    service.withdraw(PRIVATE_KEY, SIGNER, '12.3', { fromSpot: false })
      .subscribe({ error: (error) => (failure = error) });
    flushMicrotasks();

    expect(failure?.message).toBe('Insufficient balance');
    expect(failure?.name).not.toBe('PerpsExecutionStatusUnknownError');
    expect(http.post).toHaveBeenCalledTimes(1);
  }));
});

describe('PerpsExchangeWriteService write notifications', () => {
  it('announces every accepted write, and nothing else', fakeAsync(() => {
    const http = jasmine.createSpyObj<HttpClient>('HttpClient', ['post']);
    const service = new PerpsExchangeWriteService(http);
    const wrote = jasmine.createSpy('wrote');
    service.wrote().subscribe(wrote);

    http.post.and.returnValue(of(exchangeOk) as any);
    service.updateLeverage(PRIVATE_KEY, 3, 5, 20, 'isolated').subscribe();
    flushMicrotasks();
    expect(wrote).toHaveBeenCalledTimes(1);

    // 读取不是写入，而被拒绝的写入什么都没改变。
    service.getOrderStatus('0xABC', CLOID).subscribe();
    http.post.and.returnValue(
      throwError(() => new HttpErrorResponse({ status: 422 })) as any
    );
    service.cancelOrder(PRIVATE_KEY, 3, '42').subscribe({ error: () => undefined });
    flushMicrotasks();

    expect(wrote).toHaveBeenCalledTimes(1);
  }));
});

function bodiesOf(http: jasmine.SpyObj<HttpClient>): any[] {
  return http.post.calls.allArgs().map((args) => args[1]);
}
