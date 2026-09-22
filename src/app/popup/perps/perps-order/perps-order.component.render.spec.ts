import { Component, Input, Pipe, PipeTransform } from '@angular/core';
import { ComponentFixture, TestBed, fakeAsync, flushMicrotasks } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { MatDialog } from '@angular/material/dialog';
import { ActivatedRoute, Router } from '@angular/router';
import { Store } from '@ngrx/store';
import { BehaviorSubject, of } from 'rxjs';
import { PerpsConnectionState, PerpsCrossMarginAccount } from '@popup/_lib/perps';
import { PerpsDataChannel } from '@/app/core/services/perps/perps-data-channel.service';

import { ChromeService, EvmWalletService, GlobalService } from '@/app/core';
import { HyperliquidService } from '@/app/core/services/perps/hyperliquid.service';
import { PerpsAccountStateService } from '@/app/core/services/perps/perps-account-state.service';
import { PerpsExchangeWriteService } from '@app/core/services/perps/perps-exchange-write.service';
import { PerpsMarketDatasetService } from '@app/core/services/perps/perps-market-dataset.service';
import { PerpsTradeOrderService } from '@/app/core/services/perps/perps-trade-order.service';
import { PerpsOrderComponent } from './perps-order.component';
import { ethMarket, ethPosition } from '../perps.test-fixture';

/**
 * 渲染与接线 —— 直接构造组件的那些 spec 替代不了它们。
 *
 * 那些用例断言的是 getter，于是模板仍有空间去读别的东西。账户资金页就真栽过一次：余额那行
 * 读的是原始协议字段而不是它旁边同名的 getter，一个有资金的账户被显示成 $0.00，而周围每个
 * getter 都是对的。所以这里断言渲染出来的文本，以及订阅到达之后表单变成了什么样。
 *
 * 编排的规则不在这里重测 —— 它们落在 perps-order-composition.spec、
 * perps-order-lifecycle.spec 和 perps-order-seeding.spec 上。
 */
@Pipe({ name: 'translate' })
class TranslateStubPipe implements PipeTransform {
  transform(value: string) {
    return of(value);
  }
}

@Pipe({ name: 'perpsNegative' })
class NegativeStubPipe implements PipeTransform {
  transform(value: string) {
    return value;
  }
}

@Component({ selector: 'tooltip', template: '<ng-content></ng-content>' })
class TooltipStubComponent {
  @Input() tip: string;
  @Input() placement: string;
}

@Component({ selector: 'perps-coin-logo', template: '' })
class CoinLogoStubComponent {
  @Input() symbol: string;
  @Input() coin: string;
}

const MARKET = ethMarket({
  key: 'hl:ETH',
  coin: 'ETH',
  symbol: 'ETH',
  szDecimals: 4,
  maxLeverage: 25,
  markPxExact: '2000',
  midPxExact: '2000',
  oraclePxExact: '2000',
  prevDayPxExact: '2000',
});

const ASSET_DATA = {
  user: '0xabc',
  coin: 'ETH',
  leverage: { type: 'isolated' as const, value: 10 },
  maxTradeSzs: ['10', '10'],
  availableToTrade: ['1000', '1000'],
  markPxExact: '2000',
  markPx: 2000,
};

