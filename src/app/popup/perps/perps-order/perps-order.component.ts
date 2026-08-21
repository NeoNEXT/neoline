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
import {
  HyperliquidService,
  PerpsLeverageChangeRequiredError,
  PerpsMarketDataUnavailableError,
  PerpsPositionChangedError,
} from '@/app/core/services/perps/hyperliquid.service';
import { EvmWalletJSON } from '@popup/_lib/evm';
import { PopupPerpsSlippageDialogComponent } from '@popup/_dialogs/perps-slippage/perps-slippage.dialog';
import {
  PerpsAccount,
  PerpsActiveAssetData,
  PerpsMarket,
  PerpsOrderBook,
  PerpsOrderPreview,
  PerpsOrderRequest,
  PerpsOrderSide,
  PerpsOrderType,
  PerpsPosition,
  PERPS_BUILDER_FEE_RATE,
  PERPS_DEFAULT_SLIPPAGE_PERCENT,
  PERPS_HOME_URL,
  PERPS_MAX_SLIPPAGE_PERCENT,
  PERPS_MAX_ORDER_BUFFER_FRACTION,
  PERPS_MIN_ORDER_NOTIONAL,
  PERPS_MIN_SLIPPAGE_PERCENT,
} from '@popup/_lib/perps';
import {
  availableToTradeForSide,
  collateralToNotional,
  estimateMarketSlippagePercent,
  formatFeeRatePercent,
  formatPrice,
  formatSignedPercent,
  formatSize,
  formatUsd,
  maxOrderNotionalForSide,
  notionalAtLotSize,
  previewClosePosition,
  previewOrder,
  sizeAtLot,
} from '../perps.util';

/** Hyperliquid's base taker fee, used until `userFees` reports the real one. */
const TAKER_FEE_RATE = 0.00045;

/**
 * Reading for a summary row before an amount is typed, matching Hyperliquid's
 * own order form. Distinct from `--`, which this UI uses where the feed owes a
 * value and has not delivered one: here nothing is owed yet.
 */
const NOT_APPLICABLE = 'N/A';

@Component({
  templateUrl: 'perps-order.component.html',
  styleUrls: ['perps-order.component.scss'],
})
export class PerpsOrderComponent implements OnInit, OnDestroy {
  coin: string;
  market: PerpsMarket;
  account: PerpsAccount;
  position: PerpsPosition;
  activeAssetData: PerpsActiveAssetData;
  orderBook: PerpsOrderBook;

  /** Close mode reduces an existing position instead of opening a new one. */
  closeMode = false;

  side: PerpsOrderSide = 'long';
  orderType: PerpsOrderType = 'market';
  limitPrice: number;
  amount: number = null;
  leverage = 1;
  slippagePercent = PERPS_DEFAULT_SLIPPAGE_PERCENT;
  activePercent: number = null;

  submitting = false;
  reviewing = false;
  accountLoadError = false;
  readonly minOrderNotional = PERPS_MIN_ORDER_NOTIONAL;

  //#region template helpers
  formatPrice = formatPrice;
  formatSignedPercent = formatSignedPercent;
  //#endregion

