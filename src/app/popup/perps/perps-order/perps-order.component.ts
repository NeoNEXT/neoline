import { Component, OnDestroy, OnInit } from '@angular/core';
import { MatDialog } from '@angular/material/dialog';
import { ActivatedRoute, Router } from '@angular/router';
import { Store } from '@ngrx/store';
import { firstValueFrom, Unsubscribable } from 'rxjs';
import BigNumber from 'bignumber.js';

import { AppState } from '@/app/reduers';
import {
  ChromeService,
  EvmWalletService,
  GlobalService,
} from '@/app/core';
import { HyperliquidService } from '@/app/core/services/perps/hyperliquid.service';
import { PerpsExchangeWriteService } from '@app/core/services/perps/perps-exchange-write.service';
import { PerpsMarketDatasetService } from '@app/core/services/perps/perps-market-dataset.service';
import { PerpsAccountStateService } from '@/app/core/services/perps/perps-account-state.service';
import { PerpsTradeOrderService } from '@/app/core/services/perps/perps-trade-order.service';
import { PerpsTradeOrderError } from '@/app/core/services/perps/perps-trade-order';
import { EvmWalletJSON } from '@popup/_lib/evm';
import { STORAGE_NAME } from '@popup/_lib';
import { PopupPerpsSlippageDialogComponent } from '@popup/_dialogs/perps-slippage/perps-slippage.dialog';
import {
  PerpsMarket,
  PerpsOrderPreview,
  PerpsOrderSide,
  PerpsOrderType,
  PerpsPosition,
  PERPS_BUILDER_FEE_RATE,
  PERPS_DEFAULT_SLIPPAGE_PERCENT,
  PERPS_HOME_URL,
  PERPS_MAX_SLIPPAGE_PERCENT,
  PERPS_MIN_SLIPPAGE_PERCENT,
} from '@popup/_lib/perps';
import {
  clampDecimals,
  formatBalance,
  formatFeeRatePercent,
  formatPrice,
  formatSignedPercent,
  formatSize,
  formatUsd,
} from '../perps.util';
import {
  amountForPercent,
  composeOrder,
  intentUnchanged,
  normalizeLimitPrice,
  withinReviewedSlippage,
  PerpsOrderComposition,
  PerpsOrderFacts,
  PerpsOrderInput,
  PerpsOrderUnavailableCode,
} from './perps-order-composition';
import {
  PerpsOrderLifecycle,
  PerpsOrderLifecycleState,
} from './perps-order-lifecycle';
import { seedForm, PerpsOrderUserSetField } from './perps-order-seeding';

/** Hyperliquid 的基础费率，在 `userFees` 报出真实费率之前先用它。 */
const TAKER_FEE_RATE = 0.00045;
const MAKER_FEE_RATE = 0.00015;

/** 美元金额按分输入、也按分提交。 */
const AMOUNT_DECIMALS = 2;

/**
 * 还没输入金额时摘要行的读数，与 Hyperliquid 自家下单表单一致。它不同于 `--`：本界面用
 * `--` 表示数据源欠着一个值却还没给出；而这里还什么都不欠。
 */
const NOT_APPLICABLE = 'N/A';

/**
 * 组合模块报出的每一种条件，分别由哪条文案来回答。
 *
 * 模块陈述规则、这张表陈述措辞，因此改写字符串永远影响不到规则，重命名 key 也永远影响不到
 * 任何一个 spec。
 */
const UNAVAILABLE_MESSAGES: Record<PerpsOrderUnavailableCode, string> = {
  'account-unavailable': 'perpsLoadFailed',
  'market-missing': 'perpsMarketNotFound',
  'market-error': 'perpsLoadFailed',
  'portfolio-margin': 'perpsPortfolioUnsupported',
  'cross-position': 'perpsCrossPositionUnsupported',
  'holding-long': 'perpsHoldingLongChooseExit',
  'holding-short': 'perpsHoldingShortChooseExit',
  'no-position-to-close': 'perpsNoPositionToClose',
  'no-execution-price': 'perpsNoExecutionPrice',
  'slippage-out-of-range': 'perpsSlippageOutOfRange',
  'insufficient-margin': 'perpsInsufficientMargin',
  'below-minimum': 'perpsBelowMinimum',
};

/**
 * 对表单的两次读数是不是同一次读数。
 *
 * 每个字段都是原始值，所以这是精确判断而不是近似相等 —— 正因如此，组合的记忆化才能以它为键。
 */
