import { EMPTY, of, Subject, throwError } from 'rxjs';

import { PerpsFill, PerpsLedgerUpdate, PerpsOpenOrder } from '@popup/_lib/perps';

import { PerpsHistoryComponent } from './perps-history.component';

/** The 行情数据集 as this page uses it: names for the rows. */
const markets = (overrides: any = {}) =>
  ({ getMarkets: () => EMPTY, ...overrides } as any);

describe('PerpsHistoryComponent order direction', () => {
  const order = (
    side: 'B' | 'A',
    reduceOnly: boolean
  ): PerpsOpenOrder => ({
    coin: 'ETH',
    oid: '1',
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
    null,
    null,
      markets()
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
      watchOpenOrders: () => EMPTY,
    };
    const channel: any = { subscribe: () => EMPTY };
    const rateLimited = new PerpsHistoryComponent(
      null,
      hyperliquid,
      null,
      null,
      null,
      channel,
      markets({ getMarkets: () => throwError(() => ({ status: 429 })) })
    );
    (rateLimited as any).address = '0xabc';

    (rateLimited as any).load();

    expect(rateLimited.loadError).toBeFalse();
    expect(rateLimited.loading).toBeFalse();
    expect(rateLimited.openOrders.length).toBe(1);
    expect((rateLimited as any).markets).toEqual([]);
  });
});

describe('PerpsHistoryComponent ledger rows', () => {
  const WALLET = '0x5be1a4c623a63498d78c08b8890a6e5dad6bf359';

  const component = new PerpsHistoryComponent(
    null,
    null,
    null,
    null,
    null,
    null,
      markets()
    );
  (component as any).address = WALLET;

  const row = (delta: any): PerpsLedgerUpdate => ({
    time: 1,
    hash: '0x1',
    delta,
  });

  it('names bridge rows deposit and withdraw', () => {
    expect(component.ledgerTypeKey(row({ type: 'deposit', usdc: '9.0' }))).toBe(
      'perpsLedgerDeposit'
    );
    expect(
      component.ledgerTypeKey(row({ type: 'withdraw', usdc: '9.0', fee: '1.0' }))
    ).toBe('perpsLedgerWithdraw');
  });

  it('names a spot transfer by which way the money moved', () => {
    expect(
      component.ledgerTypeKey(
        row({
          type: 'send',
          user: '0x0b80659a4076e9e93c7dbe0f10675a16a3e5c206',
          destination: WALLET,
          amount: '4.8',
        })
      )
    ).toBe('perpsLedgerDeposit');
    expect(
      component.ledgerTypeKey(
        row({
          type: 'send',
          user: WALLET,
          destination: '0x2000000000000000000000000000000000000000',
          amount: '6.0',
        })
      )
    ).toBe('perpsLedgerWithdraw');
  });

  it('names a peer-to-peer USDC transfer send on both ends', () => {
    expect(
      component.ledgerTypeKey(
        row({
          type: 'internalTransfer',
          usdc: '1000.0',
          user: '0xe973105a27e17350500926ae664dfcfe6006d924',
          destination: WALLET,
          fee: '1.0',
        })
      )
    ).toBe('perpsLedgerSend');
  });

  it('leaves exotic ledger types to their raw Hyperliquid name', () => {
    expect(component.ledgerTypeKey(row({ type: 'vaultCreate' }))).toBe('');
  });

  it('shows a fee only when one was actually charged', () => {
    expect(component.ledgerFee(row({ type: 'withdraw', fee: '1.0' }))).toBe(
      '1.0 USDC'
    );
    expect(
      component.ledgerFee(
        row({ type: 'send', fee: '0.000533', feeToken: 'USDC' })
      )
    ).toBe('0.000533 USDC');
    expect(
      component.ledgerFee(row({ type: 'send', fee: '0.0', feeToken: '' }))
    ).toBe('');
    expect(component.ledgerFee(row({ type: 'deposit', usdc: '9.0' }))).toBe('');
  });
});

describe('PerpsHistoryComponent live fills', () => {
  const fill = (tid: string, time: number): PerpsFill =>
    ({ tid, oid: '1', time, px: '100', sz: '1' } as PerpsFill);

  /** Fills arrive over the 数据通道 only; the page never polls for them. */
  function watching() {
    const frames = new Subject<any>();
    const hyperliquid: any = {
      getOpenOrders: () => EMPTY,
      getMarkets: () => EMPTY,
      watchOpenOrders: () => EMPTY,
    };
    const channel: any = { subscribe: () => frames };
    const component = new PerpsHistoryComponent(
      null,
      hyperliquid,
      null,
      null,
      null,
      channel,
      markets()
    );
    (component as any).address = '0xabc';
    (component as any).watchLiveActivity();
    return { component, frames };
  }

  it('takes a snapshot as the whole truth', () => {
    const { component, frames } = watching();

    frames.next({ fills: [fill('a', 2)], isSnapshot: true });
    frames.next({ fills: [fill('b', 1)], isSnapshot: true });

    expect(component.fills.map((f) => f.tid)).toEqual(['b']);
  });

  it('merges later pushes into what is already on screen, newest first', () => {
    const { component, frames } = watching();

    frames.next({ fills: [fill('a', 1)], isSnapshot: true });
    frames.next({ fills: [fill('b', 3)] });

    expect(component.fills.map((f) => f.tid)).toEqual(['b', 'a']);
  });

  it('does not print the same fill twice when a push repeats one', () => {
    const { component, frames } = watching();

    frames.next({ fills: [fill('a', 1)], isSnapshot: true });
    frames.next({ fills: [fill('a', 1), fill('b', 2)] });

    expect(component.fills.map((f) => f.tid)).toEqual(['b', 'a']);
  });
});
