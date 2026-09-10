import { BehaviorSubject, of } from 'rxjs';
import { fakeAsync, flushMicrotasks, tick } from '@angular/core/testing';

import { PerpsAccount } from '@popup/_lib/perps';
import { NotificationService } from '@/app/core';

import { PerpsOrderComponent } from './perps-order.component';
import { PerpsOrderFacts } from './perps-order-composition';
import { ethMarket } from '../perps.test-fixture';

/**
 * 页面，架在一份它不必自己搭建的组合之上。
 *
 * 留在这里的是页面自己决定的事：读数如何措辞，以及拿交易场所给回来的答案做什么。
 * 这些读数所遵循的规则写在 perps-order-composition.spec 里。
 */
function component(builderAddress = ''): PerpsOrderComponent {
  return new PerpsOrderComponent(
    null,
    null,
    null,
    null,
    null,
    null,
    null,
    null,
    null,
    null,
      null,
      { builderAddress } as any,
      { watchConnectionState: () => of('live') } as any
    );
}

const facts = (overrides: Partial<PerpsOrderFacts> = {}): PerpsOrderFacts => ({
  coin: 'ETH',
  market: {
    status: 'ready',
    market: ethMarket({
      szDecimals: 4,
      markPxExact: '2000',
      midPxExact: '2000',
      oraclePxExact: '2000',
      prevDayPxExact: '2000',
    }),
  },
  account: {
    availability: 'live',
    account: { positions: [] } as PerpsAccount,
    missingDexes: [],
    updatedAt: 1,
  },
  activeAssetData: {
    user: '0xabc',
    coin: 'ETH',
    leverage: { type: 'isolated', value: 10 },
    maxTradeSzs: ['10', '10'],
    availableToTrade: ['1000', '1000'],
    markPxExact: '2000',
    markPx: 2000,
  },
  feeRates: { takerRate: 0.00045, makerRate: 0.00015, builderRate: 0 },
  ...overrides,
});

describe('PerpsOrderComponent summary rows', () => {
  /**
   * 表单一出现，摘要就已经在屏幕上，所以空的金额输入框必须读作「还没有订单」，
   * 而不是一笔金额为零的订单。
   */
  it('reads N/A on every summary row before an amount is typed', () => {
    const value = component();
    value.facts = facts();
    value.leverage = 10;

    expect(value.preview).toBeNull();
    expect(value.liquidationPriceText).toBe('N/A');
    expect(value.marginText).toBe('N/A');
    // 没有订单也能知道费率；不知道的只是它折成多少钱。
    expect(value.feeText).toBe('0.045%');
  });

  it('quotes the order once an amount is typed', () => {
    const value = component();
    value.facts = facts();
    value.leverage = 10;
    value.amount = '200';

    expect(value.marginText).toBe('$20');
    // 是手续费的金额，而不是过去缺字段时渲染出来的 `--`。
    expect(value.feeText).toBe('0.045% ($0.09)');
    expect(value.liquidationPriceText).toContain('$');
  });

  it('quotes the maker side too, for a limit order', () => {
    const value = component();
    value.facts = facts();
    value.leverage = 10;
    value.amount = '200';
    value.orderType = 'limit';
    value.limitPrice = '2000';

    expect(value.quotesBothFeeSides).toBeTrue();
    expect(value.makerFeeText).toBe('0.015% ($0.03)');
    expect(value.feeText).toBe('0.045% ($0.09)');
  });

  // 返佣是付给账户的钱。把它显示成 "$0.00" 等于抹掉成交实际返还的钱，
  // 所以正负号要一路带到这一行上。
  it('shows a negative maker rate as a rebate rather than zero', () => {
    const value = component();
    value.facts = facts({
      feeRates: { takerRate: 0.00045, makerRate: -0.00002, builderRate: 0 },
    });
    value.leverage = 10;
    value.amount = '200';
    value.orderType = 'limit';
    value.limitPrice = '2000';

    expect(value.makerFeeIsRebate).toBeTrue();
    expect(value.makerFeeText).toBe('-0.002% (-$<0.01)');
  });

  // 两行报的都是「从账户里出去多少」，所以 NeoLine 抽的那份两边都算在内。
  it('includes the builder fee on both sides', () => {
    const value = component('0xbuilder');
    value.facts = facts({
      feeRates: { takerRate: 0.00045, makerRate: 0.00015, builderRate: 0.00045 },
    });
    value.leverage = 10;
    value.amount = '200';
    value.orderType = 'limit';
    value.limitPrice = '2000';

    expect(value.makerFeeText).toBe('0.06% ($0.12)');
    expect(value.feeText).toBe('0.09% ($0.18)');
  });

  /**
   * HIP-3 市场的费率由部署方设置决定：这一行报的必须是这个市场上的费率 —— 这里是账户费率的
   * 两倍再打一折 —— 而不是账户费率本身。
   */
  it('quotes a HIP-3 market at its own rate', () => {
    const value = component();
    value.facts = facts({
      coin: 'xyz:ETH',
      market: {
        status: 'ready',
        market: ethMarket({
          key: 'xyz:ETH',
          dex: 'xyz',
          coin: 'xyz:ETH',
          symbol: 'ETH',
          markPxExact: '2000',
          midPxExact: '2000',
          oraclePxExact: '2000',
          prevDayPxExact: '2000',
          deployerFeeScaleExact: '1',
          growthMode: true,
        }),
      },
    });
    value.leverage = 10;
    value.amount = '200';
    value.orderType = 'limit';
    value.limitPrice = '2000';

    expect(value.feeEstimateUnavailable).toBeFalse();
    expect(value.formattedTakerFeeRate).toBe('0.009%');
    expect(value.makerFeeText).toBe('0.003% ($<0.01)');
    expect(value.feeText).toBe('0.009% ($0.02)');
  });

  /** 模块负责陈述条件；只有页面负责为它措辞。 */
  it('words the one condition blocking submission', () => {
    const value = component();
    value.facts = facts({
      account: {
        availability: 'unavailable',
        account: null,
        missingDexes: [],
        updatedAt: null,
      },
    });
    value.amount = '200';

    expect(value.orderUnavailableReason).toBe('perpsLoadFailed');

    value.facts = facts();

    expect(value.orderUnavailableReason).toBeNull();
  });
});

