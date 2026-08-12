import { Component, OnDestroy, OnInit } from '@angular/core';
import { MatDialog } from '@angular/material/dialog';
import { ActivatedRoute, Router } from '@angular/router';
import { Store } from '@ngrx/store';
import { Unsubscribable } from 'rxjs';

import { AppState } from '@/app/reduers';
import {
  ChromeService,
  EvmWalletService,
  GlobalService,
} from '@/app/core';
import { HyperliquidService } from '@/app/core/services/perps/hyperliquid.service';
import { EvmWalletJSON } from '@popup/_lib/evm';
import { PopupPerpsSlippageDialogComponent } from '@popup/_dialogs/perps-slippage/perps-slippage.dialog';
import {
  PerpsAccount,
  PerpsActiveAssetData,
  PerpsMarket,
  PerpsOrderBook,
  PerpsOrderPreview,
  PerpsOrderSide,
  PerpsOrderType,
  PerpsPosition,
  PERPS_BUILDER_FEE_RATE,
  PERPS_DEFAULT_SLIPPAGE_PERCENT,
  PERPS_MAX_SLIPPAGE_PERCENT,
  PERPS_MIN_ORDER_NOTIONAL,
  PERPS_MIN_SLIPPAGE_PERCENT,
} from '@popup/_lib/perps';
import {
  coinColor,
  coinLogo,
  availableToTradeForSide,
  collateralToNotional,
  estimateMarketSlippagePercent,
  formatFeeRatePercent,
  formatPrice,
  formatSignedPercent,
  formatUsd,
  maxOrderNotionalForSide,
  notionalAtLotSize,
  previewClosePosition,
  previewOrder,
  roundSize,
} from '../perps.util';

