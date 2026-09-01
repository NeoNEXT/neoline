import { Component, Input, Pipe, PipeTransform } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MatDialog } from '@angular/material/dialog';
import { ActivatedRoute, Router } from '@angular/router';
import { Store } from '@ngrx/store';
import { of } from 'rxjs';

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

  beforeEach(async () => {
    account = null;
    queryParams = {};
    await TestBed.configureTestingModule({
      declarations: [
        PerpsOrderComponent,
        TranslateStubPipe,
        NegativeStubPipe,
        TooltipStubComponent,
        CoinLogoStubComponent,
      ],
      providers: [
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
            getUserFeeRates: () =>
              of({ takerRate: 0.00045, makerRate: 0.00015 }),
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
        { provide: PerpsTradeOrderService, useValue: { submit: () => of(null) } },
        {
          provide: ChromeService,
          useValue: { getStorage: () => of(null), setStorage: () => {} },
        },
        { provide: EvmWalletService, useValue: {} },
        { provide: MatDialog, useValue: { open: () => ({ afterClosed: () => of(null) }) } },
        {
          provide: PerpsMarketDatasetService,
          useValue: { watchMarketDetail: () => of(MARKET) },
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

  describe('审核与提交按钮', () => {
    it('offers review first, then the side once reviewed', () => {
      fixture.detectChanges();
      component.amount = '200';
      fixture.detectChanges();
      expect(text('.submit-wrap button')).toContain('perpsReviewOrder');

      component.review();
      fixture.detectChanges();

      expect(text('.submit-wrap button')).toContain('perpsLong');
      expect(fixture.nativeElement.querySelector('.review-tip')).not.toBeNull();
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
