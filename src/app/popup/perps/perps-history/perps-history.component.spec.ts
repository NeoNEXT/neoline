import { EMPTY, of, Subject, throwError } from 'rxjs';

import { PerpsFill, PerpsLedgerUpdate, PerpsOpenOrder } from '@popup/_lib/perps';

import { PerpsHistoryComponent } from './perps-history.component';

/** 本页面视角下的行情数据集：只用来给各行提供名称。 */
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
      markets(),
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
      markets({ getMarkets: () => throwError(() => ({ status: 429 })) }),
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

describe('PerpsHistoryComponent ledger rows', () => {
  const WALLET = '0x5be1a4c623a63498d78c08b8890a6e5dad6bf359';

  const component = new PerpsHistoryComponent(
    null,
    null,
    null,
    null,
    null,
    null,
      markets(),
      null
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
    const channel: any = {
      subscribe: jasmine.createSpy('subscribe').and.returnValue(frames),
    };
    const component = new PerpsHistoryComponent(
      null,
      hyperliquid,
      null,
      null,
      null,
      channel,
      markets(),
      null
    );
    (component as any).address = '0xabc';
    (component as any).watchLiveActivity();
    return { component, frames, channel };
  }

  /**
   * 实时那条路必须和 REST 那条路要求同一种合并。少了它，一张被盘口多张挂单分批吃掉的单
   * 会在推送时占好几行，刷新之后又并成一行 —— 同一笔成交，两个样子。
   */
  it('订阅实时成交时同样要求交易场所合并', () => {
    const { channel } = watching();

    expect(channel.subscribe).toHaveBeenCalledWith({
      type: 'userFills',
      user: '0xabc',
      aggregateByTime: true,
    });
  });

  it('takes a snapshot as the whole truth', () => {
    const { component, frames } = watching();

    frames.next({ fills: [fill('a', 2)], isSnapshot: true });
    frames.next({ fills: [fill('b', 1)], isSnapshot: true });

    expect(component.fills.map((f) => f.tid)).toEqual(['b']);
  });

  it('把交易场所升序下发的快照倒过来 —— 最新的排最上面', () => {
    const { component, frames } = watching();

    // `userFills` 的快照按时间**升序**到达。照单全收就会把最老的一笔顶在最上面。
    frames.next({
      fills: [fill('old', 1), fill('mid', 2), fill('new', 3)],
      isSnapshot: true,
    });

    expect(component.fills.map((f) => f.tid)).toEqual(['new', 'mid', 'old']);
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

describe('PerpsHistoryComponent 成交 tab 的兜底', () => {
  const fill = (tid: string, time: number): PerpsFill =>
    ({ tid, oid: '1', time, px: '100', sz: '1' } as PerpsFill);

  /**
   * 页面加载完成、实时订阅已建立的那一刻。
   *
   * 成交只从数据通道来，而那条 observable 既不 error 也不 complete —— 所以「快照没来」
   * 和「快照来了但是空的」在页面看来一模一样。REST 兜底就是用来把这两件事分开的。
   */
  function loaded(overrides: any = {}) {
    const frames = new Subject<any>();
    const hyperliquid: any = {
      getOpenOrders: () => of([]),
      watchOpenOrders: () => EMPTY,
      getUserFills: jasmine
        .createSpy('getUserFills')
        .and.returnValue(of([fill('rest', 1)])),
      ...overrides,
    };
    const channel: any = { subscribe: () => frames };
    const component = new PerpsHistoryComponent(
      null,
      hyperliquid,
      null,
      null,
      null,
      channel,
      markets({ getMarkets: () => of([]) }),
      null
    );
    (component as any).address = '0xabc';
    (component as any).load();
    return { component, frames, hyperliquid };
  }

  it('快照还没到就打开这个 tab 时，花一次 REST 把历史取回来', () => {
    const { component, hyperliquid } = loaded();

    component.setTab('fills');

    expect(hyperliquid.getUserFills).toHaveBeenCalled();
    expect(component.fills.map((f) => f.tid)).toEqual(['rest']);
    expect(component.tabLoading).toBeFalse();
  });

  it('快照已经到了就不再花那次请求', () => {
    const { component, frames, hyperliquid } = loaded();

    frames.next({ fills: [fill('ws', 2)], isSnapshot: true });
    component.setTab('fills');

    expect(hyperliquid.getUserFills).not.toHaveBeenCalled();
    expect(component.fills.map((f) => f.tid)).toEqual(['ws']);
  });

  it('两边都到了也不会把同一段历史印两遍', () => {
    const { component, frames } = loaded();

    component.setTab('fills');
    frames.next({ fills: [fill('rest', 1)], isSnapshot: true });

    expect(component.fills.map((f) => f.tid)).toEqual(['rest']);
  });

  it('兜底失败时说得出「失败了」，而不是一直转圈', () => {
    const { component } = loaded({
      getUserFills: () => throwError(() => ({ status: 500 })),
    });

    component.setTab('fills');

    expect(component.loadError).toBeTrue();
    expect(component.tabLoading).toBeFalse();
  });
});

describe('PerpsHistoryComponent 销毁', () => {
  it('离开页面后，迟到的挂单响应不会再建立实时订阅', () => {
    // 这三条订阅一旦在 `ngOnDestroy` 之后建立，就再也没有人会去退：数据通道对频道做
    // 引用计数，计数回不到零意味着频道不拆、套接字不闲置。
    const openOrders = new Subject<PerpsOpenOrder[]>();
    const watchOpenOrders = jasmine
      .createSpy('watchOpenOrders')
      .and.returnValue(EMPTY);
    const subscribe = jasmine.createSpy('subscribe').and.returnValue(EMPTY);
    const component = new PerpsHistoryComponent(
      null,
      { getOpenOrders: () => openOrders, watchOpenOrders } as any,
      null,
      null,
      null,
      { subscribe } as any,
      markets({ getMarkets: () => of([]) }),
      null
    );
    (component as any).address = '0xabc';
    (component as any).load();

    component.ngOnDestroy();
    openOrders.next([]);
    openOrders.complete();

    expect(watchOpenOrders).not.toHaveBeenCalled();
    expect(subscribe).not.toHaveBeenCalled();
  });
});

describe('PerpsHistoryComponent 当前委托的顺序', () => {
  const order = (oid: string, timestamp: number): PerpsOpenOrder =>
    ({
      coin: 'ETH',
      oid,
      side: 'B',
      limitPx: '2000',
      sz: '1',
      origSz: '1',
      timestamp,
      orderType: 'Limit',
      reduceOnly: false,
    } as PerpsOpenOrder);

  it('首屏与实时推送都把最新的排最上面', () => {
    // 首屏是按 DEX 逐个请求再拼起来的，所以它本来就没有跨 DEX 的时间顺序可言。
    const live = new Subject<PerpsOpenOrder[]>();
    const component = new PerpsHistoryComponent(
      null,
      {
        getOpenOrders: () => of([order('1', 1), order('3', 3), order('2', 2)]),
        watchOpenOrders: () => live,
      } as any,
      null,
      null,
      null,
      { subscribe: () => EMPTY } as any,
      markets({ getMarkets: () => of([]) }),
      null
    );
    (component as any).address = '0xabc';
    (component as any).load();

    expect(component.openOrders.map((o) => o.oid)).toEqual(['3', '2', '1']);

    live.next([order('4', 4), order('6', 6), order('5', 5)]);

    expect(component.openOrders.map((o) => o.oid)).toEqual(['6', '5', '4']);
  });
});