describe('PerpsOrderComponent 渲染与接线', () => {
  let fixture: ComponentFixture<PerpsOrderComponent>;
  let component: PerpsOrderComponent;

  /** 每个用例自己决定订阅推什么；默认是一个有市场、有容量、没有仓位的账户。 */
  let account: any;
  let queryParams: any;
  let connection: BehaviorSubject<PerpsConnectionState>;
  let markets: BehaviorSubject<typeof MARKET>;
  let crossAccount: BehaviorSubject<PerpsCrossMarginAccount>;

  beforeEach(async () => {
    account = { positions: [] };
    queryParams = {};
    connection = new BehaviorSubject<PerpsConnectionState>('live');
    markets = new BehaviorSubject(MARKET);
    crossAccount = new BehaviorSubject({ equityExact: '60', maintenanceMarginExact: '5', positions: [] });
    await TestBed.configureTestingModule({
      declarations: [
        PerpsOrderComponent,
        TranslateStubPipe,
        NegativeStubPipe,
        TooltipStubComponent,
        CoinLogoStubComponent,
      ],
      providers: [
        { provide: PerpsDataChannel, useValue: { watchConnectionState: () => connection } },
        {
          provide: ActivatedRoute,
          useValue: {
            snapshot: {
              params: { coin: 'ETH' },
              get queryParams() {
                return queryParams;
              },
            },
          },
        },
        { provide: Router, useValue: { navigateByUrl: () => {} } },
        {
          provide: Store,
          useValue: {
            select: () =>
              of({ currentWallet: { accounts: [{ address: '0xabc' }] } }),
          },
        },
        { provide: GlobalService, useValue: { snackBarTip: () => {} } },
        {
          provide: HyperliquidService,
          useValue: {
            watchActiveAssetData: () => of(ASSET_DATA),
            watchCrossMarginAccount: () => crossAccount,
            getUserFeeRates: () =>
              of({ takerRate: '0.00045', makerRate: '0.00015' }),
          },
        },
        {
          provide: PerpsAccountStateService,
          useValue: {
            watchAccount: () =>
              of({
                availability: 'live',
                account,
                missingDexes: [],
                updatedAt: 1,
              }),
            refreshAccount: () => of(null),
          },
        },
        { provide: PerpsTradeOrderService, useValue: { submit: () => of({ result: { status: 'resting' } }) } },
        {
          provide: ChromeService,
          useValue: { getStorage: () => of(null), setStorage: () => {}, getPassword: () => Promise.resolve('password') },
        },
        { provide: EvmWalletService, useValue: { getPrivateKey: () => Promise.resolve('private-key') } },
        { provide: MatDialog, useValue: { open: () => ({ afterClosed: () => of(null) }) } },
        {
          provide: PerpsMarketDatasetService,
          useValue: { watchMarketDetail: () => markets },
        },
        {
          provide: PerpsExchangeWriteService,
          useValue: { builderAddress: '', getOrderStatus: () => of(null) },
        },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(PerpsOrderComponent);
    component = fixture.componentInstance;
  });

  afterEach(() => fixture.destroy());

  const text = (selector: string): string =>
    (fixture.nativeElement.querySelector(selector)?.textContent ?? '')
      .replace(/\s+/g, ' ')
      .trim();

  describe('止盈止损', () => {
    it('reports an invalid trigger only when clicking place order, without signing or sending', () => {
      const notify = spyOn(TestBed.inject(GlobalService), 'snackBarTip');
      const submit = spyOn(TestBed.inject(PerpsTradeOrderService), 'submit');
      const unlock = spyOn(TestBed.inject(ChromeService), 'getPassword');
      fixture.detectChanges();
      component.amount = '200';
      component.setProtectionEnabled(true);
      component.setProtectionPrice('tp', '1800');
      fixture.detectChanges();
      expect(notify).not.toHaveBeenCalled();
      expect(fixture.nativeElement.querySelector('.error-tip')).toBeNull();
      expect(fixture.nativeElement.querySelector('.submit-wrap button').disabled).toBeFalse();
      fixture.nativeElement.querySelector('.submit-wrap button').click();
      expect(notify).toHaveBeenCalledWith('perpsInvalidProtection');
      expect(submit).not.toHaveBeenCalled();
      expect(unlock).not.toHaveBeenCalled();
      expect(component.submitting).toBeFalse();
    });

    it('revalidates protection if the price crosses the trigger while unlocking', async () => {
      const notify = spyOn(TestBed.inject(GlobalService), 'snackBarTip');
      const submit = spyOn(TestBed.inject(PerpsTradeOrderService), 'submit');
      fixture.detectChanges();
      component.amount = '200';
      component.setProtectionEnabled(true);
      component.setProtectionPrice('tp', '2010');
      const pending = component.submit();
      markets.next({ ...MARKET, markPxExact: '2020', midPxExact: '2020' });
      await pending;
      expect(notify).toHaveBeenCalledWith('perpsInvalidProtection');
      expect(submit).not.toHaveBeenCalled();
      expect(component.submitting).toBeFalse();
    });

    it('submits only the main order when protection is enabled but both prices are empty', async () => {
      const submit = spyOn(TestBed.inject(PerpsTradeOrderService), 'submit').and.callThrough();
      fixture.detectChanges();
      component.amount = '200';
      component.setProtectionEnabled(true);
      await component.submit();
      expect(submit).toHaveBeenCalledTimes(1);
      expect(submit.calls.mostRecent().args[1].protection).toBeUndefined();
    });

    it('uses the simplified market form and keeps protection optional', () => {
      fixture.detectChanges();
      component.amount = '200';
      fixture.detectChanges();
      expect(component.marginMode).toBe('isolated');
      expect(component.orderType).toBe('market');
      expect(fixture.nativeElement.querySelector('.order-type')).toBeNull();
      expect(fixture.nativeElement.querySelector('.margin-mode')).toBeNull();
      expect(fixture.nativeElement.querySelector('.slippage-value')).toBeNull();
      expect(fixture.nativeElement.querySelector('.protection-fields')).toBeNull();
      fixture.nativeElement.querySelector('.protection-switch').click();
      fixture.detectChanges();
      expect(component.canSubmit).toBeTrue();
      expect(component.composition.intent.protection).toBeUndefined();
      expect(fixture.nativeElement.querySelector('.protection-tip')).toBeNull();
      expect(fixture.nativeElement.querySelector('.error-tip')).toBeNull();
      expect(fixture.nativeElement.querySelectorAll('.protection-row').length).toBe(2);
      const tp: HTMLInputElement = fixture.nativeElement.querySelector('.protection-price input');
      tp.value = '2200';
      tp.dispatchEvent(new Event('input'));
      fixture.detectChanges();
      expect(component.canSubmit).toBeTrue();
      expect(component.composition.intent.protection).toEqual({ takeProfitPriceExact: '2200' });
      component.setProtectionPrice('sl', '1800');
      component.setProtectionEnabled(false);
      expect(component.composition.intent.protection).toBeUndefined();
    });

    it('opens the existing pop-ups menu to switch % and $', () => {
      fixture.detectChanges();
      fixture.nativeElement.querySelector('.protection-switch').click();
      fixture.detectChanges();
      const trigger: HTMLElement = fixture.nativeElement.querySelector('.select-unit .unit');
      expect(text('.select-unit .unit')).toContain('%');
      expect(fixture.nativeElement.querySelector('.pop-ups-menu')).toBeNull();
      trigger.click();
      fixture.detectChanges();
      const items: NodeListOf<HTMLElement> = fixture.nativeElement.querySelectorAll('.pop-ups-menu li');
      expect(items.length).toBe(2);
      expect(items[1].textContent.trim()).toBe('$');
      items[1].click();
      fixture.detectChanges();
      expect(component.protectionUnits.tp).toBe('$');
      expect(fixture.nativeElement.querySelector('.pop-ups-menu')).toBeNull();
      expect(text('.select-unit .unit')).toContain('$');
    });

    it('links price, leveraged return and USDC for both directions', () => {
      fixture.detectChanges();
      component.amount = '200';
      component.setProtectionEnabled(true);
      component.setProtectionPrice('tp', '2200');
      expect(component.protectionReturn('tp')).toBe('100');
      component.setProtectionReturn('sl', '50');
      component.finishProtectionReturn('sl');
      expect(component.stopLossPrice).toBe('1900');
      component.setSide('short');
      expect(component.canSubmit).toBeTrue();
      expect(component.composition.submittable).toBeFalse();
      component.setProtectionPrice('tp', '1900');
      component.setProtectionPrice('sl', '2100');
      expect(component.canSubmit).toBeTrue();
      component.setProtectionUnit('tp', '$');
      expect(component.protectionReturn('tp')).toBe('10');
      component.setProtectionReturn('tp', '5');
      expect(component.takeProfitPrice).toBe('1950');
    });

    it('computes $ PnL from the trigger price once an amount is set', () => {
      fixture.detectChanges();
      component.amount = '200';
      component.setProtectionEnabled(true);
      component.setProtectionUnit('sl', '$');
      component.setProtectionPrice('sl', '1800');
      expect(component.protectionReturn('sl')).toBe('20');
    });

    it('previews $ PnL from the current position when amount is empty', () => {
      account = { positions: [ethPosition({ isLong: false, sziExact: '-0.01' })] };
      fixture.detectChanges();
      component.setSide('short');
      component.setProtectionEnabled(true);
      component.setProtectionUnit('sl', '$');
      component.setProtectionPrice('sl', '2100');
      expect(component.protectionReturn('sl')).toBe('1');
    });

    it('does not attach protection when reducing or closing a position', () => {
      queryParams = { close: '1' };
      account = { positions: [ethPosition()] };
      fixture.detectChanges();
      expect(fixture.nativeElement.querySelector('.protection')).toBeNull();
      component.setProtectionEnabled(true);
      expect(component.protectionEnabled).toBeFalse();
    });
  });

  describe('保证金模式', () => {
    it('selects cross margin and updates its estimate and order intent', () => {
      account.availableBalanceExact = '1000';
      queryParams = { marginMode: 'cross' };
      fixture.detectChanges();
      component.amount = '200';
      fixture.detectChanges();
      expect(fixture.nativeElement.querySelector('.mode-options')).toBeNull();
      expect(component.composition.intent.marginMode).toBe('cross');
      expect(component.liquidationPriceText).toBe('$1,479.59');
      fixture.detectChanges();
      expect(component.composition.intent.marginMode).toBe('cross');
      expect(text('.summary')).toContain('$1,479.59');
      crossAccount.next({ equityExact: '80', maintenanceMarginExact: '5', positions: [] });
      fixture.detectChanges();
      expect(component.liquidationPriceText).toBe('$1,275.51');
      expect(text('.summary')).toContain('$1,275.51');
      fixture.destroy();
      expect(crossAccount.observed).toBeFalse();
    });

    it('keeps a cross position in cross mode and permits increasing it', () => {
      account = { availableBalanceExact: '1000', positions: [ethPosition({ leverageType: 'cross' })] };
      fixture.detectChanges();
      component.setSide('short');
      component.amount = '200';
      fixture.detectChanges();
      expect(component.marginMode).toBe('cross');
      expect(component.leverage).toBe(2);
      expect(component.canSubmit).toBeTrue();
      expect(fixture.nativeElement.querySelector('.mode-options')).toBeNull();
    });

    it('disables cross margin on an isolated-only market', () => {
      queryParams = { marginMode: 'cross' };
      markets.next({ ...MARKET, marginMode: 'noCross' });
      fixture.detectChanges();
      expect(fixture.nativeElement.querySelector('.mode-options')).toBeNull();
      expect(component.marginMode).toBe('isolated');
    });
  });

  describe('断流提示', () => {
    it('marks retained quotes stale and clears the warning on reconnect', () => {
      fixture.detectChanges();
      component.amount = '200';
      const intent = component.composition.intent;
      const price = text('.order-header .price');
      expect(fixture.nativeElement.querySelector('.stale-banner')).toBeNull();

      connection.next('stale');
      fixture.detectChanges();
      expect(text('.stale-banner')).toBe('perpsFeedStale');
      expect(text('.order-header .price')).toBe(price);
      expect(component.composition.intent).toEqual(intent);
      expect(component.canSubmit).toBeTrue();

      connection.next('live');
      markets.next({ ...MARKET, midPxExact: '2010' });
      fixture.detectChanges();
      expect(fixture.nativeElement.querySelector('.stale-banner')).toBeNull();
      expect(text('.order-header .price')).not.toBe(price);
    });

    it('shows an already stale connection when entering from a position', () => {
      connection.next('stale');
      fixture.detectChanges();
      expect(text('.stale-banner')).toBe('perpsFeedStale');
    });

    it('keeps an explicit limit order and a reduce-only exit available', () => {
      queryParams = { close: '1' };
      account = { positions: [ethPosition({
        coin: 'ETH', isLong: true, sziExact: '1', positionValueExact: '2000',
      })] };
      connection.next('stale');
      fixture.detectChanges();
      component.setOrderType('limit');
      fixture.detectChanges();
      expect(text('.stale-banner')).toBe('perpsFeedStale');
      expect(component.canSubmit).toBeTrue();
      expect(component.composition.intent.operation).toBe('close');
      expect(component.composition.intent.side).toBe('short');
      expect(component.composition.intent.orderType).toBe('limit');
    });

    it('unsubscribes the connection state when the page is destroyed', () => {
      fixture.detectChanges();
      expect(connection.observed).toBeTrue();
      fixture.destroy();
      expect(connection.observed).toBeFalse();
    });
  });

  describe('播种接线', () => {
    it('seeds the form from the frames the page subscribes to', () => {
      fixture.detectChanges();

      // 限价来自中间价、杠杆来自交易场所上报的那一个 —— 两条都得穿过订阅才到得了表单。
      expect(component.limitPrice).toBe('2000');
      expect(component.leverage).toBe(10);
    });

    it('seeds a close form from the position it is closing', () => {
      queryParams = { close: '1' };
      account = {
        positions: [
          ethPosition({
            coin: 'ETH',
            isLong: true,
            leverage: 20,
            positionValueExact: '480.125',
          }),
        ],
      };

      fixture.detectChanges();

      // 平仓站到仓位的反方向，杠杆等于持仓杠杆 —— 而不是行情帧带来的开仓缺省值。
      expect(component.side).toBe('short');
      expect(component.leverage).toBe(20);
      expect(component.amount).toBe('480.13');
      expect(text('.pair')).toBe('perpsCloseCoin');
      expect(text('.input-box .label')).toBe('perpsCloseableAmount');
      expect(text('.submit-wrap button')).toBe('perpsClose');
      expect(text('.summary')).toContain('perpsClosePnl');
      expect(text('.summary')).toContain('perpsEstimatedReceive');
      expect(text('.summary')).not.toContain('perpsReleasedMargin');
      const tips = fixture.debugElement
        .queryAll(By.css('.summary tooltip'))
        .map((node) => node.componentInstance.tip);
      expect(tips).toContain('perpsClosePnlTip');
      expect(tips).toContain('perpsEstimatedReceiveTip');
    });

    it('seeds an add form on the held side without a side toggle or leverage control', () => {
      queryParams = { add: '1' };
      account = {
        positions: [
          ethPosition({
            coin: 'ETH',
            isLong: true,
            leverage: 20,
            positionValueExact: '480.125',
          }),
        ],
      };

      fixture.detectChanges();

      expect(component.side).toBe('long');
      expect(component.leverage).toBe(20);
      expect(component.amount).toBe('');
      expect(fixture.nativeElement.querySelector('.side-toggle')).toBeNull();
      expect(fixture.nativeElement.querySelector('.leverage-head')).toBeNull();
      expect(text('.pair')).toBe('perpsAddCoin');
      expect(text('.input-box .label')).toBe('perpsAddAmount');
      expect(text('.submit-wrap button')).toBe('perpsAddPosition');
      expect(text('.close-position')).toContain('perpsMyPosition');
      expect(text('.close-position')).toContain('perpsLong');
      expect(fixture.nativeElement.querySelector('.current-position')).toBeNull();
      const positionBox = fixture.nativeElement.querySelector('.close-position');
      const available = fixture.nativeElement.querySelector('.available');
      expect(available).not.toBeNull();
      expect(
        positionBox.compareDocumentPosition(available) &
          Node.DOCUMENT_POSITION_FOLLOWING
      ).toBeTruthy();
    });
  });

  describe('金额与限价输入框', () => {
    /**
     * 输入框自己只有 130px 宽、贴在右边，而它左边那一大片看起来同样可点。
     * 整块用 `label` 包住，点哪儿都落到输入框上。
     */
    it('focuses the input from anywhere in the box', () => {
      fixture.detectChanges();
      const box: HTMLElement =
        fixture.nativeElement.querySelector('.input-box');
      const input: HTMLInputElement = box.querySelector('input');
      expect(box.tagName).toBe('LABEL');

      box.click();

      expect(document.activeElement).toBe(input);
    });

    it('keeps the box out of reach while a submission is in flight', () => {
      fixture.detectChanges();
      component.amount = '200';
      void component.submit();
      fixture.detectChanges();

      const box: HTMLElement =
        fixture.nativeElement.querySelector('.input-box');
      box.click();

      expect(document.activeElement).not.toBe(box.querySelector('input'));
    });
  });

  describe('摘要各行', () => {
    it('reads N/A before an amount is typed', () => {
      fixture.detectChanges();

      expect(text('.summary')).toContain('N/A');
    });

    it('renders the quoted numbers once an amount is typed', () => {
      fixture.detectChanges();
      component.amount = '200';
      fixture.detectChanges();

      const summary = text('.summary');
      expect(summary).not.toContain('N/A');
      expect(summary).toContain('$20');
      expect(summary).toContain('0.045%');
      expect(summary).not.toContain('0.015%');
    });
  });

  describe('挡在提交前的那一条原因', () => {
    it('says nothing while the form is still submittable', () => {
      fixture.detectChanges();
      component.amount = '200';
      fixture.detectChanges();

      expect(fixture.nativeElement.querySelector('.error-tip')).toBeNull();
    });

    it('words the one condition that blocks submission', () => {
      fixture.detectChanges();
      // 购买力是 1000 × 10；这笔远远超过。
      component.amount = '999999';
      fixture.detectChanges();

      expect(text('.error-tip')).toBe('perpsInsufficientMargin');
    });
  });

  describe('直接下单按钮', () => {
    it('submits on one click with a plain label, no confirmation sheet, and no duplicate request', fakeAsync(() => {
      const submit = spyOn(TestBed.inject(PerpsTradeOrderService), 'submit').and.callThrough();
      fixture.detectChanges();
      component.amount = '200';
      fixture.detectChanges();
      const button: HTMLButtonElement = fixture.nativeElement.querySelector('.submit-wrap button');
      expect(text('.submit-wrap button')).toBe('perpsPlaceOrder');
      button.click();
      fixture.detectChanges();
      expect(component.submitting).toBeTrue();
      expect(button.disabled).toBeTrue();
      expect(button.getAttribute('aria-busy')).toBe('true');
      expect(fixture.nativeElement.querySelector('.confirm-sheet')).toBeNull();
      button.click();
      void component.submit();
      flushMicrotasks();
      fixture.detectChanges();
      expect(submit).toHaveBeenCalledTimes(1);
      expect(submit.calls.mostRecent().args[1].requestedSizeExact).toBe('0.1');
      expect(component.submitting).toBeFalse();
      expect(button.disabled).toBeFalse();
      expect(fixture.nativeElement.querySelector('.confirm-sheet')).toBeNull();
    }));

    it('locks editable controls while submitting', () => {
      fixture.detectChanges();
      component.amount = '200';
      void component.submit();
      fixture.detectChanges();

      const inputs: HTMLInputElement[] = Array.from(
        fixture.nativeElement.querySelectorAll('input')
      );
      expect(inputs.length).toBeGreaterThan(0);
      expect(inputs.every((input) => input.disabled)).toBeTrue();
      fixture.nativeElement.querySelector('.side-toggle .option:last-child').click();
      expect(fixture.nativeElement.querySelector('.order-type')).toBeNull();
      expect(component.side).toBe('long');
      expect(component.orderType).toBe('market');
      expect(fixture.nativeElement.querySelector('.edit-slippage')).toBeNull();
      expect(fixture.nativeElement.querySelector('.protection-switch').disabled).toBeTrue();
    });

    it('disables the button while nothing can be submitted', () => {
      fixture.detectChanges();

      const button: HTMLButtonElement =
        fixture.nativeElement.querySelector('.submit-wrap button');
      expect(button.disabled).toBeTrue();
    });
  });

  describe('下落未明', () => {
    it('stays off the screen while nothing is outstanding', () => {
      fixture.detectChanges();

      expect(fixture.nativeElement.querySelector('.status-unknown')).toBeNull();
    });

    it('offers a way out once the page has spent its attempts', () => {
      fixture.detectChanges();
      // 让生命周期走到「已提交、结果未知、尝试用尽」。
      const lifecycle = (component as any).lifecycle;
      lifecycle.review({
        priceExact: '2000',
        amount: '200',
        limitPrice: '',
        side: 'long',
        orderType: 'market',
        leverage: 10,
        slippagePercent: 3,
        mode: 'open',
      });
      lifecycle.beginSubmit(true);
      lifecycle.unresolved('0x00000000000000000000000000000001');
      lifecycle.dispose();
      (lifecycle as any).state = {
        kind: 'unknown',
        cloid: '0x00000000000000000000000000000001',
        resolving: false,
        attemptsLeft: 0,
      };
      fixture.detectChanges();

      expect(
        fixture.nativeElement.querySelector('.status-unknown')
      ).not.toBeNull();
      expect(text('.status-unknown')).toContain('perpsExecutionStatusUnknown');
    });
  });
});