/** Hyperliquid's base taker fee, used until `userFees` reports the real one. */
const TAKER_FEE_RATE = 0.00045;

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
  coinLogo = coinLogo;
  coinColor = coinColor;
  formatPrice = formatPrice;
  formatUsd = formatUsd;
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
  private takerFeeRate = TAKER_FEE_RATE;
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
  }

  private loadMarket() {
    this.marketsSub = this.hyperliquid.watchMarkets().subscribe((markets) => {
      const market = markets.find((m) => m.coin === this.coin);
      const initialLoad = !this.market;
      this.market = market;
      if (this.market && initialLoad) {
        // Seed the limit field with the same reference a market order uses.
        this.limitPrice = this.market.midPx || this.market.markPx;
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
            this.market?.markPx ||
            0,
        };
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
          this.amount = Number(this.position.positionValue.toFixed(2));
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

  get positionSize(): number {
    return Math.abs(this.position?.szi || 0);
  }

  /**
   * Free collateral for this direction, as Hyperliquid reports it, falling back
   * to the account-wide figure. A margin number: it does not move with leverage.
   */
  get available(): number {
    if (this.activeAssetData) {
      return availableToTradeForSide(this.activeAssetData, this.side);
    }
    return this.account?.availableBalance || 0;
  }

  /** What that collateral can open, capped by the exchange's per-asset size limit. */
  private get maxOrderNotional(): number {
    if (!this.activeAssetData) {
      return collateralToNotional(this.available, this.leverage);
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
      this.orderSize,
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
      ? '--'
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
    if (this.orderType === 'limit') {
      return Number(this.limitPrice) || 0;
    }
    return this.market?.midPx || this.market?.markPx || 0;
  }

  get unsupportedAccountMode(): boolean {
    return this.account?.abstractionMode === 'portfolioMargin';
  }

  get preview(): PerpsOrderPreview {
    if (!this.market || !this.amount) {
      return null;
    }
    if (this.closeMode && this.position) {
      const closePreview = previewClosePosition({
        position: this.position,
        notional: this.amount,
        szDecimals: this.market.szDecimals,
        feeRate: this.takerFeeRate,
        builderFeeRate: this.builderFeeRate,
        fullClose: this.fullClose,
      });
      return {
        notional: this.position.positionValue * this.closeFraction,
        margin: closePreview.releasedMargin,
        fee: closePreview.fee,
        protocolFee: closePreview.protocolFee,
        builderFee: closePreview.builderFee,
        size: closePreview.size,
        liquidationPx: 0,
      };
    }
    const preview = previewOrder({
      market: this.market,
      executionPrice: this.orderPrice,
      notional: this.amount,
      leverage: this.leverage,
      isLong: this.isLong,
      feeRate: this.takerFeeRate,
      builderFeeRate: this.builderFeeRate,
    });
    return {
      ...preview,
      size: this.orderSize,
    };
  }

  /** Exact position fraction in close mode; mark-price conversion can drift. */
  private get orderSize(): number {
    if (!this.market || !this.amount || !this.orderPrice) {
      return 0;
    }
    if (!this.closeMode || !this.position?.positionValue) {
      return roundSize(
        this.amount / this.orderPrice,
        this.market.szDecimals
      );
    }
    return previewClosePosition({
      position: this.position,
      notional: this.amount,
      szDecimals: this.market.szDecimals,
      feeRate: this.takerFeeRate,
      builderFeeRate: this.builderFeeRate,
      fullClose: this.fullClose,
    }).size;
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
      this.amount >= Number(this.position.positionValue.toFixed(2))
    );
  }

  private get closeFraction(): number {
    const positionSize = Math.abs(this.position?.szi || 0);
    return positionSize > 0 ? this.orderSize / positionSize : 0;
  }

  /** Collateral the order needs; in close mode the position releases margin instead. */
  get requiredMargin(): number {
    return this.preview ? this.preview.margin : 0;
  }

  get insufficient(): boolean {
    if (this.closeMode || !this.amount) {
      return false;
    }
    if (!this.market || !this.orderPrice) {
      return true;
    }
    const maxSize = roundSize(
      this.maxOrderNotional / this.orderPrice,
      this.market.szDecimals
    );
    return this.orderSize > maxSize;
  }

  get belowMinimum(): boolean {
    return (
      this.amount > 0 &&
      this.amount < this.minOrderNotional &&
      (!this.closeMode || !this.fullClose)
    );
  }

  get canSubmit(): boolean {
    return (
      !this.submitting &&
      !!this.market &&
      this.amount > 0 &&
      !this.insufficient &&
      !this.belowMinimum &&
      !this.accountLoadError &&
      !this.unsupportedAccountMode &&
      (this.orderType === 'market' || this.limitPrice > 0) &&
      !!this.preview?.size
    );
  }

  setSide(side: PerpsOrderSide) {
    if (this.closeMode) {
      return;
    }
    this.side = side;
    this.reviewing = false;
    if (this.activePercent !== null) {
      this.setPercent(this.activePercent);
    }
  }

  setOrderType(type: PerpsOrderType) {
    this.orderType = type;
    this.reviewing = false;
  }

  setLeverage(leverage: number) {
    const max = this.market?.maxLeverage || 1;
    this.leverage = Math.max(
      1,
      Math.min(max, Math.round(Number(leverage) || 1))
    );
    this.leverageSelected = true;
    this.reviewing = false;
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
    this.amount = Number(
      ((this.percentBase * this.activePercent) / 100).toFixed(2)
    );
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
  }

  onLimitPriceChange() {
    this.reviewing = false;
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
      return this.position?.positionValue || 0;
    }
    return this.market
      ? notionalAtLotSize(
          this.maxOrderNotional,
          this.orderPrice,
          this.market.szDecimals
        )
      : this.maxOrderNotional;
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
    if (this.canSubmit) {
      this.reviewing = true;
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
      this.hyperliquid
        .placeOrder(privateKey, {
          assetId: this.market.assetId,
          isBuy: this.isLong,
          price: this.orderPrice,
          size: this.preview.size,
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
        })
        .subscribe({
          next: () => {
            this.submitting = false;
            this.global.snackBarTip('perpsOrderSubmitted');
            this.router.navigateByUrl('/popup/home');
          },
          error: (error) => {
            this.submitting = false;
            this.global.snackBarTip('txFailed', error?.message || error);
          },
        });
    } catch (error) {
      this.submitting = false;
      this.global.snackBarTip('verifyFailed', error?.message || error);
    }
  }

  back() {
    history.go(-1);
  }
}
