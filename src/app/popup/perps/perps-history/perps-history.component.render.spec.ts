import { Component, Pipe, PipeTransform } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Store } from '@ngrx/store';
import { EMPTY, of } from 'rxjs';

import { ChromeService, EvmWalletService, GlobalService } from '@/app/core';
import { HyperliquidService } from '@/app/core/services/perps/hyperliquid.service';
import { PerpsDataChannel } from '@app/core/services/perps/perps-data-channel.service';
import { PerpsExchangeWriteService } from '@app/core/services/perps/perps-exchange-write.service';
import { PerpsMarketDatasetService } from '@app/core/services/perps/perps-market-dataset.service';
import { PerpsOpenOrder } from '@popup/_lib/perps';

import { PERPS_FORMAT_PIPES } from '../perps-format.pipe';
import { ethMarket } from '../perps.test-fixture';
import { PerpsHistoryComponent } from './perps-history.component';
import { PERPS_HISTORY_PIPES } from './perps-history.pipe';

/**
 * 模板与接线 —— 直接构造组件的那些 spec 覆盖不到它们。
 *
 * 这一页的模板里住着真的逻辑：每一行要问它所属市场的精度、要在触发单和普通挂单之间选
 * 一个价来显示、还要在账本类型没有文案时退回协议原文。这些判断没有一条在断言 getter 的
 * 用例视野里 —— perps-tab 的持仓卡片就是这样漏掉一个运行时错误的。
 */
@Pipe({ name: 'translate' })
class TranslateStubPipe implements PipeTransform {
  transform(value: string) {
    return of(value);
  }
}

@Component({ selector: 'loading-dot', template: '' })
class LoadingDotStubComponent {}

const WALLET = '0xabc';
const T = 1_700_000_000_000;

/** ETH 有市场（精度 4），XYZ 没有 —— 精度必须逐行去查，不能一把抓。 */
const MARKETS = [ethMarket({ szDecimals: 4 })];

const order = (overrides: Partial<PerpsOpenOrder>): PerpsOpenOrder =>
  ({
    coin: 'ETH',
    oid: '1',
    side: 'A',
    limitPx: '1710.5',
    sz: '1.23456',
    origSz: '1.23456',
    timestamp: T,
    orderType: 'Limit',
    reduceOnly: false,
    ...overrides,
  } as PerpsOpenOrder);

/**
 * 一张市价止损单：`limitPx` 是触发之后那张订单的限价，`triggerPx` 才是用户设的。
 * 两个数字差着一截，所以屏幕上显示的是哪一个，一眼就能看出来。
 */
const STOP_MARKET = order({
  oid: '7',
  orderType: 'Stop Market',
  reduceOnly: true,
  isTrigger: true,
  triggerPx: '1800',
});

const LIMIT_ON_UNKNOWN_MARKET = order({ oid: '8', coin: 'XYZ' });

const fill = (overrides: any): any => ({
  coin: 'ETH',
  px: '1710.5',
  sz: '1.23456',
  side: 'B',
  time: T,
  dir: 'Open Long',
  closedPnl: '0',
  hash: '0x1',
  feeToken: 'USDC',
  ...overrides,
});

const FILLS: any[] = [
  // 交易场所按时间**升序**下发，所以这里也按升序写 —— 屏幕上要反过来。
  // 先开仓（收手续费、没有实现盈亏），一天后平仓（亏 12.5、手续费为零）。
  fill({
    tid: '1',
    oid: '1',
    dir: 'Open Long',
    side: 'B',
    fee: '0.05',
    closedPnl: '0.0',
    time: T - 86400000,
  }),
  fill({
    tid: '2',
    oid: '2',
    dir: 'Close Long',
    side: 'A',
    fee: '0.0',
    closedPnl: '-12.5',
    time: T,
  }),
  // 仓位反手 —— 短语表里没有它，只能显示协议原文。
  fill({
    tid: '3',
    oid: '3',
    dir: 'Long > Short',
    side: 'A',
    fee: '0.0',
    closedPnl: '0.0',
    time: T - 2 * 86400000,
  }),
];

const HISTORY: any[] = [
  // 姊妹单成交导致的自动撤销 —— 后缀规则要把它归到「已撤销」。
  { order: STOP_MARKET, status: 'siblingFilledCanceled', statusTimestamp: T },
  {
    order: order({ oid: '9', side: 'B' }),
    status: 'brandNewStatus',
    statusTimestamp: T - 1,
  },
];

const LEDGER: any[] = [
  { time: T, hash: '0x1', delta: { type: 'deposit', usdc: '9.0' } },
  {
    time: T - 1000,
    hash: '0x2',
    delta: {
      type: 'spotTransfer',
      amount: '2.5',
      token: 'HYPE',
      user: WALLET,
      destination: '0xdef',
    },
  },
  { time: T - 2000, hash: '0x3', delta: { type: 'vaultCreate' } },
];