  private address: string;
  private wallet: EvmWalletJSON;
  private accountSub: Unsubscribable;
  private marketsSub: Unsubscribable;
  private activeAssetDataSub: Unsubscribable;
  private orderBookSub: Unsubscribable;
  private userFeeSub: Unsubscribable;
  private leverageSelected = false;
  /** Locally confirmed write while the account stream catches up. */
  private confirmedLeverage: number = null;
  private takerFeeRate = TAKER_FEE_RATE;
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
    private chrome: ChromeService,
    private evmWallet: EvmWalletService,
    private dialog: MatDialog
  ) {}

  ngOnInit() {
    this.coin = this.route.snapshot.params.coin;
    this.closeMode = this.route.snapshot.queryParams.close === '1';
    const side = this.route.snapshot.queryParams.side;
    if (side === 'long' || side === 'short') {
      this.side = side;
    }

    this.accountSub = this.store.select('account').subscribe((state) => {
      const address = state.currentWallet?.accounts[0]?.address;
      this.wallet = state.currentWallet as EvmWalletJSON;
      if (address && address !== this.address) {
        this.address = address;
        this.loadActiveAssetData();
        this.loadAccount();
        this.loadUserTakerFeeRate();
      }
    });
    this.loadMarket();
    this.loadOrderBook();
  }

  ngOnDestroy() {
    this.accountSub?.unsubscribe();
    this.marketsSub?.unsubscribe();
    this.activeAssetDataSub?.unsubscribe();
    this.orderBookSub?.unsubscribe();
    this.userFeeSub?.unsubscribe();
    clearTimeout(this.reconciliationTimer);
  }

  private loadMarket() {
    this.marketsSub = this.hyperliquid.watchMarkets().subscribe((markets) => {
      const market = markets.find((m) => m.coin === this.coin);
      const initialLoad = !this.market;
      this.market = market;
      if (this.market && initialLoad) {
        // Seed the limit field with the same reference a market order uses.
        this.limitPrice = Number(this.market.midPxExact ?? 0);
        if (
          this.activeAssetData &&
          !this.leverageSelected &&
          this.activeAssetData.leverage.value >= 1 &&
          this.activeAssetData.leverage.value <= this.market.maxLeverage
        ) {
          this.leverage = this.activeAssetData.leverage.value;
        } else {
          // Default until the user's exchange-side leverage arrives.
          this.leverage = Math.min(2, this.market.maxLeverage);
        }
      }
    });
  }

  private loadActiveAssetData() {
    this.activeAssetDataSub?.unsubscribe();
    this.activeAssetData = null;
    this.activeAssetDataSub = this.hyperliquid
      .watchActiveAssetData(this.address, this.coin)
      .subscribe((data) => {
        this.activeAssetData = {
          ...data,
          // Websocket updates omit markPx; retain the REST/market snapshot.
          markPx:
            data.markPx ||
            this.activeAssetData?.markPx ||
            Number(this.market?.markPxExact ?? 0),
        };
        if (
          data.leverage.type === 'isolated' &&
          data.leverage.value === this.confirmedLeverage
        ) {
          this.confirmedLeverage = null;
        }
        if (
          !this.closeMode &&
          !this.leverageSelected &&
          this.market &&
          data.leverage.value >= 1 &&
          data.leverage.value <= this.market.maxLeverage
        ) {
          this.leverage = data.leverage.value;
        }
        if (this.activePercent !== null && !this.closeMode) {
          this.setPercent(this.activePercent);
        }
      });
  }

  private loadOrderBook() {
    this.orderBookSub = this.hyperliquid
      .watchOrderBook(this.coin)
      .subscribe((book) => {
        this.orderBook = book;
      });
  }

  private loadAccount() {
    this.accountLoadError = false;
    this.hyperliquid.getAccount(this.address).subscribe({
      next: (account) => {
        this.account = account;
        this.position = account.positions.find((p) => p.coin === this.coin);
        if (this.closeMode && this.position) {
          // Closing means taking the opposite side of what is held.
          this.side = this.position.isLong ? 'short' : 'long';
          this.leverage = this.position.leverage;
          this.amount = Number(
            new BigNumber(this.position.positionValueExact).toFixed(2)
          );
          this.activePercent = 100;
        }
      },
      error: () => {
        this.accountLoadError = true;
      },
    });
  }

  private loadUserTakerFeeRate() {
    this.userFeeSub?.unsubscribe();
    this.takerFeeRate = TAKER_FEE_RATE;
    this.userFeeSub = this.hyperliquid
      .getUserTakerFeeRate(this.address)
      .subscribe({
        next: (feeRate) => {
          this.takerFeeRate = feeRate;
          if (this.activePercent !== null && !this.closeMode) {
            this.setPercent(this.activePercent);
          }
        },
        // The base rate remains a conservative fallback when userFees fails.
        error: () => {},
      });
  }

  get isLong(): boolean {
    return this.side === 'long';
  }

  /**
   * NeoLine's cut, charged by the exchange alongside its own fee. Zero unless a
   * builder address is configured for the active network, so a build without one
   * previews exactly what it will be charged.
   */
  get builderFeeRate(): number {
    return this.hyperliquid.builderAddress ? PERPS_BUILDER_FEE_RATE : 0;
  }

  get formattedBuilderFeeRate(): string {
    return formatFeeRatePercent(this.builderFeeRate);
  }

  get formattedTakerFeeRate(): string {
    return formatFeeRatePercent(this.takerFeeRate);
  }

  get formattedTotalFeeRate(): string {
    return formatFeeRatePercent(this.takerFeeRate + this.builderFeeRate);
  }

  /** Display name; the route's coin carries a DEX prefix on HIP-3 markets. */
  get symbol(): string {
    return this.market?.symbol ?? this.coin;
  }

  get positionSizeExact(): string {
    return new BigNumber(this.position?.sziExact ?? 0)
      .absoluteValue()
      .toFixed();
  }

  /** The same size at the market's lot precision, for display. */
  get formattedPositionSize(): string {
    return formatSize(this.positionSizeExact, this.market?.szDecimals);
  }

  /**
   * Free collateral for this direction, as Hyperliquid reports it, falling back
   * to the account-wide figure. A margin number: it does not move with leverage.
   */
  get available(): number {
    if (this.activeAssetData) {
      return Number(availableToTradeForSide(this.activeAssetData, this.side));
    }
    return Number(this.account?.availableBalanceExact ?? 0);
  }

  /** What that collateral can open, capped by the exchange's per-asset size limit. */
  private get maxOrderNotional(): BigNumber {
    if (!this.activeAssetData) {
      return new BigNumber(
        collateralToNotional(this.available, this.leverage)
      );
    }
    return maxOrderNotionalForSide(
      this.activeAssetData,
      this.side,
      this.leverage,
      this.orderPrice
    );
  }

  get amountSliderPercent(): number {
    if (this.activePercent !== null) {
      return this.activePercent;
    }
    const base = this.percentBase;
    if (!base || !this.amount) {
      return 0;
    }
    return Math.max(0, Math.min(100, (this.amount / base) * 100));
  }

  get leverageSliderPercent(): number {
    const max = this.market?.maxLeverage || 1;
    return max === 1 ? 100 : ((this.leverage - 1) / (max - 1)) * 100;
  }

  get estimatedSlippagePercent(): number | null {
    return estimateMarketSlippagePercent(
      this.orderBook,
      this.orderSizeExact,
      this.isLong
    );
  }

  /**
   * Four decimals, matching Hyperliquid's own order form. Price impact on a
   * small order is a few ten-thousandths of a percent, which two decimals
   * flatten to a misleading "0.00%".
   */
  get formattedEstimatedSlippage(): string {
    return this.estimatedSlippagePercent === null
      ? NOT_APPLICABLE
      : `${this.estimatedSlippagePercent.toFixed(4)}%`;
  }

  get formattedMaxSlippage(): string {
    return `${Number(this.slippagePercent).toFixed(2)}%`;
  }

  /**
   * Price used for size, margin and liquidation calculations, and the reference
   * the market order's IOC limit is derived from.
   *
   * Market orders price off the book mid, as Hyperliquid's own front end does.
   * The mark is an oracle-weighted price that can sit outside the spread, so
   * using it would shift the slippage window off the prices actually on offer.
   */
  get orderPrice(): number {
    return Number(this.orderPriceExact) || 0;
  }

  get orderPriceExact(): string {
    if (this.orderType === 'limit') {
      const value = new BigNumber(this.limitPrice || 0);
      return value.isFinite() && value.isGreaterThan(0) ? value.toFixed() : '0';
    }
    return this.market?.midPxExact || '0';
  }

  /**
   * Portfolio Margin's perps clearinghouse figures are meaningless, so an order
   * that adds risk cannot be sized or previewed on such an account. Closing is a
   * different question: a reduce-only close reads the position, not the account
   * numbers, and refusing it would leave the user holding risk they can only
   * exit somewhere else.
   */
  get unsupportedAccountMode(): boolean {
    return (
      !this.closeMode && this.account?.abstractionMode === 'portfolioMargin'
    );
  }

  /** NeoLine opens isolated orders and cannot change a live cross position. */
  get crossPositionUnsupported(): boolean {
    return !this.closeMode && this.position?.leverageType === 'cross';
  }

  get reverseMode(): boolean {
    return (
      !this.closeMode &&
      !!this.position &&
      this.position.isLong !== this.isLong
    );
  }

  private get tradeIntent(): PerpsOrderRequest['intent'] {
    if (this.closeMode) {
      return this.fullClose ? 'close' : 'reduce';
    }
    if (this.reverseMode) {
      return 'reverse';
    }
    return this.position ? 'increase' : 'open';
  }

  get preview(): PerpsOrderPreview {
    if (!this.market || !this.amount) {
      return null;
    }
    if (this.closeMode && this.position) {
      const closePreview = previewClosePosition({
        position: this.position,
        notionalExact: this.amount,
        szDecimals: this.market.szDecimals,
        feeRate: this.takerFeeRate,
        builderFeeRate: this.builderFeeRate,
        fullClose: this.fullClose,
      });
      return {
        notionalExact: new BigNumber(this.position.positionValueExact)
          .times(this.closeFractionExact)
          .toFixed(),
        marginExact: closePreview.releasedMarginExact,
        feeExact: closePreview.feeExact,
        protocolFeeExact: closePreview.protocolFeeExact,
        builderFeeExact: closePreview.builderFeeExact,
        sizeExact: closePreview.sizeExact,
        // Closing does not open exposure, so there is no liquidation price to
        // estimate — absent, not zero.
        liquidationPxExact: null,
      };
    }
    const preview = previewOrder({
      market: this.market,
      executionPriceExact: this.orderPriceExact,
      // The lot-floored notional, not the typed one: margin and fee are charged
      // on the size that reaches the exchange.
      notionalExact: this.executableNotional,
      leverage: this.leverage,
      isLong: this.isLong,
      feeRate: this.takerFeeRate,
      builderFeeRate: this.builderFeeRate,
    });
    return {
      ...preview,
      sizeExact: this.orderSizeExact,
    };
  }

  /**
   * The summary rows below stay on screen with an empty amount box, so the user
   * can see what an order will be judged on before typing one. Each row reads
   * `N/A` until there is a preview to quote.
   */
  get liquidationPriceText(): string {
    const price = this.preview?.liquidationPxExact;
    return price
      ? `$${formatPrice(price, this.market?.szDecimals)}`
      : NOT_APPLICABLE;
  }

  get marginText(): string {
    return this.preview ? formatUsd(this.preview.marginExact) : NOT_APPLICABLE;
  }

  /**
   * Whether this market's fee can be quoted at all.
   *
   * A HIP-3 DEX takes the deployer's own share on top of the account rate, and
   * nothing in `userFees` reports it. Showing the canonical rate here would put
   * a number on screen that is knowably too low, so the row says so instead.
   * It does not block the order: the fee changes nothing about what is
   * submitted, and the fill reports what was actually taken.
   */
  get feeEstimateUnavailable(): boolean {
    return !!this.market?.dex;
  }

  /** Rate always, plus what it costs this order once one is sized. */
  get feeText(): string {
    return this.preview
      ? `${this.formattedTotalFeeRate} (${formatUsd(this.preview.feeExact)})`
      : this.formattedTotalFeeRate;
  }

  /** Exact position fraction in close mode; mark-price conversion can drift. */
  private get orderSize(): number {
    return Number(this.orderSizeExact);
  }

  /**
   * What the order is actually worth once its size floors to the market lot.
   *
   * The typed amount overstates this by up to one lot, and the difference is
   * binding at both ends: Hyperliquid rejects an order under $10 measured this
   * way, and the margin and fee rows should quote the order being placed rather
   * than the number that was typed into the box.
   */
  private get executableNotional(): BigNumber {
    return new BigNumber(this.orderSizeExact).times(this.orderPriceExact);
  }

  /** Exact signed size, floored to the market lot without a Number round-trip. */
  private get orderSizeExact(): string {
    if (!this.market || !this.amount || !new BigNumber(this.orderPriceExact).isGreaterThan(0)) {
      return '0';
    }
    if (this.closeMode && this.position && this.fullClose) {
      return new BigNumber(this.position.sziExact)
        .absoluteValue()
        .toFixed();
    }
    if (!this.closeMode || !this.position?.positionValueExact) {
      return sizeAtLot(
        new BigNumber(this.amount).dividedBy(this.orderPriceExact),
        this.market.szDecimals
      );
    }
    return sizeAtLot(
      new BigNumber(this.amount).dividedBy(this.orderPriceExact),
      this.market.szDecimals
    );
  }

  /**
   * The form displays two-decimal USD, so that rounded maximum must still mean
   * 100%; requiring it to equal the higher-precision API value leaves dust.
   */
  private get fullClose(): boolean {
    if (!this.closeMode || !this.position) {
      return false;
    }
    return (
      this.activePercent === 100 ||
      this.amount >=
        Number(new BigNumber(this.position.positionValueExact).toFixed(2))
    );
  }

  private get closeFractionExact(): string {
    const positionSize = new BigNumber(
      this.position?.sziExact ?? 0
    ).absoluteValue();
    return positionSize.isGreaterThan(0)
      ? new BigNumber(this.orderSizeExact).dividedBy(positionSize).toFixed()
      : '0';
  }

  /** Collateral the order needs; in close mode the position releases margin instead. */
  get requiredMarginExact(): string {
    return this.preview ? this.preview.marginExact : '0';
  }

  get insufficient(): boolean {
    if (this.closeMode || !this.amount) {
      return false;
    }
    if (!this.market || !this.orderPrice) {
      return true;
    }
    const maxSize = sizeAtLot(
      this.maxOrderNotional.dividedBy(this.orderPrice),
      this.market.szDecimals
    );
    return new BigNumber(this.orderSizeExact).isGreaterThan(maxSize);
  }

  /**
   * Hyperliquid measures its $10 floor against the order it receives, so the
   * check has to run on the lot-floored notional too. $10 of a market that
   * trades in whole coins at $3.33 is three coins — $9.99 — which the form used
   * to accept and the exchange then rejected after the user had already signed.
   * A full close is exempt: the exchange lets a position out at any size.
   */
  get belowMinimum(): boolean {
    if (!(this.amount > 0) || !this.orderPrice) {
      return false;
    }
    if (this.closeMode && this.fullClose) {
      return false;
    }
    return this.executableNotional.isLessThan(this.minOrderNotional);
  }

  get canSubmit(): boolean {
    return (
      !this.submitting &&
      !this.orderResolutionPending &&
      !!this.market &&
      this.amount > 0 &&
      !this.insufficient &&
      !this.belowMinimum &&
      !this.accountLoadError &&
      !this.unsupportedAccountMode &&
      !this.crossPositionUnsupported &&
      (this.orderType === 'market' || this.limitPrice > 0) &&
      new BigNumber(this.preview?.sizeExact ?? 0).isGreaterThan(0)
    );
  }

  setSide(side: PerpsOrderSide) {
    if (this.closeMode) {
      return;
    }
    this.side = side;
    this.reviewing = false;
    this.pendingCloid = null;
    if (this.activePercent !== null) {
      this.setPercent(this.activePercent);
    }
  }

  setOrderType(type: PerpsOrderType) {
    this.orderType = type;
    this.reviewing = false;
    this.pendingCloid = null;
  }

  setLeverage(leverage: number) {
    const max = this.market?.maxLeverage || 1;
    this.leverage = Math.max(
      1,
      Math.min(max, Math.round(Number(leverage) || 1))
    );
    this.leverageSelected = true;
    this.reviewing = false;
    this.pendingCloid = null;
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
    this.reviewing = false;
    this.pendingCloid = null;
    // Floor to the cent the box displays, never round. The base is already the
    // largest notional this market's lot can express, so rounding the last cent
    // up buys one lot more than the exchange allows and the form ends up
    // rejecting its own 100%. Wherever a lot is worth less than half a cent —
    // the low-priced markets, kPEPE and kBONK among them — that is a routine
    // outcome rather than an edge case.
    const amount =
      this.activePercent === 100 && !this.closeMode
        ? this.bufferedMaxOrderNotional
        : new BigNumber(this.percentBase)
            .times(this.activePercent)
            .dividedBy(100);
    this.amount = amount
      .decimalPlaces(2, BigNumber.ROUND_FLOOR)
      .toNumber();
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

  onAmountChange() {
    this.activePercent = null;
    this.reviewing = false;
    this.pendingCloid = null;
  }

  onLimitPriceChange() {
    this.reviewing = false;
    this.pendingCloid = null;
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
        this.reviewing = false;
        this.pendingCloid = null;
      });
  }

  /**
   * Base the percentage buttons size against. Order sizes snap down to the
   * market's lot, so the largest notional that can actually rest is the
   * quantised one — 100% must land there, not on the raw buying power, or the
   * amount shown is one the exchange would trim anyway.
   */
  private get percentBase(): number {
    if (this.closeMode) {
      return Number(this.position?.positionValueExact ?? 0);
    }
    return this.market
      ? notionalAtLotSize(
          this.maxOrderNotional,
          this.orderPrice,
          this.market.szDecimals
        )
      : this.maxOrderNotional.toNumber();
  }

  get theoreticalBuyingPower(): number {
    return this.maxOrderNotional.toNumber();
  }

  get bufferedMaxOrderNotional(): BigNumber {
    if (!this.market) {
      return new BigNumber(0);
    }
    const buffered = this.maxOrderNotional.times(
      new BigNumber(1).minus(PERPS_MAX_ORDER_BUFFER_FRACTION)
    );
    const size = sizeAtLot(
      buffered.dividedBy(this.orderPriceExact),
      this.market.szDecimals
    );
    return new BigNumber(size).times(this.orderPriceExact);
  }

  get nearMarginLimit(): boolean {
    const amount = new BigNumber(this.amount || 0);
    return (
      !this.closeMode &&
      amount.isGreaterThan(this.bufferedMaxOrderNotional) &&
      amount.isLessThanOrEqualTo(this.maxOrderNotional)
    );
  }

  get ctaLabel(): string {
    if (!this.reviewing) {
      return 'perpsReviewOrder';
    }
    if (this.closeMode) {
      return this.position?.isLong ? 'perpsCloseLong' : 'perpsCloseShort';
    }
    if (this.reverseMode) {
      return this.isLong ? 'perpsReverseToLong' : 'perpsReverseToShort';
    }
    return this.isLong ? 'perpsLong' : 'perpsShort';
  }

  review() {
    if (this.canSubmit) {
      this.reviewing = true;
      this.pendingCloid = this.hyperliquid.createCloid();
    }
  }

  async submit() {
    if (!this.canSubmit || !this.reviewing) {
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
      const request: PerpsOrderRequest = {
        coin: this.market.coin,
        marketKey: this.market.key,
        intent: this.tradeIntent,
        assetId: this.market.assetId,
        isBuy: this.isLong,
        price: this.orderPriceExact,
        size: this.orderSizeExact,
        notionalExact:
          this.orderType === 'market' && !this.fullClose
            ? new BigNumber(this.amount).toFixed()
            : undefined,
        fullClose: this.orderType === 'market' ? this.fullClose : undefined,
        szDecimals: this.market.szDecimals,
        maxLeverage: this.market.maxLeverage,
        leverage: this.leverage,
        orderType: this.orderType,
        slippagePercent: this.slippagePercent,
        reduceOnly: this.closeMode,
        // Always open isolated so the liquidation price shown in the preview
        // (see previewOrder) is the value the exchange actually binds. Cross
        // margin would make liquidation a whole-account figure that our
        // per-order preview cannot match.
        isCross: false,
        currentLeverage:
          (this.confirmedLeverage === this.leverage
            ? { type: 'isolated', value: this.confirmedLeverage }
            : this.activeAssetData?.leverage),
        cloid: this.pendingCloid,
      };
      const leverageMatches =
        this.closeMode ||
        this.confirmedLeverage === this.leverage ||
        (this.activeAssetData?.leverage.type === 'isolated' &&
          this.activeAssetData?.leverage.value === this.leverage);
      if (!leverageMatches) {
        this.hyperliquid
          .updateLeverage(
            privateKey,
            this.market.assetId,
            this.leverage,
            this.market.maxLeverage
          )
          .subscribe({
            next: () => {
              this.submitting = false;
              this.reviewing = false;
              this.pendingCloid = null;
              this.confirmedLeverage = this.leverage;
              this.activeAssetData = this.activeAssetData
                ? {
                    ...this.activeAssetData,
                    leverage: { type: 'isolated', value: this.leverage },
                  }
                : this.activeAssetData;
              this.loadAccount();
              this.global.snackBarTip('perpsLeverageUpdatedReviewAgain');
            },
            error: (error) => {
              this.submitting = false;
              this.global.snackBarTip('txFailed', error?.message || error);
            },
          });
        return;
      }
      this.hyperliquid
        .placeOrder(privateKey, request)
        .subscribe({
          next: (result) => {
            this.submitting = false;
            this.orderResolutionPending = result.status === 'unknown';
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
              this.scheduleOrderReconciliation(result.cloid);
            }
            if (result.status === 'filled') {
              this.router.navigateByUrl(PERPS_HOME_URL);
            } else {
              this.reviewing = false;
              this.loadAccount();
            }
          },
          error: (error) => {
            this.submitting = false;
            if (error instanceof PerpsLeverageChangeRequiredError) {
              this.global.snackBarTip('perpsLeverageUpdatedReviewAgain');
            } else if (
              error instanceof PerpsMarketDataUnavailableError ||
              error instanceof PerpsPositionChangedError
            ) {
              this.reviewing = false;
              this.pendingCloid = null;
              this.global.snackBarTip('perpsMarketChangedReviewAgain');
            } else {
              this.global.snackBarTip('txFailed', error?.message || error);
            }
          },
        });
    } catch (error) {
      this.submitting = false;
      this.global.snackBarTip('verifyFailed', error?.message || error);
    }
  }

  private scheduleOrderReconciliation(cloid: string) {
    clearTimeout(this.reconciliationTimer);
    this.reconciliationTimer = setTimeout(() => {
      this.hyperliquid.getOrderStatus(this.address, cloid).subscribe({
        next: (result) => {
          if (result?.status !== 'order') {
            return;
          }
          this.orderResolutionPending = false;
          this.pendingCloid = null;
          this.reviewing = false;
          this.loadAccount();
          this.global.snackBarTip('perpsOrderStatusResolved');
        },
        // Keep submission blocked while the cloid is still unresolved.
        error: () => {},
      });
    }, 1500);
  }

  back() {
    history.go(-1);
  }
}
