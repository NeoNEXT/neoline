import { EMPTY, of, throwError } from 'rxjs';

import { PerpsOpenOrder } from '@popup/_lib/perps';

import { PerpsHistoryComponent } from './perps-history.component';

describe('PerpsHistoryComponent order direction', () => {
  const order = (
    side: 'B' | 'A',
    reduceOnly: boolean
  ): PerpsOpenOrder => ({
    coin: 'ETH',
    oid: 1,
    side,
    limitPx: '2000',
    sz: '1',
    origSz: '1',
    timestamp: 1,
    orderType: 'Limit',
    reduceOnly,
  });

  const component = new PerpsHistoryComponent(
    null,
    null,
    null,
    null,
    null
  );

  it('labels non-reduce-only orders as opening long or short', () => {
    expect(component.orderDirectionKey(order('B', false))).toBe(
      'perpsOpenLong'
    );
    expect(component.orderDirectionKey(order('A', false))).toBe(
      'perpsOpenShort'
    );
  });

  it('labels reduce-only orders as closing long or short', () => {
    expect(component.orderDirectionKey(order('A', true))).toBe(
      'perpsCloseLong'
    );
    expect(component.orderDirectionKey(order('B', true))).toBe(
      'perpsCloseShort'
    );
  });

  it('still shows open orders when the market snapshot fails', () => {
    const hyperliquid: any = {
      getOpenOrders: () => of([order('B', false)]),
      getMarkets: () => throwError(() => ({ status: 429 })),
      watchOpenOrders: () => EMPTY,
      watchUserFills: () => EMPTY,
    };
    const rateLimited = new PerpsHistoryComponent(
      null,
      hyperliquid,
      null,
      null,
      null
    );
    (rateLimited as any).address = '0xabc';

    (rateLimited as any).load();

    expect(rateLimited.loadError).toBeFalse();
    expect(rateLimited.loading).toBeFalse();
    expect(rateLimited.openOrders.length).toBe(1);
    expect((rateLimited as any).markets).toEqual([]);
  });
});