describe('PerpsHistoryComponent 渲染与接线', () => {
  let fixture: ComponentFixture<PerpsHistoryComponent>;
  let component: PerpsHistoryComponent;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [
        PerpsHistoryComponent,
        TranslateStubPipe,
        LoadingDotStubComponent,
        ...PERPS_FORMAT_PIPES,
        ...PERPS_HISTORY_PIPES,
      ],
      providers: [
        {
          provide: Store,
          useValue: {
            select: () =>
              of({ currentWallet: { accounts: [{ address: WALLET }] } }),
          },
        },
        {
          provide: HyperliquidService,
          useValue: {
            getOpenOrders: () => of([STOP_MARKET, LIMIT_ON_UNKNOWN_MARKET]),
            watchOpenOrders: () => EMPTY,
            getUserFills: () => of(FILLS),
            getHistoricalOrders: () => of(HISTORY),
            getLedgerUpdates: () => of(LEDGER),
          },
        },
        {
          provide: PerpsMarketDatasetService,
          useValue: { getMarkets: () => of(MARKETS) },
        },
        { provide: PerpsDataChannel, useValue: { subscribe: () => EMPTY } },
        { provide: ChromeService, useValue: {} },
        { provide: EvmWalletService, useValue: {} },
        { provide: GlobalService, useValue: {} },
        { provide: PerpsExchangeWriteService, useValue: {} },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(PerpsHistoryComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  afterEach(() => fixture.destroy());

  const rows = (): HTMLElement[] =>
    Array.from(fixture.nativeElement.querySelectorAll('.fill-row'));

  const text = (row: HTMLElement, selector: string): string =>
    (row.querySelector(selector)?.textContent ?? '')
      .replace(/\s+/g, ' ')
      .trim();

  /** 一行右侧金额栏里的每一条小字，按出现顺序。 */
  const prices = (row: HTMLElement): string[] =>
    Array.from(row.querySelectorAll('.price')).map((el) =>
      (el.textContent ?? '').replace(/\s+/g, ' ').trim()
    );

  it('触发单显示触发价，并说明这是个触发价', () => {
    const row = rows()[0];

    // `limitPx` 是 1710.5 —— 它不该出现在屏幕上。
    expect(text(row, '.price')).toBe('perpsTriggerPrice $1,800');
    expect(row.querySelector('.price .trigger')).toBeTruthy();
  });

  it('普通挂单显示限价，前面不加触发价的标签', () => {
    const row = rows()[1];

    expect(text(row, '.price')).toBe('$1,710.5');
    expect(row.querySelector('.price .trigger')).toBeFalsy();
  });

  it('数量的精度来自该行自己的市场', () => {
    // ETH 的 szDecimals 是 4；XYZ 没有市场，按数量级取精度。
    expect(text(rows()[0], '.size')).toBe('1.2346 ETH');
    expect(text(rows()[1], '.size')).toBe('1.23 XYZ');
  });

  it('方向读作交易意图，不是买卖方向', () => {
    // 卖出 + reduceOnly = 平多；卖出 + 非 reduceOnly = 开空。
    expect(text(rows()[0], '.dir')).toContain('perpsCloseLong');
    expect(text(rows()[1], '.dir')).toContain('perpsOpenShort');
  });

  it('当前委托保留方向图标，方向本身不着色', () => {
    // 只有历史成交和历史委托去掉了图标；这一页的另外两个 tab 没跟着改。
    expect(rows()[0].querySelector('.fill-icon')).toBeTruthy();
    expect(rows()[0].querySelector('.dir.sell')).toBeFalsy();
    expect(rows()[0].querySelector('.dir.buy')).toBeFalsy();
  });

  describe('历史成交', () => {
    beforeEach(() => {
      // 数据通道推不出快照（`subscribe` 返回 EMPTY），所以这一步会走 REST 兜底。
      component.setTab('fills');
      fixture.detectChanges();
    });

    it('数量和价格都按该行所属市场的精度', () => {
      expect(text(rows()[0], '.size')).toBe('1.2346 ETH');
      expect(text(rows()[0], '.price')).toBe('$1,710.5');
    });

    it('最新的一笔排在最上面', () => {
      // 交易场所按升序下发；照单全收就会把最老的一笔顶在最上面。
      expect(rows().map((r) => text(r, '.dir'))).toEqual([
        'perpsCloseLong ETH',
        'perpsOpenLong ETH',
        'Long > Short ETH',
      ]);
    });

    it('认得的方向翻译，认不得的退回协议原文', () => {
      // 交易场所的 `dir` 是一句英文短语，而且这份短语表没进过官方文档。
      expect(text(rows()[0], '.dir')).toBe('perpsCloseLong ETH');
      expect(text(rows()[2], '.dir')).toBe('Long > Short ETH');
    });

    it('币种跟着方向的颜色，但淡一档', () => {
      // 币种在 `.dir` 里面，所以它继承那一行的红或绿；`.coin` 只负责把它压暗一点。
      expect(rows()[0].querySelector('.dir.sell .coin')?.textContent).toBe(
        'ETH'
      );
      expect(rows()[1].querySelector('.dir.buy .coin')?.textContent).toBe(
        'ETH'
      );
    });

    it('不画方向图标，方向由这一行自己的颜色表达', () => {
      expect(rows()[0].querySelector('.fill-icon')).toBeFalsy();
      // 卖出红、买入绿 —— 和原来那个圆形图标同一套颜色。
      expect(rows()[0].querySelector('.dir.sell')).toBeTruthy();
      expect(rows()[1].querySelector('.dir.buy')).toBeTruthy();
    });

    it('与测试网地址的三笔 ETH 成交一致：开仓给费用，平仓给净盈亏', () => {
      component.fills = [
        fill({ fee: '0.449968', closedPnl: '0.0' }),
        fill({ fee: '0.008487', closedPnl: '0.353' }),
        fill({ fee: '0.008646', closedPnl: '0.0' }),
      ];
      fixture.detectChanges();
      // 第四行只有一个位置。开仓的 PnL 恒等于负的费用，同一个数字不说两遍。
      expect(rows().map((r) => prices(r).slice(1))).toEqual([
        ['perpsFee: 0.45 USDC'],
        ['PnL: +$0.34'],
        ['perpsFee: 0.01 USDC'],
      ]);
    });

    it('每行最多三项：价格加费用或净盈亏，二者不同时出现', () => {
      // 平仓（在上面）：亏了 12.5，手续费为零 —— 给净盈亏，不给那条 0.00 的费用。
      expect(prices(rows()[0])).toEqual(['$1,710.5', 'PnL: -$12.50']);
      // 开仓：协议盈亏为零（以 `'0.0'` 到达），只给费用。
      expect(prices(rows()[1])).toEqual(['$1,710.5', 'perpsFee: 0.05 USDC']);
    });
  });

  describe('历史委托', () => {
    beforeEach(() => {
      component.setTab('orderHistory');
      fixture.detectChanges();
    });

    it('把交易场所的自动撤销归到已撤销', () => {
      expect(text(rows()[0], '.dir')).toContain('perpsStatusCanceled');
    });

    it('没见过的状态原样显示，而不是猜一个', () => {
      expect(text(rows()[1], '.dir')).toContain('brandNewStatus');
    });

    it('触发单在这里显示的同样是触发价', () => {
      expect(text(rows()[0], '.price')).toBe('perpsTriggerPrice $1,800');
    });

    it('不画方向图标，方向由这一行自己的颜色表达', () => {
      expect(rows()[0].querySelector('.fill-icon')).toBeFalsy();
      expect(rows()[0].querySelector('.dir.sell')).toBeTruthy();
      expect(rows()[1].querySelector('.dir.buy')).toBeTruthy();
    });
  });

  describe('存款和提款', () => {
    beforeEach(() => {
      component.setTab('transfers');
      fixture.detectChanges();
    });

    it('显示跨链提款总费用和内部转账实际到账金额', () => {
      component.transfers = [
        {
          time: T, hash: '0xcctp', cctpDestinationChainId: 421614, cctpFeeExact: '0.37',
          delta: {
            type: 'send', amount: '1.123456', token: 'USDC',
            user: WALLET, destination: '0x2000000000000000000000000000000000000000',
            fee: '0.000505', feeToken: 'USDC',
          },
        },
        {
          time: T - 1000, hash: '0xinternal',
          delta: {
            type: 'internalTransfer', usdc: '1000.0', fee: '1.0',
            user: '0xother', destination: WALLET,
          },
        },
      ];
      fixture.detectChanges();
      expect(text(rows()[0], '.size')).toBe('-1.123456 USDC');
      expect(prices(rows()[0])).toContain('perpsFee: 0.37 USDC');
      expect(text(rows()[1], '.size')).toBe('+999 USDC');
    });

    it('按钱的流向命名并标注符号', () => {
      expect(text(rows()[0], '.dir')).toBe('perpsLedgerDeposit');
      expect(text(rows()[0], '.size')).toBe('+9.0 USDC');
      expect(rows()[0].querySelector('.size.negative')).toBeFalsy();

      expect(text(rows()[1], '.dir')).toBe('perpsLedgerWithdraw');
      expect(text(rows()[1], '.size')).toBe('-2.5 HYPE');
      expect(rows()[1].querySelector('.size.negative')).toBeTruthy();
    });

    it('没有文案的账本类型退回协议原文', () => {
      expect(text(rows()[2], '.dir')).toBe('vaultCreate');
    });
  });
});
