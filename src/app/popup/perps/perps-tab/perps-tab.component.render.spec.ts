import { Component, Input, Pipe, PipeTransform } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { Router } from '@angular/router';
import { Store } from '@ngrx/store';
import { BehaviorSubject, of } from 'rxjs';

import { PerpsAccountStateService } from '@/app/core/services/perps/perps-account-state.service';
import { PerpsDataChannel } from '@app/core/services/perps/perps-data-channel.service';
import { PerpsMarketDatasetService } from '@app/core/services/perps/perps-market-dataset.service';
import { PERPS_FORMAT_PIPES } from '../perps-format.pipe';
import { PerpsTabComponent } from './perps-tab.component';
import { ethMarket, ethPosition } from '../perps.test-fixture';

/**
 * 模板与接线 —— 直接构造组件的那些 spec 覆盖不到它们。
 *
 * 它们断言的是 getter，于是模板仍有空间去调一个并不存在的东西。持仓卡片就真栽过一次：
 * 市场列表被抽成独立组件时，`toMarket` 跟着搬走了，卡片上的 `(click)="toMarket(...)"`
 * 被落下，点一下就抛 `TypeError`。编译期抓不到 —— 这个绑定在 `*ngFor` 的内嵌视图里，
 * 而项目没有开 `strictTemplates`，Ivy 的基础模式不检查内嵌视图。
 *
 * 所以这里把带仓位的卡片真的渲染出来并点下去。格式化管道用真的，不打桩：这一页栽过的
 * 两次都发生在「读到了什么」而不是「怎么格式化」上，桩会把这段路一起遮掉。
 */
@Pipe({ name: 'translate' })
class TranslateStubPipe implements PipeTransform {
  transform(value: string) {
    return of(value);
  }
}

@Component({ selector: 'perps-coin-logo', template: '' })
class CoinLogoStubComponent {
  @Input() symbol: string;
  @Input() coin: string;
}

@Component({ selector: 'perps-market-list', template: '' })
class MarketListStubComponent {
  @Input() keyword = '';
  @Input() showSort = false;
  @Input() activeCoin = '';
}

/** 同一个符号在两个 DEX 上、精度不同 —— tab 必须按主键而不是符号去定位。 */
const MARKETS = [
  ethMarket({ key: 'hl:ETH', coin: 'ETH', symbol: 'ETH', szDecimals: 2 }),
  ethMarket({
    key: 'neol:IWM',
    dex: 'neol',
    coin: 'neol:IWM',
    symbol: 'IWM',
    szDecimals: 4,
  }),
];

/** 一个 HIP-3 空头仓位：协议币种带 `dex:` 前缀，符号不带。 */
const HIP3_POSITION = ethPosition({
  key: 'neol:IWM',
  dex: 'neol',
  coin: 'neol:IWM',
  symbol: 'IWM',
  sziExact: '-1.23456',
  unrealizedPnlExact: '0.34',
  returnOnEquityExact: '0.035',
  isLong: false,
});