/**
 * 这份组合在一轮变更检测里会被十六处读取，所以页面对它做了记忆化。值得防的是那种安静的
 * 失败：某个读数一直用用户输入之前的旧值来作答。
 */
describe('PerpsOrderComponent composition memo', () => {
  it('answers the same reading while nothing has changed', () => {
    const value = component();
    value.facts = facts();
    value.amount = '200';

    expect(value.composition).toBe(value.composition);
  });

  it('re-reads when the user changes the form', () => {
    const value = component();
    value.facts = facts();
    value.amount = '200';
    const before = value.composition;

    value.amount = '400';

    expect(value.composition).not.toBe(before);
    expect(value.composition.preview.marginExact).not.toBe(
      before.preview.marginExact
    );
  });

  it('re-reads when a frame brings new facts', () => {
    const value = component();
    value.facts = facts();
    value.amount = '200';
    const before = value.composition;

    value.facts = facts({
      market: {
        status: 'ready',
        market: ethMarket({ szDecimals: 4, midPxExact: '4000' }),
      },
    });

    expect(value.composition.orderPriceExact).toBe('4000');
    expect(value.composition.preview.sizeExact).not.toBe(
      before.preview.sizeExact
    );
  });
});

describe('PerpsOrderComponent submission seam', () => {
  it('passes the composed intent to the trade-order module', async () => {
    const router = jasmine.createSpyObj('Router', ['navigateByUrl']);
    const global = jasmine.createSpyObj('GlobalService', ['snackBarTip']);
    const accountStates = jasmine.createSpyObj('PerpsAccountStateService', [
      'refreshAccount',
    ]);
    const tradeOrders = jasmine.createSpyObj('PerpsTradeOrderService', [
      'submit',
    ]);
    const chrome = jasmine.createSpyObj('ChromeService', ['getPassword']);
    const evmWallet = jasmine.createSpyObj('EvmWalletService', [
      'getPrivateKey',
    ]);
    chrome.getPassword.and.returnValue(Promise.resolve('password'));
    evmWallet.getPrivateKey.and.returnValue(Promise.resolve('private-key'));
    tradeOrders.submit.and.returnValue(
      of({
        kind: 'order-submitted',
        result: {
          status: 'filled',
          cloid: '0x00000000000000000000000000000001',
          submittedSizeExact: '1',
          filledSizeExact: '1',
          remainingSizeExact: '0',
        },
      })
    );
    const value = new PerpsOrderComponent(
      null,
      router,
      null,
      global,
      null,
      accountStates,
      tradeOrders,
      chrome,
      evmWallet,
      null,
      null,
      { builderAddress: '' } as any,
      { watchConnectionState: () => of('live') } as any
    );
    value.facts = facts({
      market: {
        status: 'ready',
        market: ethMarket({
          key: 'hl:ETH',
          coin: 'ETH',
          symbol: 'ETH',
          assetId: 3,
          szDecimals: 2,
          maxLeverage: 20,
          midPxExact: '100',
        }),
      },
      activeAssetData: {
        user: '0xabc',
        coin: 'ETH',
        leverage: { type: 'isolated', value: 5 },
        maxTradeSzs: ['10', '10'],
        availableToTrade: ['100', '100'],
        markPxExact: '100',
        markPx: 100,
      },
    });
    value.leverage = 5;
    value.amount = '100';
    (value as any).wallet = { accounts: [{ extra: {} }] };

    value.review();
    await value.submit();

    const submitted = tradeOrders.submit.calls.mostRecent().args[1];
    expect(submitted).toEqual({
      market: {
        key: 'hl:ETH',
        coin: 'ETH',
        dex: '',
        assetId: 3,
        szDecimals: 2,
        maxLeverage: 20,
      },
      operation: 'open',
      side: 'long',
      referencePriceExact: '100',
      requestedSizeExact: '1',
      leverage: 5,
      orderType: 'market',
      maxSlippagePercent: value.slippagePercent,
    });
    // 这些从来不由页面决定：它们属于交易订单模块。
    expect((submitted as any).reduceOnly).toBeUndefined();
    expect((submitted as any).timeInForce).toBeUndefined();
    expect((submitted as any).cloid).toBeUndefined();
    expect((submitted as any).currentLeverage).toBeUndefined();
    expect(router.navigateByUrl).toHaveBeenCalled();
  });
});