function sameInput(a: PerpsOrderInput, b: PerpsOrderInput): boolean {
  return (
    !!a &&
    a.mode === b.mode &&
    a.side === b.side &&
    a.orderType === b.orderType &&
    a.amount === b.amount &&
    a.limitPrice === b.limitPrice &&
    a.leverage === b.leverage &&
    a.slippagePercent === b.slippagePercent &&
    a.activePercent === b.activePercent
  );
}

@Component({
  templateUrl: 'perps-order.component.html',
  styleUrls: ['perps-order.component.scss'],
})
export class PerpsOrderComponent implements OnInit, OnDestroy {
  coin: string;
  /**
   * 本页面读到的交易场所现状，整体交给组合模块。表单显示的每一个读数都由它推导而来，
   * 因此「什么是真的」只有一份记述，而不是每个答案各占一个字段。
   */
  facts: PerpsOrderFacts = {
    coin: '',
    market: { status: 'loading' },
    account: {
      availability: 'loading',
      account: null,
      missingDexes: [],
      updatedAt: null,
    },
    activeAssetData: null,
    feeRates: {
      takerRate: TAKER_FEE_RATE,
      makerRate: MAKER_FEE_RATE,
      builderRate: 0,
    },
  };

  /** 平仓模式是减少已有仓位，而不是新开一个。 */
  closeMode = false;

  side: PerpsOrderSide = 'long';
  orderType: PerpsOrderType = 'market';
  /**
   * 两个金额输入框装的都是文本，不是数字。
   *
   * 它们是本页面通往签名数值的唯一入口，而 ADR-0001 要求那些数值不经过 JavaScript 浮点：
   * 用 `number` 建模，会把在一个六位小数市场上输入的价格变成最近的那个双精度值，于是输入框
   * 显示一个价格，签名里却是另一个。
   */
  limitPrice = '';
  amount = '';
  leverage = 1;
  slippagePercent = PERPS_DEFAULT_SLIPPAGE_PERCENT;
  activePercent: number = null;

  //#region 模板辅助方法
  formatPrice = formatPrice;
  formatSignedPercent = formatSignedPercent;
  formatBalance = formatBalance;
  //#endregion