describe('PerpsTabComponent 渲染与接线', () => {
  let fixture: ComponentFixture<PerpsTabComponent>;
  let component: PerpsTabComponent;
  let navigateByUrl: jasmine.Spy;

  /** 每个用例自己决定订阅推什么；默认是一个有一笔 HIP-3 仓位的统一账户。 */
  let account: any;
  let availability: string;
  let marketState: BehaviorSubject<any>;

  beforeEach(async () => {
    account = {
      unified: true,
      abstractionMode: 'unifiedAccount',
      accountValueExact: '1000',
      totalBalanceExact: '1000',
      totalMarginUsedExact: '200',
      availableBalanceExact: '800',
      spotUsdcExact: '0',
      marginRatioExact: '20',
      marginRatioDex: '',
      missingDexes: [],
      positions: [HIP3_POSITION],
    };
    availability = 'live';
    // 行情和账户分开到达，市场先空着 —— 首屏就是这个样子。
    marketState = new BehaviorSubject({
      availability: 'live',
      markets: [],
      updatedAt: Date.now(),
    });
    navigateByUrl = jasmine.createSpy('navigateByUrl');

    await TestBed.configureTestingModule({
      declarations: [
        PerpsTabComponent,
        TranslateStubPipe,
        CoinLogoStubComponent,
        MarketListStubComponent,
        ...PERPS_FORMAT_PIPES,
      ],
      providers: [
        { provide: Router, useValue: { navigateByUrl } },
        {
          provide: Store,
          useValue: {
            select: () =>
              of({ currentWallet: { accounts: [{ address: '0xabc' }] } }),
          },
        },
        {
          provide: PerpsMarketDatasetService,
          useValue: { watchMarkets: () => marketState },
        },
        {
          provide: PerpsAccountStateService,
          useValue: {
            watchAggregatedAccount: () =>
              of({ availability, account, updatedAt: 1 }),
          },
        },
        {
          provide: PerpsDataChannel,
          useValue: { watchConnectionState: () => of('open') },
        },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(PerpsTabComponent);
    component = fixture.componentInstance;
  });

  afterEach(() => fixture.destroy());

  const card = () => fixture.debugElement.query(By.css('.position-card'));
  const button = (selector: string): HTMLButtonElement =>
    fixture.nativeElement.querySelector(`.position-actions button.${selector}`);
  const text = (selector: string): string =>
    (fixture.nativeElement.querySelector(selector)?.textContent ?? '')
      .replace(/\s+/g, ' ')
      .trim();

  /** 快照到达，携带各市场的精度。 */
  const deliverMarkets = () => {
    marketState.next({
      availability: 'live',
      markets: MARKETS,
      updatedAt: Date.now(),
    });
    fixture.detectChanges();
  };

  describe('账户卡', () => {
    it('renders the account totals it has', () => {
      fixture.detectChanges();

      expect(text('.card-value')).toBe('$1,000');
      expect(text('.card-margin')).toBe(
        'perpsAvailableMargin $800 · perpsUsedMargin $200'
      );
    });

    // 一行里一半承认不知道、另一半报个 $0，读起来就是「你没占用保证金」—— 而这时候
    // 我们其实什么都还不知道。
    it('says it does not know yet on both halves of the margin row', () => {
      account = null;
      availability = 'loading';
      fixture.detectChanges();

      expect(text('.card-margin')).toBe(
        'perpsAvailableMargin -- · perpsUsedMargin --'
      );
      expect(text('.card-margin')).not.toContain('$0');
    });
  });

  describe('持仓卡片', () => {
    it('renders a card for each position on the account', () => {
      fixture.detectChanges();

      expect(
        fixture.debugElement.queryAll(By.css('.position-card')).length
      ).toBe(1);
      expect(text('.position-head')).toContain('IWM');
      expect(text('.position-pnl')).toBe('+$0.34 +3.5%');
    });

    // 卡片主体不导航：操作全在两个按钮上。绑一个组件没有的方法，点下去就是运行时 TypeError。
    it('leaves the card body itself without a click handler', () => {
      fixture.detectChanges();

      expect(card().listeners.map((listener) => listener.name)).not.toContain(
        'click'
      );

      card().nativeElement.click();
      fixture.detectChanges();

      expect(navigateByUrl).not.toHaveBeenCalled();
    });

    // 加仓沿用仓位的方向，并且走协议币种 —— HIP-3 上 `neol:IWM` 和 `IWM` 是两个市场。
    it('routes adding to the position by its protocol coin', () => {
      fixture.detectChanges();

      button('plain').click();

      expect(navigateByUrl).toHaveBeenCalledWith(
        '/popup/perps/order/neol:IWM?side=short'
      );
    });

    it('routes closing the position by its protocol coin', () => {
      fixture.detectChanges();

      button('danger').click();

      expect(navigateByUrl).toHaveBeenCalledWith(
        '/popup/perps/order/neol:IWM?close=1'
      );
    });

    it('keeps its cards off the screen while the account has no positions', () => {
      account.positions = [];
      fixture.detectChanges();

      expect(fixture.nativeElement.querySelector('.position-card')).toBeNull();
    });
  });

  describe('市场接线', () => {
    // 数量的精度归市场管，而市场是从 tab 自己那条行情订阅上来的 —— 不再由内嵌列表转发。
    it('takes the precision for position sizes from its own market feed', () => {
      fixture.detectChanges();
      // 快照还没到，精度只能由数量级决定。
      expect(text('.position-meta')).toContain('1.23 IWM');

      deliverMarkets();

      expect(component.markets).toEqual(MARKETS);
      expect(text('.position-meta')).toContain('1.2346 IWM');
    });
  });
});