/**
 * 审核态，架在一条持续推送的行情订阅之上。
 *
 * `watchActiveAssetData` 是 REST 播种 + `activeAssetData` 频道的实时订阅，所以「帧到达」
 * 在这张页面上是常态而不是边界情况。这里断言的是那条帧触发的路径不碰审核态 —— 它归
 * 提交生命周期管，等那个模块落地后这些用例跟着搬过去。
 */
describe('PerpsOrderComponent review under live frames', () => {
  /** 同一个市场，容量换成交易场所此刻上报的那个。 */
  const capacity = (availableToTrade: string) =>
    facts({
      activeAssetData: {
        user: '0xabc',
        coin: 'ETH',
        leverage: { type: 'isolated', value: 10 },
        maxTradeSzs: ['10', '10'],
        availableToTrade: [availableToTrade, availableToTrade],
        markPxExact: '2000',
        markPx: 2000,
      },
    });

  /** 一张已经按 50% 定好金额、并且通过了审核的表单。 */
  const reviewed = (): PerpsOrderComponent => {
    const value = component();
    value.facts = capacity('1000');
    value.leverage = 10;
    value.setPercent(50);
    value.review();
    return value;
  };

  it('holds the review when a frame repricing the percentage arrives', () => {
    const value = reviewed();
    expect(value.reviewing).toBeTrue();
    expect(value.amount).toBe('5000');

    // 购买力掉了一半，随后一帧到达。
    value.facts = capacity('500');
    (value as any).repricePercent();

    // 用户批准的是屏幕上那个美元数，所以它必须原样留着 —— 而审核态必须活下来：
    // CTA 绑的是 `reviewing ? submit() : review()`，掉回编辑态会让下一次点击变成重新审核。
    expect(value.reviewing).toBeTrue();
    expect(value.amount).toBe('5000');
  });

  it('reprices the percentage while the user is still composing', () => {
    const value = component();
    value.facts = capacity('1000');
    value.leverage = 10;
    value.setPercent(50);
    expect(value.amount).toBe('5000');

    value.facts = capacity('500');
    (value as any).repricePercent();

    // 还没进入审核态，50% 就该跟着当前购买力走。
    expect(value.amount).toBe('2500');
  });

  /**
   * 上面三条断言的是那两条路各自的行为。这一条断言的是**接线** —— 也就是缺陷本身：
   * 订阅回调过去调的是 `setPercent`，而它会作废审核。行为对了但接线还连在旧方法上，
   * 用户照样会被行情帧退回编辑态，所以这条必须从订阅那一端进去。
   */
  it('holds the review across a user-fee response', () => {
    const hyperliquid = {
      getUserFeeRates: () => of({ takerRate: 0.0003, makerRate: 0.0001 }),
    } as any;
    const value = new PerpsOrderComponent(
      null,
      null,
      null,
      null,
      hyperliquid,
      null,
      null,
      null,
      null,
      null,
      null,
      { builderAddress: '' } as any,
      { watchConnectionState: () => of('live') } as any
    );
    value.facts = capacity('1000');
    value.leverage = 10;
    value.setPercent(50);
    value.review();
    (value as any).address = '0xabc';

    (value as any).loadUserFeeRates();

    expect(value.reviewing).toBeTrue();
    expect(value.amount).toBe('5000');
  });

  it('still discards the review when the user moves the percentage', () => {
    const value = reviewed();

    value.setPercent(25);

    // 冻结只针对帧。用户自己改了金额，就该重新审核他改出来的东西。
    expect(value.reviewing).toBeFalse();
    expect(value.amount).toBe('2500');
  });
});

