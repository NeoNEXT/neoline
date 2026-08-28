import { Component, OnDestroy, OnInit } from '@angular/core';
import { MatDialog } from '@angular/material/dialog';
import { ActivatedRoute, Router } from '@angular/router';
import { Store } from '@ngrx/store';
import { Unsubscribable } from 'rxjs';
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
  PerpsReviewBaseline,
} from './perps-order-composition';

/** Hyperliquid 的基础费率，在 `userFees` 报出真实费率之前先用它。 */
const TAKER_FEE_RATE = 0.00045;
const MAKER_FEE_RATE = 0.00015;

/** 美元金额按分输入、也按分提交。 */
const AMOUNT_DECIMALS = 2;

/**
 * 对于一笔读不到结果的订单，页面会有多努力去查清它的下落。
 *
 * 只要交易场所有答案，一个 cloid 一两秒内就能查到，所以短促的固定节奏能很快找到它；更要紧
 * 的是这些尝试要有个头。无限重试会让提交按钮在一笔交易场所可能永远不会上报的订单上被永久
 * 禁用，而用户唯一的脱身办法是离开页面 —— 那样 cloid 就彻底丢了。
 */
const ORDER_RESOLUTION_ATTEMPTS = 4;
const ORDER_RESOLUTION_INTERVAL_MS = 1500;

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

  submitting = false;
  reviewing = false;
  /**
   * 订单已经签名并发出，而页面始终没弄清它的下落。这不是失败 —— 它可能已经成交 —— 所以
   * 页面就照实这么说，并提供再看一眼的入口，而不是道歉或重试。
   */
  executionStatusUnknown = false;
  /** 有一次 cloid 查询在途，此时「再查一次」只会再叠一个。 */
  resolvingOrderStatus = false;

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
  private leverageSelected = false;
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
  /** 平仓模式只按仓位换算一次数量，而不是每一帧都算。 */
  private closeModeSeeded = false;
  private reviewBaseline: PerpsReviewBaseline = null;
  private pendingCloid: string = null;
  /** 在一次传输结果不明的已签名请求之后，阻止重复提交。 */
  private orderResolutionPending = false;
  private reconciliationTimer: ReturnType<typeof setTimeout>;
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
  ) {}

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
    clearTimeout(this.reconciliationTimer);
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
        const initialLoad = !this.market;
        this.patchFacts({
          market: market
            ? { status: 'ready', market }
            : { status: 'missing' },
        });
        if (market && initialLoad) {
          // 用市价单所用的同一个参考价为限价输入框播种，
          // 并已按这个市场能报出的价位做过量化。
          this.limitPrice = normalizeLimitPrice(
            market.midPxExact,
            market.szDecimals
          );
          const exchangeLeverage = this.facts.activeAssetData?.leverage.value;
          if (
            exchangeLeverage &&
            !this.leverageSelected &&
            exchangeLeverage >= 1 &&
            exchangeLeverage <= market.maxLeverage
          ) {
            this.leverage = exchangeLeverage;
          } else {
            // 在用户交易场所侧的杠杆到达之前先用默认值。
            this.leverage = Math.min(2, market.maxLeverage);
          }
        }
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
        if (
          !this.closeMode &&
          !this.leverageSelected &&
          market &&
          data.leverage.value >= 1 &&
          data.leverage.value <= market.maxLeverage
        ) {
          this.leverage = data.leverage.value;
        }
        if (this.activePercent !== null && !this.closeMode) {
          this.setPercent(this.activePercent);
        }
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
        const position = this.position;
        // 只播种一次：之后的帧不能覆盖用户此后输入的金额。
        if (this.closeMode && position && !this.closeModeSeeded) {
          this.closeModeSeeded = true;
          // 平仓意味着站到所持仓位的反方向。
          this.side = position.isLong ? 'short' : 'long';
          this.leverage = position.leverage;
          this.amount = new BigNumber(position.positionValueExact).toFixed(
            AMOUNT_DECIMALS
          );
          this.activePercent = 100;
        }
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
        if (this.activePercent !== null && !this.closeMode) {
          this.setPercent(this.activePercent);
        }
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
    return (
      !this.submitting &&
      !this.orderResolutionPending &&
      this.composition.submittable
    );
  }

  /**
   * 意图一有任何变化就作废这次审核。
   *
   * 基准存在的意义是回答「这还是当初批准的那个吗」，所以一次编辑会让它作废，而不是拿它去
   * 比对 —— 用户会被送回去，重新审核他们刚刚改动的东西。
   */
  private discardReview() {
    this.reviewing = false;
    this.reviewBaseline = null;
    this.pendingCloid = null;
  }

  setSide(side: PerpsOrderSide) {
    if (this.closeMode) {
      return;
    }
    this.side = side;
    this.discardReview();
    if (this.activePercent !== null) {
      this.setPercent(this.activePercent);
    }
  }

  setOrderType(type: PerpsOrderType) {
    this.orderType = type;
    this.discardReview();
  }

  setLeverage(leverage: number) {
    const max = this.market?.maxLeverage || 1;
    this.leverage = Math.max(
      1,
      Math.min(max, Math.round(Number(leverage) || 1))
    );
    this.leverageSelected = true;
    this.discardReview();
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
   */
  setPercent(percent: number) {
    this.activePercent = Math.max(0, Math.min(100, Number(percent) || 0));
    this.discardReview();
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
    this.discardReview();
  }

  onLimitPriceInput(value: string) {
    this.limitPrice = value;
    this.discardReview();
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
      this.discardReview();
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
        this.discardReview();
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
    this.reviewBaseline = {
      priceExact: this.orderPriceExact,
      amount: this.amount,
      limitPrice: this.limitPrice,
      side: this.side,
      orderType: this.orderType,
      leverage: this.leverage,
      slippagePercent: this.slippagePercent,
      mode: this.closeMode ? 'close' : 'open',
    };
    this.reviewing = true;
  }

  /** 这笔订单是否仍然是用户批准过的那一笔。 */
  private get stillApproved(): boolean {
    return (
      intentUnchanged(this.reviewBaseline, this.input) &&
      withinReviewedSlippage(this.reviewBaseline, this.facts, this.input)
    );
  }

  /** 把用户送回审核，并说明原因。 */
  private requireReview(message: string) {
    this.discardReview();
    this.global.snackBarTip(message);
  }

  async submit() {
    if (!this.canSubmit || !this.reviewing || !this.reviewBaseline) {
      return;
    }
    if (!this.stillApproved) {
      this.requireReview('perpsMarketChangedReviewAgain');
      return;
    }
    const walletExtra = this.wallet?.accounts[0]?.extra;
    if (walletExtra?.ledgerSLIP44 || walletExtra?.qrBasedXFP) {
      this.global.snackBarTip('perpsSigningUnavailable');
      return;
    }
    this.submitting = true;
    try {
      const password = await this.chrome.getPassword();
      const privateKey = await this.evmWallet.getPrivateKey(
        this.wallet,
        password
      );
      const intent = this.composition.intent;
      if (!intent) {
        this.submitting = false;
        this.requireReview('perpsMarketChangedReviewAgain');
        return;
      }
      this.tradeOrders
        .submit(privateKey, intent)
        .subscribe({
          next: (submission) => {
            this.submitting = false;
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
              this.startOrderResolution(result.cloid);
              return;
            }
            if (result.status === 'filled') {
              this.router.navigateByUrl(PERPS_HOME_URL);
            } else {
              this.discardReview();
              this.refreshAccount();
            }
          },
          error: (error) => {
            this.submitting = false;
            if (error instanceof PerpsTradeOrderError) {
              if (error.code === 'position-changed') {
                this.requireReview('perpsPositionChangedReviewAgain');
                return;
              }
              // 杠杆是在使用它的那笔订单之前立即写入的，所以写入被拒绝就意味着什么都没下
              // 单。把它报告成一笔失败的订单，会让用户纳闷外面是不是还有一笔订单 ——
              // 而这恰恰是他们绝不该去猜的事。
              if (error.code === 'leverage-write') {
                this.discardReview();
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
      this.submitting = false;
      this.global.snackBarTip('verifyFailed', error?.message || error);
    }
  }

  /**
   * 向交易场所查询一笔它没有作答的已签名订单的下落。
   *
   * 按 ADR-0006，这只是一次查询加一次刷新，别无其他：拿 cloid 去问，问到什么就从账户上读回
   * 什么。不持久化任何意图，不重新签名，也没有会失步的本地订单状态机。
   */
  private startOrderResolution(cloid: string) {
    this.pendingCloid = cloid;
    this.orderResolutionPending = true;
    this.executionStatusUnknown = false;
    this.resolvingOrderStatus = true;
    this.queryOrderStatus(cloid, ORDER_RESOLUTION_ATTEMPTS);
  }

  /** 「再查一次」按钮 —— 在页面用完自己的尝试次数之后出现。 */
  retryOrderResolution() {
    if (!this.pendingCloid || this.resolvingOrderStatus) {
      return;
    }
    this.startOrderResolution(this.pendingCloid);
  }

  viewHistory() {
    this.router.navigateByUrl('/popup/perps/history');
  }

  private queryOrderStatus(cloid: string, attemptsLeft: number) {
    clearTimeout(this.reconciliationTimer);
    this.reconciliationTimer = setTimeout(() => {
      this.writes.getOrderStatus(this.address, cloid).subscribe({
        next: (result) => {
          if (result?.status === 'order') {
            this.resolveOrderStatus();
            return;
          }
          // 其他任何答复都意味着交易场所暂时还没有可上报的内容，
          // 而这与「什么都没发生」不是一回事。
          this.retryOrGiveUp(cloid, attemptsLeft);
        },
        error: () => this.retryOrGiveUp(cloid, attemptsLeft),
      });
    }, ORDER_RESOLUTION_INTERVAL_MS);
  }

  private retryOrGiveUp(cloid: string, attemptsLeft: number) {
    if (attemptsLeft > 1) {
      this.queryOrderStatus(cloid, attemptsLeft - 1);
      return;
    }
    // 尝试次数用尽。提交仍然被挡住 —— 第二笔订单正是一个仓位变成两个的方式 —— 但页面现在
    // 会把这件事说出来，并给出一条出路，而不是干坐在一个永久禁用的按钮上。
    this.resolvingOrderStatus = false;
    this.executionStatusUnknown = true;
    this.refreshAccount();
  }

  private resolveOrderStatus() {
    this.orderResolutionPending = false;
    this.executionStatusUnknown = false;
    this.resolvingOrderStatus = false;
    this.pendingCloid = null;
    this.reviewing = false;
    this.reviewBaseline = null;
    this.refreshAccount();
    this.global.snackBarTip('perpsOrderStatusResolved');
  }

  back() {
    history.go(-1);
  }
}
