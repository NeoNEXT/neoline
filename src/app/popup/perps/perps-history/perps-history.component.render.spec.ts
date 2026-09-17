import { Component, Pipe, PipeTransform } from '@angular/core';
import { ComponentFixture, fakeAsync, flushMicrotasks, TestBed } from '@angular/core/testing';
import { Store } from '@ngrx/store';
import { EMPTY, of, Subject } from 'rxjs';

import { ChromeService, EvmWalletService, GlobalService } from '@/app/core';
import { HyperliquidService } from '@/app/core/services/perps/hyperliquid.service';
import { PerpsDataChannel } from '@app/core/services/perps/perps-data-channel.service';
import { PerpsExchangeWriteService } from '@app/core/services/perps/perps-exchange-write.service';
import { PerpsMarketDatasetService } from '@app/core/services/perps/perps-market-dataset.service';
import { PerpsOpenOrder } from '@popup/_lib/perps';
import * as chineseMessages from '@/_locales/zh_CN/messages.json';

import { PERPS_FORMAT_PIPES } from '../perps-format.pipe';
import { PerpsCoinLogoComponent } from '../perps-coin-logo/perps-coin-logo.component';
import { ethMarket } from '../perps.test-fixture';
import { PerpsHistoryComponent } from './perps-history.component';
import { PERPS_HISTORY_PIPES } from './perps-history.pipe';

/**
 * 模板与接线 —— 直接构造组件的那些 spec 覆盖不到它们。
 *
 * 覆盖逐行市场精度、订单类型和方向、状态翻译，以及撤单确认与提交的接线。
 */
@Pipe({ name: 'translate' })
class TranslateStubPipe implements PipeTransform {
  transform(value: string) {
    return of(value.startsWith('perpsStatus') ? chineseMessages[value]?.message || value : value);
  }
}

@Component({ selector: 'loading-dot', template: '' })
class LoadingDotStubComponent {}

const WALLET = '0xabc';
const T = 1_700_000_000_000;
const NOW = new Date(2026, 8, 17, 12).getTime();

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
  // 仓位反手，与常规成交方向一样显示接口原文。
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
  // 姊妹单成交导致的自动撤销，完整保留接口状态。
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

const FUNDINGS: any[] = [
  {
    time: T - 1000,
    hash: '0x1',
    delta: { type: 'funding', coin: 'ETH', usdc: '0.005588' },
  },
  {
    time: T,
    hash: '0x2',
    delta: { type: 'funding', coin: 'ETH', usdc: '-0.005589' },
  },
];