/**
 * 用户已经离开了页面，而那笔订单还在路上。
 *
 * 提交**不会**被退订：掐掉一个已经签名发出的请求，换来的是一笔可能已经到达交易场所、
 * 而客户端再也读不到结果的订单。所以请求照常跑完，只是它的结局不再动这个界面。
 */
describe('PerpsOrderComponent 离开页面之后', () => {
  it('does not navigate away once the page is gone', async () => {
    const router = jasmine.createSpyObj('Router', ['navigateByUrl']);
    const global = jasmine.createSpyObj('GlobalService', ['snackBarTip']);
    const tradeOrders = jasmine.createSpyObj('PerpsTradeOrderService', [
      'submit',
    ]);
    const chrome = jasmine.createSpyObj('ChromeService', ['getPassword']);
    const evmWallet = jasmine.createSpyObj('EvmWalletService', [
      'getPrivateKey',
    ]);
    chrome.getPassword.and.returnValue(Promise.resolve('password'));
    evmWallet.getPrivateKey.and.returnValue(Promise.resolve('private-key'));

    const value = new PerpsOrderComponent(
      null,
      router,
      null,
      global,
      null,
      { refreshAccount: () => of(null) } as any,
      tradeOrders,
      chrome,
      evmWallet,
      null,
      null,
      { builderAddress: '' } as any,
      { watchConnectionState: () => of('live') } as any
    );
    // 订单发出去之后、结果回来之前，用户返回了。
    tradeOrders.submit.and.callFake(() => {
      value.ngOnDestroy();
      return of({
        kind: 'order-submitted',
        result: {
          status: 'filled',
          cloid: '0x00000000000000000000000000000001',
          submittedSizeExact: '1',
          filledSizeExact: '1',
          remainingSizeExact: '0',
        },
      });
    });
    value.facts = facts({
      market: {
        status: 'ready',
        market: ethMarket({
          key: 'hl:ETH',
          coin: 'ETH',
          symbol: 'ETH',
          assetId: 3,
          szDecimals: 2,
          maxLeverage: 20,
          midPxExact: '100',
        }),
      },
      activeAssetData: {
        user: '0xabc',
        coin: 'ETH',
        leverage: { type: 'isolated', value: 5 },
        maxTradeSzs: ['10', '10'],
        availableToTrade: ['100', '100'],
        markPxExact: '100',
        markPx: 100,
      },
    });
    value.leverage = 5;
    value.amount = '100';
    (value as any).wallet = { accounts: [{ extra: {} }] };

    value.review();
    await value.submit();

    // 订单确实发出去了 —— 被掐掉的话，它的下落就再也没人知道。
    expect(tradeOrders.submit).toHaveBeenCalled();
    // 但用户不会被从他现在所在的界面拽回永续首页。
    expect(router.navigateByUrl).not.toHaveBeenCalled();
    expect(global.snackBarTip).not.toHaveBeenCalled();
  });
});


