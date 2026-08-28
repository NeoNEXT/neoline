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

  /** The signed bodies, in the order they were sent. */
  const bodies = () => http.post.calls.allArgs().map((args) => args[1]);
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
    service.updateLeverage(PRIVATE_KEY, 3, 5, 20).subscribe();
    flushMicrotasks();

    expect(http.post.calls.mostRecent().args[1].action).toEqual({
      type: 'updateLeverage',
      asset: 3,
      isCross: false,
      leverage: 5,
    });
  }));

  it('always writes leverage in isolated mode, clamped to the market maximum', fakeAsync(() => {
    service.updateLeverage(PRIVATE_KEY, 7, 2, 3).subscribe();
    flushMicrotasks();

    expect(http.post.calls.first().args[1].action).toEqual({
      type: 'updateLeverage',
      asset: 7,
      isCross: false,
      leverage: 2,
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

  beforeEach(() => {
    http = jasmine.createSpyObj<HttpClient>('HttpClient', ['post']);
    service = new PerpsExchangeWriteService(http);
    spyOnProperty(service, 'builderAddress', 'get').and.returnValue(BUILDER);
  });

  it('approves a configured builder once and attaches it to orders', fakeAsync(() => {
    http.post.and.callFake(((_url: string, body: any) =>
      body.type === 'maxBuilderFee' ? of(0) : of(exchangeOk)) as any);

    service.submitOrder(PRIVATE_KEY, ORDER).subscribe();
    flushMicrotasks();

    expect(bodies()).toHaveSize(3);
    expect(bodies()[0].type).toBe('maxBuilderFee');
    expect(bodies()[1].action.type).toBe('approveBuilderFee');
    expect(bodies()[2].action.builder).toEqual({
      b: BUILDER,
      f: PERPS_BUILDER_FEE_TENTHS_BPS,
    });

    http.post.calls.reset();
    service.submitOrder(PRIVATE_KEY, ORDER).subscribe();
    flushMicrotasks();

    // The approval is a one-time signature per account, remembered for the
    // session — a second order is one request, not three.
    expect(http.post).toHaveBeenCalledTimes(1);
    expect(http.post.calls.mostRecent().args[1].action.builder).toEqual({
      b: BUILDER,
      f: PERPS_BUILDER_FEE_TENTHS_BPS,
    });
  }));

  it('skips approval when the account already authorized the builder fee', fakeAsync(() => {
    http.post.and.callFake(((_url: string, body: any) =>
      body.type === 'maxBuilderFee'
        ? of(PERPS_BUILDER_FEE_TENTHS_BPS)
        : of(exchangeOk)) as any);

    service.submitOrder(PRIVATE_KEY, ORDER).subscribe();
    flushMicrotasks();

    expect(bodies()).toHaveSize(2);
    expect(bodies()[0].type).toBe('maxBuilderFee');
    expect(bodies()[1].action.type).toBe('order');
    expect(bodies()[1].action.builder).toEqual({
      b: BUILDER,
      f: PERPS_BUILDER_FEE_TENTHS_BPS,
    });
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

    // A unified account's perps clearinghouse reports 0 however funded it is,
    // so a perps-sourced withdrawal is a withdrawal of nothing.
    expect(sourceDexOfLastAction()).toBe('spot');
    // Nothing is read to find that out: the caller already knew.
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

    // A withdrawal moves principal: a reply that was lost may still have
    // executed, and must never be reported as a failure.
    expect(failure.name).toBe('PerpsExecutionStatusUnknownError');
  }));
});

describe('PerpsExchangeWriteService write notifications', () => {
  it('announces every accepted write, and nothing else', fakeAsync(() => {
    const http = jasmine.createSpyObj<HttpClient>('HttpClient', ['post']);
    const service = new PerpsExchangeWriteService(http);
    const wrote = jasmine.createSpy('wrote');
    service.wrote().subscribe(wrote);

    http.post.and.returnValue(of(exchangeOk) as any);
    service.updateLeverage(PRIVATE_KEY, 3, 5, 20).subscribe();
    flushMicrotasks();
    expect(wrote).toHaveBeenCalledTimes(1);

    // A read is not a write, and a refused write changed nothing.
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