  private address: string;
  private wallet: EvmWalletJSON;
  private accountSub: Unsubscribable;
  private accountStateSub: Unsubscribable;
  private marketsSub: Unsubscribable;
  private activeAssetDataSub: Unsubscribable;
  private userFeeSub: Unsubscribable;
  /**
   * 这一单走到哪一步了 —— 审核、提交、下落未明。页面自己的那道闸门整个在里面；
   * 见 {@link PerpsOrderLifecycle}。
   */
  private lifecycle: PerpsOrderLifecycle;
  /**
   * 用户亲手给过值的字段。
   *
   * 表单播种只填不在这里的字段，所以这个集合就是「别再动它」的全部含义 —— 过去那三个
   * 各管各的一次性闩锁（`leverageSelected` / `closeModeSeeded` / `initialLoad`）塌成了它。
   */
  private readonly touched = new Set<PerpsOrderUserSetField>();
  /**
   * 上一次组合结果，以及推导它所用的那组参数。
   *
   * 模板会在一轮变更检测里从十六个地方读取这份组合，而参数在同一轮内不可能变化 —— 所以
   * 第一次读取时计算，其余的从这里作答。键就是入参本身，这也是它不可能变陈旧的原因：
   * 事实都以新对象到达，而用户输入全是原始值，因此参数相等就意味着答案相等。
   */
  private lastComposition: PerpsOrderComposition = null;
  private lastFacts: PerpsOrderFacts = null;
  private lastInput: PerpsOrderInput = null;
  /** 正在输入框里敲的文本；显示实时值时为 null。 */
  private percentDraft: string = null;
  private leverageDraft: string = null;
  /**
   * Chrome 会在点击的 mouseup 到达时，把聚焦时的 `select()` 收起来。屏蔽掉那一次 mouseup
   * 就能保住整段选中，于是输入即替换；之后在框内的点击照样能定位光标。
   */
  private selectingOnFocus = false;

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private store: Store<AppState>,
    private global: GlobalService,
    private hyperliquid: HyperliquidService,
    private accountStates: PerpsAccountStateService,
    private tradeOrders: PerpsTradeOrderService,
    private chrome: ChromeService,
    private evmWallet: EvmWalletService,
    private dialog: MatDialog,
    private markets$: PerpsMarketDatasetService,
    private writes: PerpsExchangeWriteService
  ) {
    this.lifecycle = new PerpsOrderLifecycle(
      {
        schedule: (run, ms) => {
          const timer = setTimeout(run, ms);
          return () => clearTimeout(timer);
        },
        // 地址在这里绑掉：生命周期不需要知道页面在为谁下单。
        queryOrderStatus: (cloid) =>
          firstValueFrom(this.writes.getOrderStatus(this.address, cloid)),
      },
      (from, to) => this.onLifecycleChange(from, to)
    );
  }

  ngOnInit() {
    this.coin = this.route.snapshot.params.coin;
    this.patchFacts({
      coin: this.coin,
      feeRates: {
        ...this.facts.feeRates,
        // 除非本版本为当前网络配置了 builder，否则为零，这样没有配置的版本预览到的
        // 就正好是它实际会被收取的费用。
        builderRate: this.writes.builderAddress
          ? PERPS_BUILDER_FEE_RATE
          : 0,
      },
    });
    this.closeMode = this.route.snapshot.queryParams.close === '1';
    const side = this.route.snapshot.queryParams.side;
    if (side === 'long' || side === 'short') {
      this.side = side;
    }

    this.loadMaxSlippage();
    this.accountSub = this.store.select('account').subscribe((state) => {
      const address = state.currentWallet?.accounts[0]?.address;
      this.wallet = state.currentWallet as EvmWalletJSON;
      if (address && address !== this.address) {
        this.address = address;
        this.loadActiveAssetData();
        this.loadAccount();
        this.loadUserFeeRates();
      }
    });
    this.loadMarket();
  }

  ngOnDestroy() {
    this.accountSub?.unsubscribe();
    this.accountStateSub?.unsubscribe();
    this.marketsSub?.unsubscribe();
    this.activeAssetDataSub?.unsubscribe();
    this.userFeeSub?.unsubscribe();
    this.lifecycle.dispose();
  }

  /** 本路由所交易的 DEX；HIP-3 币种会把它作为前缀带上。 */
  private get dex(): string {
    return this.coin?.includes(':')
      ? this.coin.slice(0, this.coin.indexOf(':'))
      : '';
  }

  /**
   * 这个市场自己的数据源，而不是整个已启用 DEX 的 universe。
   *
   * 为了找一个币种就把每个 DEX 的上下文数组都拉一遍，正是市场详情页已经不再做的事
   *（见它的 ADR-0001），而下单表单要的就是本页面所针对的那同一个市场。
   */
  private loadMarket() {
    this.marketsSub = this.markets$.watchMarketDetail(this.coin).subscribe({
      next: (market) => {
        this.patchFacts({
          market: market
            ? { status: 'ready', market }
            : { status: 'missing' },
        });
        this.applySeed();
      },
      error: () => {
        this.patchFacts({ market: { status: 'error' } });
      },
    });
  }

  /**
   * 用新对象替换这些事实，绝不就地修改。
   *
   * 组合的记忆化以这个引用为键，所以一帧若是改了旧对象，得到的会是上一次的读数。
   */
  private patchFacts(patch: Partial<PerpsOrderFacts>) {
    this.facts = { ...this.facts, ...patch };
  }

  /**
   * 让表单跟上刚到的事实。
   *
   * 每帧都跑，因为播种是幂等的纯映射：它只填用户没亲手给过值的字段，所以「哪一帧先到」
   * 不再改变结果 —— 过去三条播种规则散在三个订阅回调里各带各的守卫，行情先到和账户先到
   * 会得出不同的杠杆。审核态下整个跳过：用户批准的就是屏幕上这些值。
   */
  private applySeed() {
    const seed = seedForm(
      this.facts,
      this.input,
      this.touched,
      this.lifecycle.reviewing
    );
    Object.assign(this, seed);
  }

  /**
   * 提交生命周期动了。
   *
   * 刷新账户和说哪句话都由「从哪来、到哪去」决定 —— 生命周期只管状态，措辞和账户都归页面
   * （见 ADR-0006：恢复就是按 cloid 查一次、再刷一次账户，没有别的）。
   */
  private onLifecycleChange(
    from: PerpsOrderLifecycleState,
    to: PerpsOrderLifecycleState
  ) {
    // 从「下落未明」回到编辑态：交易场所终于给了答案。
    if (from.kind === 'unknown' && to.kind === 'composing') {
      this.global.snackBarTip('perpsOrderStatusResolved');
      this.refreshAccount();
      return;
    }
    // 一次提交有了结局，或者查询的尝试次数用尽 —— 两种情况下账户都可能已经变了。
    if (
      (from.kind === 'submitting' && to.kind === 'composing') ||
      (to.kind === 'unknown' && !to.resolving)
    ) {
      this.refreshAccount();
    }
  }

  /**
   * 最大滑点是一种习惯，而不是某个市场的属性，所以它按钱包记住一次 ——
   * 与图表周期的做法相同。
   */
  private loadMaxSlippage() {
    this.chrome
      .getStorage(STORAGE_NAME.perpsMaxSlippage)
      .subscribe((saved) => {
        // 存储返回的是旧版本写进去的任意值，而对话框的取值范围就是用户价格同意的全部 ——
        // 落在范围之外的值不是一个值得恢复的偏好。
        const value = Number(saved);
        if (
          Number.isFinite(value) &&
          value >= PERPS_MIN_SLIPPAGE_PERCENT &&
          value <= PERPS_MAX_SLIPPAGE_PERCENT
        ) {
          this.slippagePercent = value;
        }
      });
  }

  private loadActiveAssetData() {
    this.activeAssetDataSub?.unsubscribe();
    this.patchFacts({ activeAssetData: null });
    this.activeAssetDataSub = this.hyperliquid
      .watchActiveAssetData(this.address, this.coin)
      .subscribe((data) => {
        const market = this.market;
        this.patchFacts({
          activeAssetData: {
            ...data,
            // websocket 更新不带 markPx；保留 REST/市场快照里的值。
            markPx:
              data.markPx ||
              this.facts.activeAssetData?.markPx ||
              Number(market?.markPxExact ?? 0),
          },
        });
        this.applySeed();
        this.repricePercent();
      });
  }

  /**
   * 账户，采用订阅跟随而不是轮询。
   *
   * 仓位价值会随标记价格变动，而平仓表单的百分比滑块正是以它为基准 —— 若每隔几秒才读一次，
   * 它就会明显落后于标题栏里的价格。`watchAccount` 先用 REST 播种，随后跟随账户频道，所以
   * 这是本页面那一份保持最新的账户状态，而不是它的第二份副本。
   *
   * DEX 取自路由：HIP-3 市场的仓位存放在那个 DEX 自己的清算所里，去问标准永续的什么也找
   * 不到 —— 过去正是这一点让那里的平仓、加仓和反手悄无声息地失效。
   */
  private loadAccount() {
    this.accountStateSub?.unsubscribe();
    this.accountStateSub = this.accountStates
      .watchAccount(this.address, this.dex)
      .subscribe((state) => {
        this.patchFacts({ account: state });
        this.applySeed();
      });
  }

  /** 在一次交易场所写入之后，刷新这同一条状态流。 */
  private refreshAccount() {
    if (this.address) {
      this.accountStates.refreshAccount(this.address, this.dex).subscribe();
    }
  }

  private loadUserFeeRates() {
    this.userFeeSub?.unsubscribe();
    this.setFeeRates(TAKER_FEE_RATE, MAKER_FEE_RATE);
    this.userFeeSub = this.hyperliquid.getUserFeeRates(this.address).subscribe({
      next: ({ takerRate, makerRate }) => {
        this.setFeeRates(takerRate, makerRate);
        this.repricePercent();
      },
      // userFees 失败时，基础费率仍是一个保守的兜底。
      error: () => {},
    });
  }

  private setFeeRates(takerRate: number, makerRate: number) {
    this.patchFacts({
      feeRates: { ...this.facts.feeRates, takerRate, makerRate },
    });
  }

  /**
   * 对表单的这次读数：它会提交什么，以及它是否被允许提交。
   *
   * 只有在事实或输入确实变化时才重新计算。模板会在一轮变更检测里从十六个地方索取它，而
   * 参数在同一轮内不可能变动，所以第一次读取时计算，其余的从 {@link lastComposition} 作答。
   */
  get composition(): PerpsOrderComposition {
    const input = this.input;
    if (
      this.lastComposition &&
      this.lastFacts === this.facts &&
      sameInput(this.lastInput, input)
    ) {
      return this.lastComposition;
    }
    this.lastFacts = this.facts;
    this.lastInput = input;
    this.lastComposition = composeOrder(this.facts, input);
    return this.lastComposition;
  }

  /** 表单自身的状态，以组合模块读取它的形式给出。 */
  private get input(): PerpsOrderInput {
    return {
      mode: this.closeMode ? 'close' : 'open',
      side: this.side,
      orderType: this.orderType,
      amount: this.amount,
      limitPrice: this.limitPrice,
      leverage: this.leverage,
      slippagePercent: this.slippagePercent,
      activePercent: this.activePercent,
    };
  }

  //#region 模板绑定的各项读数
  get market(): PerpsMarket {
    return this.composition.market;
  }

  get position(): PerpsPosition {
    return this.composition.position;
  }

  get symbol(): string {
    return this.composition.symbol;
  }

  get isLong(): boolean {
    return this.composition.isLong;
  }

  get preview(): PerpsOrderPreview {
    return this.composition.preview;
  }

  /** 该方向上的自由抵押品，取 Hyperliquid 上报的值。 */
  get availableExact(): string {
    return this.composition.availableExact;
  }

  get amountSliderPercent(): number {
    return this.composition.amountSliderPercent;
  }

  get leverageSliderPercent(): number {
    return this.composition.leverageSliderPercent;
  }

  get nearMarginLimit(): boolean {
    return this.composition.nearMarginLimit;
  }

  get showsCurrentLiquidationPrice(): boolean {
    return this.composition.showsCurrentLiquidationPrice;
  }

  get feeEstimateUnavailable(): boolean {
    return this.composition.feeEstimateUnavailable;
  }

  get quotesBothFeeSides(): boolean {
    return this.composition.quotesBothFeeSides;
  }

  get makerFeeIsRebate(): boolean {
    return this.composition.makerFeeIsRebate;
  }

  private get orderPriceExact(): string {
    return this.composition.orderPriceExact;
  }
  //#endregion

  //#region 渲染
  /**
   * 金额框为空时摘要各行仍留在屏幕上，好让用户在输入之前就能看到一笔订单会被按什么来判定。
   * 在有预览可供报价之前，每一行都读作 `N/A`。
   */
  get liquidationPriceText(): string {
    const price = this.preview?.liquidationPxExact;
    return price
      ? `$${formatPrice(price, this.market?.szDecimals)}`
      : NOT_APPLICABLE;
  }

  /**
   * 已开仓位在交易场所侧的强平价，在加仓时显示在估算值旁边。
   *
   * 估算值是对输入做的算术；这个则是 Hyperliquid 当下所说的。把它们并排放置，才是加仓时
   * 诚实的做法：用户能看到估算把真实数字往哪个方向推，而不是被塞给一个悄悄替换掉另一个的
   * 数字。
   */
  get currentLiquidationPriceText(): string {
    const price = this.position?.liquidationPxExact;
    return price
      ? `$${formatPrice(price, this.market?.szDecimals)}`
      : NOT_APPLICABLE;
  }

  get marginText(): string {
    return this.preview ? formatUsd(this.preview.marginExact) : NOT_APPLICABLE;
  }

  /** 同一个数量按市场最小变动单位精度呈现，用于显示。 */
  get formattedPositionSize(): string {
    return formatSize(
      this.composition.positionSizeExact,
      this.market?.szDecimals
    );
  }

  get formattedMaxSlippage(): string {
    return `${Number(this.slippagePercent).toFixed(2)}%`;
  }

  /** Hyperliquid 自己的费率，按手续费提示框逐项列出的形式给出。 */
  get formattedTakerFeeRate(): string {
    return formatFeeRatePercent(this.facts.feeRates.takerRate);
  }

  get formattedMakerFeeRate(): string {
    return formatFeeRatePercent(this.facts.feeRates.makerRate);
  }

  get formattedBuilderFeeRate(): string {
    return formatFeeRatePercent(this.facts.feeRates.builderRate);
  }

  /** 费率始终显示；一旦订单有了数量，再加上它对这笔订单意味着多少钱。 */
  get feeText(): string {
    return this.feeSideText(this.facts.feeRates.takerRate);
  }

  get makerFeeText(): string {
    return this.feeSideText(this.facts.feeRates.makerRate);
  }

  /**
   * 一个费率，以及订单有了数量之后它折成多少美元。
   *
   * 两者都是总收费 —— Hyperliquid 的费率加上 NeoLine 的 builder 费用 —— 因为从账户里出去的
   * 就是这个数。总额为负时保留符号：在返佣档位上成交会付钱给账户，把它压到 "$0.00" 等于
   * 悄悄抹掉用户应得的钱。
   */
  private feeSideText(rate: number): string {
    const total = rate + this.facts.feeRates.builderRate;
    const formattedRate = formatFeeRatePercent(total);
    const preview = this.preview;
    if (!preview) {
      return formattedRate;
    }
    const amount = new BigNumber(preview.notionalExact).times(total);
    return `${formattedRate} (${formatUsd(amount.toFixed())})`;
  }

  /**
   * 挡在这张表单与一笔已提交订单之间的那唯一一件事，措辞后的版本。
   *
   * 由模块决定适用哪个条件，这里把它变成文案；见 {@link UNAVAILABLE_MESSAGES}。
   */
  get orderUnavailableReason(): string | null {
    const availability = this.composition.availability;
    return availability ? UNAVAILABLE_MESSAGES[availability.code] : null;
  }

  /** 屏幕上那唯一一条原因需要插值时所用的值。 */
  get orderUnavailableParams(): { [key: string]: string | number } {
    return this.composition.availability?.params ?? {};
  }
  //#endregion

  /**
   * 按钮是否可用。
   *
   * 组合负责回答订单的事，这两项负责回答页面的事。一次已经在途的提交不是订单的属性，一笔
   * 下落仍然未知的早前订单也不是 —— 但两者都必须挡住第二次按下，因为那正是一个仓位变成两个
   * 的方式。
   */
  get canSubmit(): boolean {
    return this.lifecycle.gateOpen && this.composition.submittable;
  }

  //#region 生命周期的读数，直接绑给模板
  get reviewing(): boolean {
    return this.lifecycle.reviewing;
  }

  get executionStatusUnknown(): boolean {
    return this.lifecycle.executionStatusUnknown;
  }

  get resolvingOrderStatus(): boolean {
    return this.lifecycle.resolvingOrderStatus;
  }
  //#endregion

  setSide(side: PerpsOrderSide) {
    if (this.closeMode) {
      return;
    }
    this.side = side;
    this.touched.add('side');
    this.lifecycle.edited();
    if (this.activePercent !== null) {
      this.setPercent(this.activePercent);
    }
  }

  setOrderType(type: PerpsOrderType) {
    // 订单类型没有播种规则，所以不进「用户给定」—— 标记它只会留下一个没人读的位。
    this.orderType = type;
    this.lifecycle.edited();
  }

  setLeverage(leverage: number) {
    const max = this.market?.maxLeverage || 1;
    this.leverage = Math.max(
      1,
      Math.min(max, Math.round(Number(leverage) || 1))
    );
    this.touched.add('leverage');
    this.lifecycle.edited();
    // 金额滑块按购买力换算数量，而购买力刚刚随杠杆变了。
    if (this.activePercent !== null && !this.closeMode) {
      this.setPercent(this.activePercent);
    }
  }

  /**
   * 杠杆输入框显示什么。它获得焦点期间会原样回显输入的文本，这样钳制既不会和光标打架，
   * 也不会把用户正在清空的框重新填满；离开该字段后，退回到实际生效的那个值。
   */
  get leverageBoxText(): string {
    return this.leverageDraft === null
      ? String(this.leverage)
      : this.leverageDraft;
  }

  onLeverageFocus(input: HTMLInputElement) {
    this.leverageDraft = input.value;
    this.selectingOnFocus = true;
    input.select();
  }

  /** 输入时每次按键都会重新计算，与拖动滑块完全一致。 */
  onLeverageInput(value: string) {
    this.leverageDraft = value;
    this.setLeverage(Number(value));
  }

  onLeverageBlur() {
    this.leverageDraft = null;
  }

  /**
   * 开仓时金额滑块按购买力（抵押品 × 杠杆）换算订单数量，平仓时按仓位价值换算。
   *
   * 这是用户自己按下百分比时走的那条路，所以它作废审核：用户改了金额，就该重新审核他改
   * 出来的东西。行情帧走的是另一条 —— 见 {@link repricePercent}。
   */
  setPercent(percent: number) {
    this.activePercent = Math.max(0, Math.min(100, Number(percent) || 0));
    // 标的是 `amount` 而不是 `activePercent`：用户点 50% 表达的是「金额由我定」，
    // 只标后者的话，下一帧播种就会用仓位价值把金额盖掉，50% 当场失效。
    this.touched.add('amount');
    this.lifecycle.edited();
    this.amount = amountForPercent(this.composition, this.activePercent);
  }

  /**
   * 帧到达时，按当前购买力重算百分比所对应的金额。
   *
   * 审核态下什么都不做。屏幕上那个美元数正是用户批准的东西，背着他重算等于改掉他批准的
   * 输入 —— 而按 ADR-0006，页面保存的基线就是「用户输入 + 审核价」。
   * `activeAssetData` 是一条实时订阅，所以过去这里每来一帧就静默作废一次审核：用户点完
   * 百分比再点审核，下一帧就把他退回编辑态，而 CTA 绑的是 `reviewing ? submit() : review()`，
   * 于是那一下点击换来的是重新审核，不是下单。
   *
   * 容量在审核期间下跌的风险已经有人管：`composeOrder` 会给出 `insufficient-margin`，
   * 提交按钮自己就禁用并说明原因，不需要在这里抢先改数字。
   */
  private repricePercent() {
    if (this.reviewing || this.closeMode || this.activePercent === null) {
      return;
    }
    this.amount = amountForPercent(this.composition, this.activePercent);
  }

  /** 见 {@link leverageBoxText}；百分比输入框的做法完全相同。 */
  get percentBoxText(): string {
    return this.percentDraft === null
      ? String(Math.round(this.amountSliderPercent))
      : this.percentDraft;
  }

  onPercentFocus(input: HTMLInputElement) {
    this.percentDraft = input.value;
    this.selectingOnFocus = true;
    input.select();
  }

  onPercentInput(value: string) {
    this.percentDraft = value;
    this.setPercent(Number(value));
  }

  onPercentBlur() {
    this.percentDraft = null;
  }

  /** 两个输入框共用；见 {@link selectingOnFocus}。 */
  onBoxMouseUp(event: MouseEvent) {
    if (this.selectingOnFocus) {
      this.selectingOnFocus = false;
      event.preventDefault();
    }
  }

  /**
   * 分是这笔订单能表达的最小单位，所以第三位小数永远到不了模型：它在输入的当下就被丢掉，
   * 而不是先接受再解释 —— 与转账页面的金额输入框行为一致。
   *
   * 这里直接写回输入框，因为属性绑定在这里不管用：拒绝这次按键会让模型停在它本来就持有的
   * 值上，Angular 看不到任何需要更新的东西，于是模型拒掉的那个数字仍然留在屏幕上 —— 一个
   * 显示精度高于订单实际承载精度的输入框。
   */
  onAmountInput(input: HTMLInputElement) {
    const clamped = clampDecimals(input.value, AMOUNT_DECIMALS);
    if (input.value !== clamped) {
      input.value = clamped;
    }
    this.amount = clamped;
    this.activePercent = null;
    this.touched.add('amount');
    this.lifecycle.edited();
  }

  onLimitPriceInput(value: string) {
    this.limitPrice = value;
    this.touched.add('limitPrice');
    this.lifecycle.edited();
  }

  /**
   * 把输入的价格量化到市场的最小变动价位，并把结果写回输入框，好让用户读到的就是被签名的。
   * 在失焦时而不是每次按键时做这件事，可以放过输到一半的价格：从 "1.2" 走向 "1.25" 的输入
   * 不能在光标底下被改写。
   */
  onLimitPriceBlur() {
    const normalized = normalizeLimitPrice(
      this.limitPrice,
      this.market?.szDecimals
    );
    if (normalized !== this.limitPrice) {
      this.limitPrice = normalized;
      this.touched.add('limitPrice');
      this.lifecycle.edited();
    }
  }

  openSlippageDialog() {
    this.dialog
      .open(PopupPerpsSlippageDialogComponent, {
        panelClass: 'custom-dialog-panel',
        backdropClass: 'custom-dialog-backdrop',
        data: {
          value: this.slippagePercent,
          min: PERPS_MIN_SLIPPAGE_PERCENT,
          max: PERPS_MAX_SLIPPAGE_PERCENT,
        },
      })
      .afterClosed()
      .subscribe((value: number) => {
        if (typeof value !== 'number') {
          return;
        }
        this.slippagePercent = Number(
          Math.max(
            PERPS_MIN_SLIPPAGE_PERCENT,
            Math.min(PERPS_MAX_SLIPPAGE_PERCENT, value)
          ).toFixed(2)
        );
        this.chrome.setStorage(
          STORAGE_NAME.perpsMaxSlippage,
          this.slippagePercent
        );
        this.lifecycle.edited();
      });
  }

  get ctaLabel(): string {
    if (!this.reviewing) {
      return 'perpsReviewOrder';
    }
    if (this.closeMode) {
      return this.position?.isLong ? 'perpsCloseLong' : 'perpsCloseShort';
    }
    return this.isLong ? 'perpsLong' : 'perpsShort';
  }

  review() {
    if (!this.canSubmit) {
      return;
    }
    // 即将展示给用户的那个价格，保存下来，好让提交时能判断行情此后是否已经
    // 偏离到超出他们同意的范围。
    this.lifecycle.review({
      priceExact: this.orderPriceExact,
      amount: this.amount,
      limitPrice: this.limitPrice,
      side: this.side,
      orderType: this.orderType,
      leverage: this.leverage,
      slippagePercent: this.slippagePercent,
      mode: this.closeMode ? 'close' : 'open',
    });
  }

  /** 这笔订单是否仍然是用户批准过的那一笔。 */
  private get stillApproved(): boolean {
    const baseline = this.lifecycle.baseline;
    return (
      intentUnchanged(baseline, this.input) &&
      withinReviewedSlippage(baseline, this.facts, this.input)
    );
  }

  async submit() {
    if (!this.canSubmit || !this.lifecycle.reviewing) {
      return;
    }
    // 签不了名就先说签不了：这比先告诉用户价格变了更有用，而价格对一个根本无法签名的
    // 钱包来说是没有意义的信息。
    const walletExtra = this.wallet?.accounts[0]?.extra;
    if (walletExtra?.ledgerSLIP44 || walletExtra?.qrBasedXFP) {
      this.global.snackBarTip('perpsSigningUnavailable');
      return;
    }
    if (!this.lifecycle.beginSubmit(this.stillApproved)) {
      this.global.snackBarTip('perpsMarketChangedReviewAgain');
      return;
    }
    try {
      const password = await this.chrome.getPassword();
      const privateKey = await this.evmWallet.getPrivateKey(
        this.wallet,
        password
      );
      const intent = this.composition.intent;
      if (!intent) {
        this.lifecycle.settled();
        this.global.snackBarTip('perpsMarketChangedReviewAgain');
        return;
      }
      this.tradeOrders.submit(privateKey, intent).subscribe({
        next: (submission) => {
          const result = submission.result;
          const message = {
            filled: 'perpsOrderFilled',
            partial: 'perpsOrderPartiallyFilled',
            resting: 'perpsOrderResting',
            unfilled: 'perpsOrderUnfilled',
            rejected: 'perpsOrderRejected',
            unknown: 'perpsOrderUnknown',
          }[result.status];
          this.global.snackBarTip(message, result.error);
          if (result.status === 'unknown') {
            this.lifecycle.unresolved(result.cloid);
            return;
          }
          this.lifecycle.settled();
          if (result.status === 'filled') {
            this.router.navigateByUrl(PERPS_HOME_URL);
          }
        },
        error: (error) => {
          this.lifecycle.settled();
          if (error instanceof PerpsTradeOrderError) {
            if (error.code === 'position-changed') {
              this.global.snackBarTip('perpsPositionChangedReviewAgain');
              return;
            }
            // 杠杆是在使用它的那笔订单之前立即写入的，所以写入被拒绝就意味着什么都没下
            // 单。把它报告成一笔失败的订单，会让用户纳闷外面是不是还有一笔订单 ——
            // 而这恰恰是他们绝不该去猜的事。
            if (error.code === 'leverage-write') {
              this.global.snackBarTip(
                'perpsLeverageUpdateFailed',
                error.message
              );
              return;
            }
          }
          this.global.snackBarTip('txFailed', error?.message || error);
        },
      });
    } catch (error) {
      this.lifecycle.settled();
      this.global.snackBarTip('verifyFailed', error?.message || error);
    }
  }

  /** 「再查一次」—— 在页面用完自己的尝试次数之后出现。 */
  retryOrderResolution() {
    this.lifecycle.retryResolution();
  }

  viewHistory() {
    this.router.navigateByUrl('/popup/perps/history');
  }

  back() {
    history.go(-1);
  }
}