/**
 * 每一条会弹出去的提示，背后都得有一句真话。
 *
 * `global.snackBarTip(key)` 查的是 `notification.service.ts` 里那份与 `_locales` 平行的
 * 硬编码表，`content[key] || key` 查不到就把 key 名当提示弹给用户 —— 而这里的 key 是从
 * `result.status` 索引出来的，TypeScript 看不见，`tsc` 也就守不住。这一页栽过两次：
 * 第一次补的是三条字面量 key，两条不是字面量的（成交结果那六条、跨行写的杠杆那条）
 * 被单行 grep 一起漏掉，于是**下单成交**那一刻用户看到的是英文字符串 `perpsOrderFilled`。
 *
 * 所以 key 在这里不是抄一份常量表，而是从真实的提交路径上取回来的。
 */
describe('PerpsOrderComponent 提示文案', () => {
  const STATUSES = [
    'filled',
    'partial',
    'resting',
    'unfilled',
    'rejected',
    'unknown',
  ];

  /** 走一遍提交，把这个结果状态实际弹出去的那个 key 取回来。 */
  async function keyRaisedBy(status: string): Promise<string> {
    const global = jasmine.createSpyObj('GlobalService', ['snackBarTip']);
    const tradeOrders = {
      submit: () =>
        of({
          kind: 'order-submitted',
          result: {
            status,
            cloid: '0x00000000000000000000000000000001',
            submittedSizeExact: '1',
            filledSizeExact: status === 'filled' ? '1' : '0',
            remainingSizeExact: status === 'filled' ? '0' : '1',
          },
        }),
    };
    const value = new PerpsOrderComponent(
      null,
      { navigateByUrl: () => {} } as any,
      null,
      global,
      null,
      { refreshAccount: () => of(null) } as any,
      tradeOrders as any,
      { getPassword: () => Promise.resolve('password') } as any,
      { getPrivateKey: () => Promise.resolve('private-key') } as any,
      null,
      null,
      { builderAddress: '' } as any,
      { watchConnectionState: () => of('live') } as any
    );
    (value as any).address = '0xabc';
    (value as any).wallet = { accounts: [{ extra: {} }] };
    value.facts = facts({
      market: {
        status: 'ready',
        market: ethMarket({
          key: 'hl:ETH',
          coin: 'ETH',
          symbol: 'ETH',
          assetId: 3,
          szDecimals: 2,
          maxLeverage: 20,
          midPxExact: '100',
        }),
      },
      activeAssetData: {
        user: '0xabc',
        coin: 'ETH',
        leverage: { type: 'isolated', value: 5 },
        maxTradeSzs: ['10', '10'],
        availableToTrade: ['100', '100'],
        markPxExact: '100',
        markPx: 100,
      },
    });
    value.leverage = 5;
    value.amount = '100';

    value.review();
    await value.submit();
    value.ngOnDestroy();

    return global.snackBarTip.calls.mostRecent().args[0];
  }

  it('has real wording behind every order outcome it reports', async () => {
    const notification = new NotificationService({
      langSub: new BehaviorSubject('en'),
    } as any);

    for (const status of STATUSES) {
      const key = await keyRaisedBy(status);
      expect(key)
        .withContext(`${status} raises a key with no wording behind it`)
        .toBeTruthy();
      expect(notification.content[key])
        .withContext(`${key} (${status}) is missing from NotificationContent`)
        .toBeTruthy();
    }
  });

  /** 跨行写的那条字面量：单行 grep 看不见它，所以它也漏过一轮。 */
  it('has wording for a refused leverage write', () => {
    const notification = new NotificationService({
      langSub: new BehaviorSubject('en'),
    } as any);

    expect(notification.content.perpsLeverageUpdateFailed).toBeTruthy();
  });
});


