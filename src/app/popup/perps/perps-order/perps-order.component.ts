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
} from '@popup/_lib/perps';
import {
  coinColor,
  coinLogo,
  availableToTradeForSide,
  formatPrice,
  formatSignedPercent,
  formatUsd,
  leverageTiers,
  maxOrderNotionalForSide,
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
          this.leverageTiers.includes(this.activeAssetData.leverage.value)
        ) {
          this.leverage = this.activeAssetData.leverage.value;
        } else {
          // Default until the user's exchange-side leverage arrives.
          const tiers = this.leverageTiers;
          this.leverage = tiers[Math.min(1, tiers.length - 1)];
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
          this.leverageTiers.includes(data.leverage.value)
        ) {
          this.leverage = data.leverage.value;
        }
        if (this.activePercent !== null && !this.closeMode) {
          this.setPercent(this.activePercent);
        }
      });
  }

  private loadAccount() {
    this.hyperliquid.getAccount(this.address).subscribe((account) => {
      this.account = account;
      this.position = account.positions.find((p) => p.coin === this.coin);
      if (this.closeMode && this.position) {
        // Closing means taking the opposite side of what is held.
        this.side = this.position.isLong ? 'short' : 'long';
        this.leverage = this.position.leverage;
        this.amount = Number(this.position.positionValue.toFixed(2));
      }
    });
  }

  get isLong(): boolean {
    return this.side === 'long';
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
      this.leverage
    );
  }

  get leverageTiers(): number[] {
    return leverageTiers(this.market?.maxLeverage || 1);
  }

  get preview(): PerpsOrderPreview {
    if (!this.market || !this.amount) {
      return null;
    }
    const preview = previewOrder({
      market: this.market,
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
    if (!this.market || !this.amount) {
      return 0;
    }
    if (!this.closeMode || !this.position?.positionValue) {
      return roundSize(
        this.amount / this.market.markPx,
        this.market.szDecimals
      );
    }
    const fraction = Math.min(1, this.amount / this.position.positionValue);
    return roundSize(
      Math.abs(this.position.szi) * fraction,
      this.market.szDecimals
    );
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

  get canSubmit(): boolean {
    return (
      !this.submitting &&
      !!this.market &&
      this.amount > 0 &&
      !this.insufficient &&
      (this.orderType === 'market' || this.limitPrice > 0) &&
      !!this.preview?.size
    );
  }

  setSide(side: PerpsOrderSide) {
    if (this.closeMode) {
      return;
    }
    this.side = side;
    if (this.activePercent !== null) {
      this.setPercent(this.activePercent);
    }
  }

  setOrderType(type: PerpsOrderType) {
    this.orderType = type;
  }

  setLeverage(leverage: number) {
    this.leverage = leverage;
    this.leverageSelected = true;
    // Percent chips size off buying power, which just changed with leverage.
    if (this.activePercent !== null && !this.closeMode) {
      this.setPercent(this.activePercent);
    }
  }

  /**
   * Percent chips size the order off buying power (collateral × leverage) when
   * opening, and off the position value when closing.
   */
  setPercent(percent: number) {
    this.activePercent = percent;
    const base = this.closeMode
      ? this.position?.positionValue || 0
      : this.activeAssetData
      ? this.maxOrderNotional
      : this.available / (1 / this.leverage + TAKER_FEE_RATE);
    this.amount = Number(((base * percent) / 100).toFixed(2));
  }

  onAmountChange() {
    this.activePercent = null;
  }

  get ctaLabel(): string {
    return this.closeMode ? 'perpsConfirmClose' : this.isLong ? 'perpsLong' : 'perpsShort';
  }

  async submit() {
    if (!this.canSubmit) {
      return;
    }
    if (this.wallet?.accounts[0]?.extra?.ledgerSLIP44) {
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
          price:
            this.orderType === 'market' ? this.market.markPx : this.limitPrice,
          size: this.preview.size,
          szDecimals: this.market.szDecimals,
          maxLeverage: this.market.maxLeverage,
          leverage: this.leverage,
          orderType: this.orderType,
          reduceOnly: this.closeMode,
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
