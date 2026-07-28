import { Component, OnDestroy, OnInit } from '@angular/core';
import { Store } from '@ngrx/store';
import { forkJoin, Unsubscribable } from 'rxjs';

import { AppState } from '@/app/reduers';
import {
  ChromeService,
  EvmWalletService,
  GlobalService,
  HyperliquidService,
} from '@/app/core';
import { EvmWalletJSON } from '@popup/_lib/evm';
import {
  PerpsFill,
  PerpsMarket,
  PerpsOpenOrder,
} from '@popup/_lib/perps';
import {
  formatFillTime,
  formatPrice,
  formatSignedUsd,
} from '../perps.util';

@Component({
  templateUrl: 'perps-history.component.html',
  styleUrls: ['perps-history.component.scss'],
})
export class PerpsHistoryComponent implements OnInit, OnDestroy {
  fills: PerpsFill[] = [];
  openOrders: PerpsOpenOrder[] = [];
  tab: 'orders' | 'fills' = 'orders';
  loading = true;
  loadError = false;
  pendingCancelOrderId: number;
  cancelingOrderId: number;

  formatPrice = formatPrice;
  formatSignedUsd = formatSignedUsd;

  private address: string;
  private wallet: EvmWalletJSON;
  private markets: PerpsMarket[] = [];
  private accountSub: Unsubscribable;

  constructor(
    private store: Store<AppState>,
    private hyperliquid: HyperliquidService,
    private chrome: ChromeService,
    private evmWallet: EvmWalletService,
    private global: GlobalService
  ) {}

  ngOnInit() {
    this.accountSub = this.store.select('account').subscribe((state) => {
      const address = state.currentWallet?.accounts[0]?.address;
      this.wallet = state.currentWallet as EvmWalletJSON;
      if (address && address !== this.address) {
        this.address = address;
        this.load();
      }
    });
  }

  ngOnDestroy() {
    this.accountSub?.unsubscribe();
  }

  private load() {
    this.loading = true;
    this.loadError = false;
    forkJoin([
      this.hyperliquid.getOpenOrders(this.address),
      this.hyperliquid.getUserFills(this.address),
      this.hyperliquid.getMarkets(),
    ]).subscribe(
      ([openOrders, fills, markets]) => {
        this.openOrders = openOrders;
        this.fills = fills;
        this.markets = markets;
        this.loading = false;
      },
      () => {
        this.loading = false;
        this.loadError = true;
      }
    );
  }

  setTab(tab: 'orders' | 'fills') {
    this.tab = tab;
    this.pendingCancelOrderId = undefined;
  }

  requestCancel(order: PerpsOpenOrder) {
    if (this.pendingCancelOrderId === order.oid) {
      this.cancel(order);
      return;
    }
    this.pendingCancelOrderId = order.oid;
  }

  private async cancel(order: PerpsOpenOrder) {
    if (this.cancelingOrderId) {
      return;
    }
    if (
      this.wallet?.accounts[0]?.extra?.ledgerSLIP44 ||
      this.wallet?.accounts[0]?.extra?.qrBasedXFP
    ) {
      this.global.snackBarTip('perpsSigningUnavailable');
      return;
    }
    const market = this.markets.find((item) => item.coin === order.coin);
    if (!market) {
      this.global.snackBarTip('txFailed', 'Unknown perpetual market');
      return;
    }
    this.cancelingOrderId = order.oid;
    try {
      const password = await this.chrome.getPassword();
      const privateKey = await this.evmWallet.getPrivateKey(
        this.wallet,
        password
      );
      this.hyperliquid
        .cancelOrder(privateKey, market.assetId, order.oid)
        .subscribe({
          next: () => {
            this.cancelingOrderId = undefined;
            this.pendingCancelOrderId = undefined;
            this.openOrders = this.openOrders.filter(
              (item) => item.oid !== order.oid
            );
            this.global.snackBarTip('perpsOrderCanceled');
          },
          error: (error) => {
            this.cancelingOrderId = undefined;
            this.global.snackBarTip('txFailed', error?.message || error);
          },
        });
    } catch (error) {
      this.cancelingOrderId = undefined;
      this.global.snackBarTip('verifyFailed', error?.message || error);
    }
  }

  isBuy(fill: PerpsFill): boolean {
    return fill.side === 'B';
  }

  orderIsBuy(order: PerpsOpenOrder): boolean {
    return order.side === 'B';
  }

  fillTime(fill: PerpsFill): string {
    return formatFillTime(fill.time);
  }

  back() {
    history.go(-1);
  }
}