describe('PerpsOrderComponent asynchronous confirmation', () => {
  let value: PerpsOrderComponent;
  let unlock: (key: string) => void;
  let trades: jasmine.Spy;
  let router: jasmine.SpyObj<any>;
  let wallets: BehaviorSubject<any>;
  let writes: jasmine.SpyObj<any>;

  beforeEach(() => {
    wallets = new BehaviorSubject({
      currentWallet: { accounts: [{ address: '0xabc', extra: {} }] },
    });
    trades = jasmine.createSpy('submit').and.returnValue(of({
      result: { status: 'resting' },
    }));
    router = jasmine.createSpyObj('Router', ['navigateByUrl']);
    writes = jasmine.createSpyObj('Writes', ['getOrderStatus']);
    writes.builderAddress = '';
    writes.getOrderStatus.and.returnValue(of({ status: 'order' }));
    const f = facts();
    value = new PerpsOrderComponent(
      { snapshot: { params: { coin: 'ETH' }, queryParams: {} } } as any,
      router,
      { select: () => wallets } as any,
      { snackBarTip: () => {} } as any,
      {
        watchActiveAssetData: () => of(f.activeAssetData),
        getUserFeeRates: () => of(f.feeRates),
      } as any,
      { watchAccount: () => of(f.account), refreshAccount: () => of(f.account) } as any,
      { submit: trades } as any,
      { getStorage: () => of(null), getPassword: () => Promise.resolve('password') } as any,
      { getPrivateKey: () => new Promise<string>((resolve) => { unlock = resolve; }) } as any,
      null,
      { watchMarketDetail: () => of((f.market as any).market) } as any,
      writes,
      { watchConnectionState: () => of('live') } as any
    );
    value.ngOnInit();
    value.amount = '100';
    value.leverage = 10;
    value.review();
  });

  afterEach(() => value.ngOnDestroy());

  it('keeps the reviewed reference price and submitted size while unlocking', async () => {
    // 价格在审核窗口内变化，不应再以新价格扩大 IOC 边界。
    value.facts = facts({ market: {
      status: 'ready', market: ethMarket({ midPxExact: '2020', szDecimals: 4 }),
    } });
    const confirmedSize = value.composition.intent.requestedSizeExact;
    const pending = value.submit();
    await Promise.resolve();
    value.facts = facts({ market: {
      status: 'ready', market: ethMarket({ midPxExact: '2040', szDecimals: 4 }),
    } });
    unlock('private-key');
    await pending;
    expect(trades).toHaveBeenCalledTimes(1);
    const intent = trades.calls.mostRecent().args[1];
    expect(intent.referencePriceExact).toBe('2000');
    expect(intent.requestedSizeExact).toBe(confirmedSize);
  });

  it('does not seed or reprice inputs during unlock', async () => {
    value.setPercent(50);
    value.review();
    const amount = value.amount;
    const leverage = value.leverage;
    const pending = value.submit();
    await Promise.resolve();
    const updated = facts();
    updated.activeAssetData = {
      ...updated.activeAssetData,
      leverage: { type: 'isolated', value: 5 },
      availableToTrade: ['500', '500'],
    };
    value.facts = updated;
    (value as any).applySeed();
    (value as any).repricePercent();
    expect(value.amount).toBe(amount);
    expect(value.leverage).toBe(leverage);
    unlock('private-key');
    await pending;
  });

  it('refuses an intent changed during asynchronous unlock', async () => {
    const pending = value.submit();
    await Promise.resolve();
    // 即使输入绕过 DOM 禁用，提交边界仍应检查审核内容。
    value.amount = '200';
    unlock('private-key');
    await pending;
    expect(trades).not.toHaveBeenCalled();
  });

  it('stops before sending when the price leaves the review window', async () => {
    const pending = value.submit();
    await Promise.resolve();
    value.facts = facts({ market: {
      status: 'ready', market: ethMarket({ midPxExact: '2200' }),
    } });
    unlock('private-key');
    await pending;
    expect(trades).not.toHaveBeenCalled();
  });

  it('leaves the form and aborts an unsigned order on wallet change', async () => {
    const pending = value.submit();
    await Promise.resolve();
    wallets.next({ currentWallet: { accounts: [{ address: '0xdef', extra: {} }] } });
    unlock('private-key');
    await pending;
    expect(trades).not.toHaveBeenCalled();
    expect(router.navigateByUrl).toHaveBeenCalled();
  });

  it('never queries an unresolved order with the newly selected account', fakeAsync(() => {
    trades.and.returnValue(of({ result: { status: 'unknown', cloid: 'cloid' } }));
    writes.getOrderStatus.and.returnValue(of(null));
    value.submit();
    flushMicrotasks();
    unlock('private-key');
    flushMicrotasks();
    tick(1500);
    expect(writes.getOrderStatus).toHaveBeenCalledWith('0xabc', 'cloid');
    wallets.next({ currentWallet: { accounts: [{ address: '0xdef', extra: {} }] } });
    tick(6000);
    expect(writes.getOrderStatus).toHaveBeenCalledTimes(1);
    expect(value.canSubmit).toBeFalse();
  }));
});