describe('PerpsHistoryComponent 渲染与接线', () => {
  let fixture: ComponentFixture<PerpsHistoryComponent>;
  let component: PerpsHistoryComponent;

  beforeEach(async () => {
    spyOn(Date, 'now').and.returnValue(NOW);
    await TestBed.configureTestingModule({
      declarations: [
        PerpsHistoryComponent,
        TranslateStubPipe,
        LoadingDotStubComponent,
        PerpsCoinLogoComponent,
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
            getUserFunding: () => of(FUNDINGS),
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

  it('五个列表均按各自时间字段分组，同一天只显示一个标题', () => {
    const times = [
      NOW, NOW - 1000,
      new Date(2026, 8, 16, 23, 59).getTime(),
      new Date(2026, 8, 15, 12).getTime(),
    ];
    for (const tab of ['orders', 'fills', 'orderHistory', 'funding', 'transfers'] as const) {
      component.setTab(tab);
      component.openOrders = times.map((timestamp) => order({ timestamp }));
      component.fills = times.map((time) => fill({ time, fee: '0.01' }));
      component.historicalOrders = times.map((statusTimestamp) => ({
        order: STOP_MARKET, status: 'filled', statusTimestamp,
      }));
      component.fundings = times.map((time) => ({
        time, hash: '0x1', delta: { type: 'funding' as const, coin: 'ETH', usdc: '0.01' },
      }));
      component.transfers = times.map((time) => ({
        time, hash: '0x1', delta: { type: 'deposit', usdc: '1' },
      }));
      fixture.detectChanges();
      const sequence = Array.from(
        fixture.nativeElement.querySelectorAll('.activity-day, .fill-row')
      ).map((el: HTMLElement) => el.matches('.activity-day') ? el.textContent.trim() : 'row');
      expect(sequence).withContext(tab).toEqual([
        'perpsActivityToday', 'row', 'row',
        'perpsActivityYesterday', 'row', 'Sep 15', 'row',
      ]);
    }
  });

  it('切 tab 时用当前时间重算今天和昨天的标题', () => {
    component.openOrders = [order({ timestamp: NOW })];
    fixture.detectChanges();
    expect(text(fixture.nativeElement, '.activity-day')).toBe('perpsActivityToday');
    (Date.now as jasmine.Spy).and.returnValue(new Date(2026, 8, 18, 0, 1).getTime());
    component.setTab('orders');
    fixture.detectChanges();
    expect(text(fixture.nativeElement, '.activity-day')).toBe('perpsActivityYesterday');
  });

  it('当前委托与历史委托共用图标、类型方向和原始数量，右侧显示撤单', () => {
    const partialOrder = order({
      sz: '0.25', origSz: '1.23456', isPositionTpsl: true,
    });
    component.openOrders = [partialOrder];
    fixture.detectChanges();
    const currentRow = rows()[0];
    const title = text(currentRow, '.dir');
    const size = text(currentRow, '.fill-info .size');
    const logo = currentRow.querySelector('perps-coin-logo img')?.getAttribute('src');
    const style = getComputedStyle(currentRow);
    const layout = [style.padding, style.minHeight, style.gap];
    expect(title).toBe('Limit short');
    expect(size).toBe('1.2346 ETH');
    expect(text(currentRow, '.cancel')).toBe('perpsCancelOrder');
    expect(currentRow.querySelector('.order-status, .price, .time, .status')).toBeNull();

    component.setTab('orderHistory');
    component.historicalOrders = [{
      order: partialOrder, status: 'open', statusTimestamp: T,
    }];
    fixture.detectChanges();
    const historyRow = rows()[0];
    expect(text(historyRow, '.dir')).toBe(title);
    expect(text(historyRow, '.fill-info .size')).toBe(size);
    expect(historyRow.querySelector('perps-coin-logo img')?.getAttribute('src')).toBe(logo);
    const historyStyle = getComputedStyle(historyRow);
    expect([historyStyle.padding, historyStyle.minHeight, historyStyle.gap]).toEqual(layout);
    expect(text(historyRow, '.order-status')).toBe('未成交');
    expect(historyRow.querySelector('.cancel')).toBeNull();
  });

  it('数量的精度来自该行自己的市场', () => {
    // ETH 的 szDecimals 是 4；XYZ 没有市场，按数量级取精度。
    expect(text(rows()[0], '.size')).toBe('1.2346 ETH');
    expect(text(rows()[1], '.size')).toBe('1.23 XYZ');
  });

  it('当前委托和历史委托按相同规则处理类型及开平仓方向', () => {
    component.openOrders = [
      order({ side: 'B', reduceOnly: false }),
      order({ side: 'A', reduceOnly: false }),
      order({ side: 'B', reduceOnly: true, orderType: 'Stop Market' }),
      order({ side: 'A', reduceOnly: true, orderType: 'Take Profit Market' }),
    ];
    fixture.detectChanges();
    expect(rows().map((r) => text(r, '.dir'))).toEqual([
      'Limit long', 'Limit short', 'Stop market close short', 'Take profit market close long',
    ]);
  });

  it('撤单先确认，提交中禁用按钮，成功后移除对应委托', fakeAsync(() => {
    const canceled = new Subject<void>();
    const cancelOrder = jasmine.createSpy('cancelOrder').and.returnValue(canceled);
    Object.assign(TestBed.inject(ChromeService), {
      getPassword: () => Promise.resolve('password'),
    });
    Object.assign(TestBed.inject(EvmWalletService), {
      getPrivateKey: () => Promise.resolve('private-key'),
    });
    Object.assign(TestBed.inject(GlobalService), {
      snackBarTip: jasmine.createSpy('snackBarTip'),
    });
    Object.assign(TestBed.inject(PerpsExchangeWriteService), { cancelOrder });
    const button = rows()[0].querySelector<HTMLButtonElement>('.cancel');

    button.click();
    fixture.detectChanges();
    expect(button.textContent.trim()).toBe('perpsConfirmCancel');
    expect(cancelOrder).not.toHaveBeenCalled();

    button.click();
    flushMicrotasks();
    fixture.detectChanges();
    expect(cancelOrder).toHaveBeenCalledOnceWith('private-key', MARKETS[0].assetId, STOP_MARKET.oid);
    expect(button.disabled).toBeTrue();
    button.click();
    expect(cancelOrder).toHaveBeenCalledTimes(1);

    canceled.next();
    canceled.complete();
    fixture.detectChanges();
    expect(component.openOrders).toEqual([LIMIT_ON_UNKNOWN_MARKET]);
    expect(rows().length).toBe(1);
    expect(text(rows()[0], '.cancel')).toBe('perpsCancelOrder');
  }));

  it('当前委托显示币种图标，方向本身不着色', () => {
    expect(rows()[0].querySelector('perps-coin-logo img')?.getAttribute('src'))
      .toBe('assets/images/token/eth.webp');
    expect(rows()[0].querySelector('.fill-icon')).toBeFalsy();
    expect(rows()[0].querySelector('.dir.sell')).toBeFalsy();
    expect(rows()[0].querySelector('.dir.buy')).toBeFalsy();
  });

  describe('历史成交', () => {
    beforeEach(() => {
      // 数据通道推不出快照（`subscribe` 返回 EMPTY），所以这一步会走 REST 兜底。
      component.setTab('fills');
      fixture.detectChanges();
    });

    it('数量按该行所属市场的精度显示在方向下方', () => {
      expect(text(rows()[0], '.size')).toBe('1.2346 ETH');
      expect(rows()[0].querySelector('.fill-info .size')).toBeTruthy();
    });

    it('最新的一笔排在最上面', () => {
      // 交易场所按升序下发；照单全收就会把最老的一笔顶在最上面。
      expect(rows().map((r) => text(r, '.dir'))).toEqual([
        'Close Long',
        'Open Long',
        'Long > Short',
      ]);
    });

    it('成交方向直接显示接口原文', () => {
      expect(text(rows()[0], '.dir')).toBe('Close Long');
      expect(text(rows()[1], '.dir')).toBe('Open Long');
      expect(text(rows()[2], '.dir')).toBe('Long > Short');
    });

    it('显示币种图标，缺失图标时回退到币种字母', () => {
      expect(rows()[0].querySelector('perps-coin-logo img')?.getAttribute('src'))
        .toBe('assets/images/token/eth.webp');
      component.fills = [fill({ coin: 'xyz:UNKNOWN', fee: '0.01' })];
      fixture.detectChanges();
      const img = rows()[0].querySelector('perps-coin-logo img');
      expect(img?.getAttribute('src')).toContain('xyz%3AUNKNOWN');
      img?.dispatchEvent(new Event('error'));
      fixture.detectChanges();
      expect(text(rows()[0], 'perps-coin-logo')).toBe('U');
    });

    it('方向使用正文颜色，正负颜色只用于右侧金额', () => {
      expect(rows()[0].querySelector('.fill-icon')).toBeFalsy();
      expect(rows()[0].querySelector('.dir.sell')).toBeFalsy();
      expect(rows()[1].querySelector('.dir.buy')).toBeFalsy();
      expect(rows()[0].querySelector('.fill-result.negative')).toBeTruthy();
    });

    it('与测试网地址的三笔 ETH 成交一致：开仓给费用，平仓给净盈亏', () => {
      component.fills = [
        fill({ fee: '0.449968', closedPnl: '0.0' }),
        fill({ fee: '0.008487', closedPnl: '0.353' }),
        fill({ fee: '0.008646', closedPnl: '0.0' }),
      ];
      fixture.detectChanges();
      expect(rows().map((r) => text(r, '.fill-result'))).toEqual([
        '-$0.45', '+$0.34', '-$<0.01',
      ]);
      expect(rows()[0].querySelector('.fill-result.negative')).toBeTruthy();
      expect(rows()[1].querySelector('.fill-result.positive')).toBeTruthy();
    });

    it('每行右侧只有净金额，不标注费用或 PnL，也不显示价格和逐笔时间', () => {
      expect(text(rows()[0], '.fill-result')).toBe('-$12.50');
      expect(text(rows()[1], '.fill-result')).toBe('-$0.05');
      for (const r of rows()) {
        expect(r.querySelectorAll('.fill-result').length).toBe(1);
        expect(r.querySelector('.price, .time')).toBeFalsy();
        expect(r.textContent).not.toContain('PnL');
        expect(r.textContent).not.toContain('perpsFee');
      }
    });
  });

  describe('历史委托', () => {
    beforeEach(() => {
      component.setTab('orderHistory');
      fixture.detectChanges();
    });

    it('左上显示类型加方向，下面是数量，右边是状态翻译', () => {
      expect(text(rows()[0], '.dir')).toBe('Stop market close long');
      expect(text(rows()[0], '.size')).toBe('1.2346 ETH');
      expect(text(rows()[0], '.fill-result')).toBe('已取消');
      expect(text(rows()[1], '.dir')).toBe('Limit long');
      expect(text(rows()[1], '.fill-result')).toBe('brandNewStatus');
    });

    it('状态按 MetaMask 翻译，未知状态保留原文且均不使用盈亏颜色', () => {
      const statuses = [
        'filled', 'open', 'canceled', 'scheduledCancel', 'rejected', 'triggered', 'queued',
        'marginCanceled', 'siblingFilledCanceled', 'reduceOnlyCanceled',
        'badTriggerPxRejected', 'brandNewStatus',
      ];
      component.historicalOrders = statuses.map((status) => ({
        order: STOP_MARKET, status, statusTimestamp: T,
      }));
      fixture.detectChanges();
      expect(rows().map((r) => text(r, '.order-status'))).toEqual([
        '已成交', '未成交', '已取消', '已取消', '已拒绝', '已触发', '队列中',
        '已取消', '已取消', '已取消', '已拒绝', 'brandNewStatus',
      ]);
      expect(fixture.nativeElement.querySelector('.order-status.positive, .order-status.negative'))
        .toBeNull();
    });

    it('不显示价格和逐笔时间，方向用正文色', () => {
      expect(rows()[0].querySelector('perps-coin-logo img')?.getAttribute('src'))
        .toBe('assets/images/token/eth.webp');
      expect(rows()[0].querySelector('.fill-icon')).toBeFalsy();
      expect(rows()[0].querySelector('.dir.sell, .dir.buy, .price, .time')).toBeFalsy();
    });
  });

  describe('存款和提款', () => {
    beforeEach(() => {
      component.setTab('transfers');
      fixture.detectChanges();
    });

    it('左上是类型加代币，右边是带符号金额', () => {
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
      expect(rows().map((r) => text(r, '.dir'))).toEqual([
        'send USDC', 'internalTransfer USDC',
      ]);
      expect(rows()[0].querySelector('.fill-info .size')).toBeFalsy();
      expect(text(rows()[0], '.fill-result')).toBe('-$1.12');
      expect(text(rows()[1], '.fill-result')).toBe('+$999.00');
      expect(rows()[0].querySelector('.fill-result.negative')).toBeTruthy();
      expect(rows()[1].querySelector('.fill-result.positive')).toBeTruthy();
    });

    it('账本类型显示接口原文，代币跟在类型后面，不显示状态', () => {
      expect(text(rows()[0], '.dir')).toBe('deposit USDC');
      expect(rows()[0].querySelector('.fill-info .size')).toBeFalsy();
      expect(text(rows()[0], '.fill-result')).toBe('+$9.00');
      expect(rows()[0].querySelector('.fill-result.positive')).toBeTruthy();

      expect(text(rows()[1], '.dir')).toBe('spotTransfer HYPE');
      expect(text(rows()[1], '.fill-result')).toBe('-2.5 HYPE');
      expect(rows()[1].querySelector('.fill-result.negative')).toBeTruthy();
    });

    it('不显示逐笔时间和右侧费用，没有金额的行也不编造结果', () => {
      expect(rows()[0].querySelector('.price, .time')).toBeFalsy();
      expect(text(rows()[2], '.dir')).toBe('vaultCreate');
      expect(rows()[2].querySelector('.fill-info .size')).toBeFalsy();
      expect(rows()[2].querySelector('.fill-result')).toBeFalsy();
    });

    it('能解析出代币时显示币种图标，否则保留进出箭头', () => {
      expect(rows()[0].querySelector('perps-coin-logo img')?.getAttribute('src'))
        .toBe('assets/images/token/usdc.webp');
      expect(rows()[0].querySelector('.fill-icon')).toBeFalsy();
      expect(rows()[1].querySelector('perps-coin-logo')).toBeTruthy();
      expect(rows()[1].querySelector('.fill-icon')).toBeFalsy();
      expect(rows()[2].querySelector('perps-coin-logo')).toBeFalsy();
      expect(rows()[2].querySelector('.fill-icon')).toBeTruthy();
    });

    it('所有账本类型均显示原文，不根据资金流向改名', () => {
      const types = [
        'deposit', 'withdraw', 'internalTransfer', 'accountClassTransfer',
        'subAccountTransfer', 'send', 'spotTransfer', 'vaultCreate',
      ];
      component.transfers = types.flatMap((type) => [
        { time: T, hash: '0x1', delta: { type, destination: WALLET } },
        { time: T, hash: '0x2', delta: { type, destination: '0xdef' } },
      ]);
      fixture.detectChanges();
      expect(rows().map((r) => text(r, '.dir'))).toEqual(
        types.flatMap((type) => [type, type])
      );
    });
  });

  describe('资金费历史', () => {
    beforeEach(() => {
      component.setTab('funding');
      fixture.detectChanges();
    });

    it('左上是收到或支付，下面是币种，右边是带符号协议金额', () => {
      expect(rows().map((r) => text(r, '.dir'))).toEqual([
        'Paid funding fee',
        'Received funding fee',
      ]);
      expect(rows().map((r) => text(r, '.size'))).toEqual(['ETH', 'ETH']);
      expect(rows().map((r) => text(r, '.fill-result'))).toEqual([
        '-$0.005589',
        '+$0.005588',
      ]);
      expect(rows()[0].querySelector('.fill-result.negative')).toBeTruthy();
      expect(rows()[1].querySelector('.fill-result.positive')).toBeTruthy();
    });

    it('显示币种图标，不显示逐笔时间和价格', () => {
      expect(rows()[0].querySelector('perps-coin-logo img')?.getAttribute('src'))
        .toBe('assets/images/token/eth.webp');
      expect(rows()[0].querySelector('.fill-icon, .price, .time')).toBeFalsy();
    });
  });
});
