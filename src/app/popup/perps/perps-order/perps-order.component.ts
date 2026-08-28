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
  PERPS_MIN_ORDER_NOTIONAL,
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

/** Hyperliquid's base fees, used until `userFees` reports the real ones. */
const TAKER_FEE_RATE = 0.00045;
const MAKER_FEE_RATE = 0.00015;

/** USD amounts are typed and submitted to the cent. */
const AMOUNT_DECIMALS = 2;

/**
 * How hard the page tries to learn the fate of an order it could not read.
 *
 * A cloid resolves within a second or two when the exchange has an answer, so
 * a short fixed cadence finds one quickly; what matters more is that the
 * attempts end. An unbounded retry leaves the submit button disabled forever
 * on an order the exchange may never report, and the only escape the user had
 * was to leave the page — which loses the cloid altogether.
 */
const ORDER_RESOLUTION_ATTEMPTS = 4;
const ORDER_RESOLUTION_INTERVAL_MS = 1500;

/**
 * Reading for a summary row before an amount is typed, matching Hyperliquid's
 * own order form. Distinct from `--`, which this UI uses where the feed owes a
 * value and has not delivered one: here nothing is owed yet.
 */
const NOT_APPLICABLE = 'N/A';

/**
 * Which message answers each condition the composition module reports.
 *
 * The module states the rule and this table states the wording, so a rewritten
 * string never reaches the rule and a renamed key never reaches a spec.
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
 * Whether two readings of the form are the same reading.
 *
 * Every field is a primitive, so this is exact rather than an approximation of
 * equality — which is what lets the composition memo key on it.
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
   * The exchange as this page has read it, handed to the composition module
   * whole. Every reading the form shows is derived from this, so there is one
   * account of what is true rather than a field per answer.
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

  /** Close mode reduces an existing position instead of opening a new one. */
  closeMode = false;

  side: PerpsOrderSide = 'long';
  orderType: PerpsOrderType = 'market';
  /**
   * Both money boxes hold text, not numbers.
   *
   * These are the page's only inputs into signed values, and ADR-0001 keeps
   * those out of JavaScript floats: a `number` model turns a price typed on a
   * six-decimal market into whatever the nearest double is, and the box then
   * shows one price while the signature carries another.
   */
  limitPrice = '';
  amount = '';
  leverage = 1;
  slippagePercent = PERPS_DEFAULT_SLIPPAGE_PERCENT;
  activePercent: number = null;

  submitting = false;
  reviewing = false;
  /**
   * The order was signed and sent, and the page never learned what became of
   * it. Not a failure — it may have filled — so the page says exactly that and
   * offers another look rather than an apology or a retry.
   */
  executionStatusUnknown = false;
  /** A cloid query is in flight, so "check again" would only stack another. */
  resolvingOrderStatus = false;
  readonly minOrderNotional = PERPS_MIN_ORDER_NOTIONAL;

  //#region template helpers
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
   * The last composition and the arguments it was derived from.
   *
   * The template reads the composition from sixteen places in a single change
   * detection pass, and the arguments cannot change inside one — so the first
   * read computes and the rest are answered from here. The key is the input
   * itself, which is why this cannot go stale: facts arrive as new objects and
   * every user input is a primitive, so equal arguments mean an equal answer.
   */
  private lastComposition: PerpsOrderComposition = null;
  private lastFacts: PerpsOrderFacts = null;
  private lastInput: PerpsOrderInput = null;
  /** Close mode sizes itself from the position once, not on every frame. */
  private closeModeSeeded = false;
  private reviewBaseline: PerpsReviewBaseline = null;
  private pendingCloid: string = null;
  /** Blocks duplicate submission after a transport-ambiguous signed request. */
  private orderResolutionPending = false;
  private reconciliationTimer: ReturnType<typeof setTimeout>;
  /** Text being typed into a box, or null when it is showing the live value. */
  private percentDraft: string = null;
  private leverageDraft: string = null;
  /**
   * Chrome collapses a focus-time `select()` when the click's mouseup lands.
   * Suppressing that one mouseup keeps the whole value selected, so typing
   * replaces it; later clicks inside the box still position the caret.
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
    private markets$: PerpsMarketDatasetService
  ) {}

  ngOnInit() {
    this.coin = this.route.snapshot.params.coin;
    this.patchFacts({
      coin: this.coin,
      feeRates: {
        ...this.facts.feeRates,
        // Zero unless this build has a builder configured for the network, so
        // a build without one previews exactly what it will be charged.
        builderRate: this.hyperliquid.builderAddress
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

  /** The DEX this route trades on; a HIP-3 coin carries it as a prefix. */
  private get dex(): string {
    return this.coin?.includes(':')
      ? this.coin.slice(0, this.coin.indexOf(':'))
      : '';
  }

  /**
   * This market's own feed, not the whole enabled-DEX universe.
   *
   * Finding one coin by pulling every DEX's context array is what the market
   * detail page stopped doing (see its ADR-0001), and the order form wants the
   * same one market this page is about.
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
          // Seed the limit field with the same reference a market order uses,
          // already quantised to what this market can quote.
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
            // Default until the user's exchange-side leverage arrives.
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
   * Replace the facts with a new object, never mutate them in place.
   *
   * The composition memo keys on this reference, so a frame that edited the
   * old object would be answered from the previous reading.
   */
  private patchFacts(patch: Partial<PerpsOrderFacts>) {
    this.facts = { ...this.facts, ...patch };
  }

  /**
   * Max slippage is a habit rather than a property of any one market, so it is
   * remembered once for the wallet — the same way the chart interval is.
   */
  private loadMaxSlippage() {
    this.chrome
      .getStorage(STORAGE_NAME.perpsMaxSlippage)
      .subscribe((saved) => {
        // Storage answers with whatever an older build wrote, and the dialog's
        // range is the whole of the user's price consent — a value outside it
        // is not a preference worth restoring.
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
            // Websocket updates omit markPx; retain the REST/market snapshot.
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
   * The account, followed rather than polled.
   *
   * Position value moves with the mark price, and the close form's percentage
   * slider is measured against it — read once every few seconds it was a figure
   * that visibly lagged the price in the header. `watchAccount` seeds from REST
   * and then follows the account channel, so this is the page's one account
   * state kept current, not a second copy of it.
   *
   * The DEX comes from the route: a HIP-3 market's positions live in that
   * DEX's own clearinghouse, and asking the canonical one finds nothing —
   * which used to leave close, add and reverse silently inoperable there.
   */
  private loadAccount() {
    this.accountStateSub?.unsubscribe();
    this.accountStateSub = this.accountStates
      .watchAccount(this.address, this.dex)
      .subscribe((state) => {
        this.patchFacts({ account: state });
        const position = this.position;
        // Seeding once: later frames must not overwrite an amount the user
        // has since typed.
        if (this.closeMode && position && !this.closeModeSeeded) {
          this.closeModeSeeded = true;
          // Closing means taking the opposite side of what is held.
          this.side = position.isLong ? 'short' : 'long';
          this.leverage = position.leverage;
          this.amount = new BigNumber(position.positionValueExact).toFixed(
            AMOUNT_DECIMALS
          );
          this.activePercent = 100;
        }
      });
  }

  /** Refresh the same state stream after an exchange write. */
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
      // The base rates remain a conservative fallback when userFees fails.
      error: () => {},
    });
  }

  private setFeeRates(takerRate: number, makerRate: number) {
    this.patchFacts({
      feeRates: { ...this.facts.feeRates, takerRate, makerRate },
    });
  }

  /**
   * This reading of the form: what it would submit, and whether it may.
   *
   * Recomputed only when the facts or the input actually changed. The template
   * asks for it from sixteen places in a single change detection pass and the
   * arguments cannot move inside one, so the first read computes and the rest
   * are answered from {@link lastComposition}.
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

  /** The form's own state, as the composition module reads it. */
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

  //#region readings the template binds
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

  /** Free collateral for this direction, as Hyperliquid reports it. */
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

  //#region rendering
  /**
   * The summary rows stay on screen with an empty amount box, so the user can
   * see what an order will be judged on before typing one. Each row reads
   * `N/A` until there is a preview to quote.
   */
  get liquidationPriceText(): string {
    const price = this.preview?.liquidationPxExact;
    return price
      ? `$${formatPrice(price, this.market?.szDecimals)}`
      : NOT_APPLICABLE;
  }

  /**
   * The exchange's liquidation price for the position already open, shown
   * beside the estimate while adding to it.
   *
   * The estimate is arithmetic on inputs; this is what Hyperliquid currently
   * says. Putting them side by side is the honest way to add to a position:
   * the user sees which way the estimate moves the real number, rather than
   * being handed one figure that silently replaces the other.
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

  /** The same size at the market's lot precision, for display. */
  get formattedPositionSize(): string {
    return formatSize(
      this.composition.positionSizeExact,
      this.market?.szDecimals
    );
  }

  get formattedMaxSlippage(): string {
    return `${Number(this.slippagePercent).toFixed(2)}%`;
  }

  /** Hyperliquid's own rates, as the fee tooltip itemises them. */
  get formattedTakerFeeRate(): string {
    return formatFeeRatePercent(this.facts.feeRates.takerRate);
  }

  get formattedMakerFeeRate(): string {
    return formatFeeRatePercent(this.facts.feeRates.makerRate);
  }

  get formattedBuilderFeeRate(): string {
    return formatFeeRatePercent(this.facts.feeRates.builderRate);
  }

  /** Rate always, plus what it costs this order once one is sized. */
  get feeText(): string {
    return this.feeSideText(this.facts.feeRates.takerRate);
  }

  get makerFeeText(): string {
    return this.feeSideText(this.facts.feeRates.makerRate);
  }

  /**
   * A rate, and once the order is sized what it comes to in dollars.
   *
   * Both are the total charge — Hyperliquid's rate plus NeoLine's builder fee —
   * because that is what leaves the account. A negative total keeps its sign:
   * on a rebate tier the fill pays the account back, and flooring that at
   * "$0.00" would quietly delete money the user is owed.
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
   * The one thing standing between this form and a submitted order, worded.
   *
   * The module decides which condition applies and this turns it into the
   * message; see {@link UNAVAILABLE_MESSAGES}.
   */
  get orderUnavailableReason(): string | null {
    const availability = this.composition.availability;
    return availability ? UNAVAILABLE_MESSAGES[availability.code] : null;
  }

  /** Values the one reason on screen interpolates, when it takes any. */
  get orderUnavailableParams(): { [key: string]: string | number } {
    return this.composition.availability?.params ?? {};
  }
  //#endregion

  /**
   * Whether the button is live.
   *
   * The composition answers for the order; these two answer for the page. A
   * submission already in flight is not a property of the order, and neither
   * is an earlier one whose fate is still unknown — but both must stop a
   * second press, because that is how one position becomes two.
   */
  get canSubmit(): boolean {
    return (
      !this.submitting &&
      !this.orderResolutionPending &&
      this.composition.submittable
    );
  }

  /**
   * Any change to the intent drops the review.
   *
   * The baseline exists to answer "is this still what was approved", so an
   * edit invalidates it rather than being compared against it — the user is
   * sent back to review the thing they just changed.
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
    // The amount slider sizes off buying power, which just changed with leverage.
    if (this.activePercent !== null && !this.closeMode) {
      this.setPercent(this.activePercent);
    }
  }

  /**
   * What the leverage box shows. While it has focus it echoes the typed text
   * verbatim, so clamping never fights the caret or refills a box the user is
   * clearing; leaving the field falls back to the value actually in effect.
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

  /** Typing recalculates on every keystroke, exactly as dragging does. */
  onLeverageInput(value: string) {
    this.leverageDraft = value;
    this.setLeverage(Number(value));
  }

  onLeverageBlur() {
    this.leverageDraft = null;
  }

  /**
   * The amount slider sizes the order off buying power (collateral × leverage) when
   * opening, and off the position value when closing.
   */
  setPercent(percent: number) {
    this.activePercent = Math.max(0, Math.min(100, Number(percent) || 0));
    this.discardReview();
    this.amount = amountForPercent(this.composition, this.activePercent);
  }

  /** See {@link leverageBoxText}; the percentage box works the same way. */
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

  /** Shared by both boxes; see {@link selectingOnFocus}. */
  onBoxMouseUp(event: MouseEvent) {
    if (this.selectingOnFocus) {
      this.selectingOnFocus = false;
      event.preventDefault();
    }
  }

  /**
   * Cents are the most this order can express, so a third decimal never reaches
   * the model: it is dropped as it is typed rather than accepted and then
   * explained, the same way the transfer screen's amount field behaves.
   *
   * The box is written back to directly because a property binding will not do
   * it here: rejecting the keystroke leaves the model on the value it already
   * held, Angular sees nothing to update, and the digit the model refused stays
   * on screen — a box showing more precision than the order carries.
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
   * Quantise the typed price to the market's tick and put the result back in
   * the box, so what the user reads is what gets signed. Doing it on blur
   * rather than per keystroke leaves a half-typed price alone: "1.2" on its way
   * to "1.25" must not be rewritten under the caret.
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
    // The price the user is about to be shown, kept so submit can tell whether
    // the market has since moved further than they agreed to.
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

  /** Whether the order is still the one the user approved. */
  private get stillApproved(): boolean {
    return (
      intentUnchanged(this.reviewBaseline, this.input) &&
      withinReviewedSlippage(this.reviewBaseline, this.facts, this.input)
    );
  }

  /** Send the user back to review, saying why. */
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
              // Leverage is written just before the order that uses it, so a
              // rejected write means nothing was placed. Reporting it as a
              // failed order would leave the user wondering whether one is
              // out there — the one thing they must not have to guess at.
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
   * Ask the exchange what became of a signed order it did not answer for.
   *
   * Per ADR-0006 this is a query and a refresh, nothing more: the cloid is
   * asked about, and whatever comes back is read off the account. No intent is
   * persisted, nothing is re-signed, and there is no local order state machine
   * to fall out of sync.
   */
  private startOrderResolution(cloid: string) {
    this.pendingCloid = cloid;
    this.orderResolutionPending = true;
    this.executionStatusUnknown = false;
    this.resolvingOrderStatus = true;
    this.queryOrderStatus(cloid, ORDER_RESOLUTION_ATTEMPTS);
  }

  /** The "check again" button, once the page has run out of its own attempts. */
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
      this.hyperliquid.getOrderStatus(this.address, cloid).subscribe({
        next: (result) => {
          if (result?.status === 'order') {
            this.resolveOrderStatus();
            return;
          }
          // Any other answer means the exchange has nothing to report yet,
          // which is not the same as nothing having happened.
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
    // Out of attempts. Submission stays blocked — a second order is how one
    // position becomes two — but the page now says so and offers a way on,
    // rather than sitting on a permanently disabled button.
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
