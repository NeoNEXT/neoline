import { Component, EventEmitter, Input, Output, Pipe, PipeTransform } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { BehaviorSubject, of, Subject, throwError } from 'rxjs';

import { ChromeService } from '@/app/core';
import { PerpsCandleDatasetService } from '@/app/core/services/perps/perps-candle-dataset.service';
import { PerpsCandleDatasetState } from '@/app/core/services/perps/perps-candle-dataset';
import { PerpsDataChannel } from '@app/core/services/perps/perps-data-channel.service';
import { PerpsMarketDatasetService } from '@app/core/services/perps/perps-market-dataset.service';
import { PerpsMarket } from '@popup/_lib/perps';
import { PERPS_FORMAT_PIPES } from '../perps-format.pipe';
import { ethMarket } from '../perps.test-fixture';
import { PerpsMarketComponent } from './perps-market.component';

/**
 * 模板 —— 直接构造组件的那些 spec 看不见它。
 *
 * 它们断言的是 `marketStatus` 的取值，而屏幕上把三种取值读成什么，是模板自己的事：
 * 失败态曾经和加载态长得一模一样，因为骨架屏挂的是 `*ngIf="market; else …"`，
 * 而 `market` 在「还没到」和「到不了」两种情况下都是 `undefined`。那条 `else` 编译得过、
 * getter 用例也全绿，只是屏幕在一条「无法加载」下面继续承诺数字马上就来。
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
  @Output() marketSelected = new EventEmitter<string>();
}

@Component({ selector: 'perps-chart', template: '' })
class ChartStubComponent {
  @Input() candles: any[] = [];
  @Input() loading = false;
  @Input() priceDecimals = 4;
  @Input() seriesKey = '';
  @Output() needEarlier = new EventEmitter<void>();
}

@Component({ selector: 'tooltip', template: '<ng-content></ng-content>' })
class TooltipStubComponent {
  @Input() tip: string;
  @Input() placement: string;
}

const LOADING_CANDLES: PerpsCandleDatasetState = {
  availability: 'loading',
  candles: [],
  updatedAt: null,
};

describe('PerpsMarketComponent 渲染', () => {
  let fixture: ComponentFixture<PerpsMarketComponent>;
  let component: PerpsMarketComponent;
  let params: BehaviorSubject<any>;
  /** 每个用例自己决定这次读取的答复：一直沉默、一个市场，或者一次失败。 */
  let detail: () => any;
  let watchMarketDetail: jasmine.Spy;

  beforeEach(async () => {
    params = new BehaviorSubject<any>({ coin: 'ETH' });
    detail = () => new Subject<PerpsMarket | null>();
    watchMarketDetail = jasmine
      .createSpy('watchMarketDetail')
      .and.callFake(() => detail());

    await TestBed.configureTestingModule({
      declarations: [
        PerpsMarketComponent,
        TranslateStubPipe,
        CoinLogoStubComponent,
        MarketListStubComponent,
        ChartStubComponent,
        TooltipStubComponent,
        ...PERPS_FORMAT_PIPES,
      ],
      imports: [FormsModule],
      providers: [
        { provide: ActivatedRoute, useValue: { params } },
        { provide: Router, useValue: { navigateByUrl: () => undefined } },
        {
          provide: ChromeService,
          useValue: {
            getStorage: () => of('15m'),
            setStorage: () => undefined,
          },
        },
        {
          provide: PerpsCandleDatasetService,
          useValue: {
            watchDataset: () => of(LOADING_CANDLES),
            loadEarlier: () => undefined,
          },
        },
        {
          provide: PerpsDataChannel,
          useValue: { watchConnectionState: () => of('live') },
        },
        { provide: PerpsMarketDatasetService, useValue: { watchMarketDetail } },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(PerpsMarketComponent);
    component = fixture.componentInstance;
  });

  afterEach(() => fixture.destroy());

  const skeletons = () =>
    fixture.nativeElement.querySelectorAll('.skeleton-bar').length;
  const text = (selector: string): string =>
    (fixture.nativeElement.querySelector(selector)?.textContent ?? '')
      .replace(/\s+/g, ' ')
      .trim();

  it('places a skeleton where a number is on its way', () => {
    fixture.detectChanges();

    // 价格一条，统计四行各两条。
    expect(skeletons()).toBe(9);
  });

  it('stops promising numbers once the answer is that they cannot be had', () => {
    detail = () => throwError(() => new Error('429'));

    fixture.detectChanges();

    expect(component.marketStatus).toBe('error');
    // 在一条「无法加载」下面继续呼吸的骨架，说的是「马上就来」。
    expect(skeletons()).toBe(0);
    // 底下什么都没有的小标题同样是一句承诺。
    expect(text('.section-title')).toBe('');
    expect(text('.page-notice')).toContain('perpsLoadFailed');
  });

  it('lets a market with no mid through', () => {
    detail = () => of(ethMarket({ midPxExact: null, markPxExact: '12.5' }));

    fixture.detectChanges();

    const buttons = fixture.nativeElement.querySelectorAll(
      '.trade-actions button'
    );
    expect(buttons.length).toBe(2);
    // 限价单的价格是用户自己输的，所以这道门不该关；关的话，首页 tab 的持仓卡片
    // 通往同一个表单，这道门本来也拦不住。
    expect([...buttons].some((b: any) => b.disabled)).toBeFalse();
    expect(fixture.nativeElement.querySelector('.entry-blocked')).toBeNull();
  });

  it('drops the skeletons once the market is on screen', () => {
    detail = () => of(ethMarket({ midPxExact: '1875.75', szDecimals: 4 }));

    fixture.detectChanges();

    expect(skeletons()).toBe(0);
    expect(text('.price-block .price')).toBe('$1,875.75');
  });

  it('closes the long-interval menu on a click landing elsewhere', () => {
    detail = () => of(ethMarket());
    fixture.detectChanges();

    fixture.nativeElement
      .querySelector('.interval-select')
      .dispatchEvent(new MouseEvent('click', { bubbles: true }));
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.interval-menu')).not.toBeNull();

    // 同一屏上三个下拉，关掉它们的方式必须只有一种。
    document.body.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('.interval-menu')).toBeNull();
  });
});
