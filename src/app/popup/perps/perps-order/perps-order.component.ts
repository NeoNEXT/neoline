import { Component, OnDestroy, OnInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { Store } from '@ngrx/store';
import { Unsubscribable } from 'rxjs';

import { AppState } from '@/app/reduers';
import {
  ChromeService,
  EvmWalletService,
  GlobalService,
  HyperliquidService,
} from '@/app/core';
import { EvmWalletJSON } from '@popup/_lib/evm';
import {
  PerpsAccount,
  PerpsActiveAssetData,
  PerpsMarket,
  PerpsOrderPreview,
  PerpsOrderSide,
  PerpsOrderType,
  PerpsPosition,
  PERPS_MIN_ORDER_NOTIONAL,
} from '@popup/_lib/perps';
import {
  coinColor,
  coinLogo,
  availableToTradeForSide,
  formatPrice,
  formatSignedPercent,
  formatUsd,
  maxOrderNotionalForSide,
  previewClosePosition,
  previewOrder,
  roundSize,
} from '../perps.util';

/** Hyperliquid's base taker fee before any builder fee is added. */
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

  /** Close mode reduces an existing position instead of opening a new one. */
  closeMode = false;

  side: PerpsOrderSide = 'long';
  orderType: PerpsOrderType = 'market';
  limitPrice: number;
  amount: number = null;
  leverage = 1;
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
  private leverageSelected = false;

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private store: Store<AppState>,
    private global: GlobalService,
    private hyperliquid: HyperliquidService,
    private chrome: ChromeService,
    private evmWallet: EvmWalletService
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
      }
    });
    this.loadMarket();
  }

  ngOnDestroy() {
    this.accountSub?.unsubscribe();
    this.marketsSub?.unsubscribe();
    this.activeAssetDataSub?.unsubscribe();
  }

  private loadMarket() {
    this.marketsSub = this.hyperliquid.watchMarkets().subscribe((markets) => {
      const market = markets.find((m) => m.coin === this.coin);
      const initialLoad = !this.market;
      this.market = market;
      if (this.market && initialLoad) {
        this.limitPrice = this.market.markPx;
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

  get isLong(): boolean {
    return this.side === 'long';
  }

  get positionSize(): number {
    return Math.abs(this.position?.szi || 0);
  }

  /** Hyperliquid's direction-aware order notional, with account balance fallback. */
  get available(): number {
    if (this.activeAssetData) {
      return availableToTradeForSide(
        this.activeAssetData,
        this.side,
        this.leverage
      );
    }
    return this.account?.availableBalance || 0;
  }

  /** Exchange-side position cap expressed as order notional. */
  private get maxOrderNotional(): number {
    if (!this.activeAssetData) {
      return this.available;
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

  /** Price used for size, margin and liquidation calculations. */
  get orderPrice(): number {
    return this.orderType === 'limit'
      ? Number(this.limitPrice) || 0
      : this.market?.markPx || 0;
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
        feeRate: TAKER_FEE_RATE,
        fullClose: this.fullClose,
      });
      return {
        notional: this.position.positionValue * this.closeFraction,
        margin: closePreview.releasedMargin,
        fee: closePreview.fee,
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
      feeRate: TAKER_FEE_RATE,
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
      feeRate: TAKER_FEE_RATE,
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
    if (this.activeAssetData) {
      return this.amount > this.maxOrderNotional;
    }
    return this.requiredMargin + (this.preview?.fee || 0) > this.available;
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

  onAmountChange() {
    this.activePercent = null;
    this.reviewing = false;
  }

  onLimitPriceChange() {
    this.reviewing = false;
  }

  private get percentBase(): number {
    if (this.closeMode) {
      return this.position?.positionValue || 0;
    }
    return this.activeAssetData
      ? this.maxOrderNotional
      : this.available / (1 / this.leverage + TAKER_FEE_RATE);
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
