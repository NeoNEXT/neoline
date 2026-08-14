import { Component, OnDestroy, OnInit } from '@angular/core';
import { Store } from '@ngrx/store';
import { forkJoin, Observable, of, Subscription, Unsubscribable } from 'rxjs';
import { catchError } from 'rxjs/operators';

import { AppState } from '@/app/reduers';
import {
  ChromeService,
  EvmWalletService,
  GlobalService,
} from '@/app/core';
import { HyperliquidService } from '@/app/core/services/perps/hyperliquid.service';
import { EvmWalletJSON } from '@popup/_lib/evm';
import {
  PerpsFill,
  PerpsHistoricalOrder,
  PerpsLedgerUpdate,
  PerpsMarket,
  PerpsOpenOrder,
} from '@popup/_lib/perps';
import {
  formatFillTime,
  formatPrice,
  formatSignedUsd,
  formatSize,
} from '../perps.util';

type PerpsActivityTab =
  | 'orders'
  | 'fills'
  | 'orderHistory'
  | 'transfers';

/**
 * Order states that get a friendly label. Hyperliquid ships a long tail of
 * `xxxCanceled` / `xxxRejected` variants, handled by suffix in orderStatusKey.
 */
const ORDER_STATUS_LABELS = {
  filled: 'perpsStatusFilled',
  open: 'perpsStatusOpen',
  canceled: 'perpsStatusCanceled',
  scheduledCancel: 'perpsStatusCanceled',
  rejected: 'perpsStatusRejected',
  triggered: 'perpsStatusTriggered',
};

/** Ledger rows reuse the deposit/withdraw wording from the balance card. */
const LEDGER_TYPE_LABELS = {
  deposit: 'perpsDeposit',
  withdraw: 'perpsWithdraw',
  accountClassTransfer: 'perpsLedgerTransfer',
  internalTransfer: 'perpsLedgerTransfer',
  spotTransfer: 'perpsLedgerTransfer',
  subAccountTransfer: 'perpsLedgerTransfer',
  send: 'perpsLedgerTransfer',
};

/** The popup only ever scrolls so far; older rows stay on the web UI. */
const MAX_ARCHIVE_ROWS = 200;

@Component({
  templateUrl: 'perps-history.component.html',
  styleUrls: ['perps-history.component.scss'],
})
export class PerpsHistoryComponent implements OnInit, OnDestroy {
  fills: PerpsFill[] = [];
  openOrders: PerpsOpenOrder[] = [];
  historicalOrders: PerpsHistoricalOrder[] = [];
  transfers: PerpsLedgerUpdate[] = [];
  tab: PerpsActivityTab = 'orders';
  loading = true;
  /** Per-tab spinner for the two lazily fetched tabs. */
  tabLoading = false;
  loadError = false;
  pendingCancelOrderId: string;
  cancelingOrderId: string;

  formatPrice = formatPrice;
  formatSignedUsd = formatSignedUsd;

  private address: string;
  private wallet: EvmWalletJSON;
  private markets: PerpsMarket[] = [];
  private accountSub: Unsubscribable;
  private liveSubs = new Subscription();
  /** Tabs already fetched for the current address. */
  private loadedTabs = new Set<PerpsActivityTab>();
  /** Tabs with a request in flight, so switching back and forth sends one. */
  private pendingTabs = new Set<PerpsActivityTab>();

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
    this.liveSubs.unsubscribe();
  }

  private load() {
    this.loading = true;
    this.loadError = false;
    this.loadedTabs.clear();
    this.pendingTabs.clear();
    this.historicalOrders = [];
    this.transfers = [];
    forkJoin([
      this.hyperliquid.getOpenOrders(this.address),
      // Markets only resolve the asset id a cancel needs. A rate-limited or
      // failed market snapshot must not hide orders that loaded fine.
      this.hyperliquid.getMarkets().pipe(catchError(() => of([]))),
    ]).subscribe(
      ([openOrders, markets]) => {
        this.openOrders = openOrders;
        // `userFills` immediately pushes an `isSnapshot` websocket message.
        // Do not spend a weighted REST request fetching the same history first.
        this.fills = [];
        this.markets = markets;
        this.loadedTabs.add('orders');
        this.loading = false;
        this.watchLiveActivity();
        this.loadTab(this.tab);
      },
      () => {
        this.loading = false;
        this.loadError = true;
      }
    );
  }

  /** The two archive tabs are only worth a request once the user opens them. */
  private loadTab(tab: PerpsActivityTab) {
    if (tab === 'orders' || tab === 'fills') {
      return;
    }
    if (
      this.loading ||
      this.loadedTabs.has(tab) ||
      this.pendingTabs.has(tab) ||
      !this.address
    ) {
      return;
    }
    this.pendingTabs.add(tab);
    const request: Observable<any[]> = tab === 'orderHistory'
      ? this.hyperliquid.getHistoricalOrders(this.address)
      : this.hyperliquid.getLedgerUpdates(this.address);
    this.tabLoading = true;
    request.subscribe((res: any[]) => {
      if (tab === 'orderHistory') {
        // One row per status change, exactly as Hyperliquid's own order
        // history renders it: an order that rested and then filled shows up
        // twice. Sorting is stable, so rows sharing a timestamp keep the
        // API's newest-state-first order.
        this.historicalOrders = (res as PerpsHistoricalOrder[])
          .slice()
          .sort((a, b) => b.statusTimestamp - a.statusTimestamp)
          .slice(0, MAX_ARCHIVE_ROWS);
      } else {
        this.transfers = (res as PerpsLedgerUpdate[])
          .slice()
          .sort((a, b) => b.time - a.time)
          .slice(0, MAX_ARCHIVE_ROWS);
      }
      this.pendingTabs.delete(tab);
      this.loadedTabs.add(tab);
      if (this.tab === tab) {
        this.tabLoading = false;
      }
    }, () => {
      this.pendingTabs.delete(tab);
      this.tabLoading = false;
      this.loadError = true;
    });
  }

  private watchLiveActivity() {
    this.liveSubs.unsubscribe();
    this.liveSubs = new Subscription();
    this.liveSubs.add(
      this.hyperliquid.watchOpenOrders(this.address).subscribe({
        next: (orders) => (this.openOrders = orders),
        error: () => (this.loadError = true),
      })
    );
    this.liveSubs.add(
      this.hyperliquid.watchUserFills(this.address).subscribe({
        next: (update) => {
          const incoming: PerpsFill[] = update?.fills || [];
          this.fills = update?.isSnapshot
            ? incoming
            : this.mergeFills(incoming, this.fills);
          if (update?.isSnapshot) {
            this.loadedTabs.add('fills');
            if (this.tab === 'fills') {
              this.tabLoading = false;
            }
          }
        },
        error: () => (this.loadError = true),
      })
    );
  }

  private mergeFills(incoming: PerpsFill[], current: PerpsFill[]): PerpsFill[] {
    const seen = new Set<string>();
    return [...incoming, ...current]
      .filter((fill) => {
        const key = `${fill.tid ?? ''}:${fill.oid ?? ''}:${fill.time}:${fill.px}:${fill.sz}`;
        if (seen.has(key)) {
          return false;
        }
        seen.add(key);
        return true;
      })
      .sort((a, b) => b.time - a.time);
  }

  setTab(tab: PerpsActivityTab) {
    this.tab = tab;
    this.pendingCancelOrderId = undefined;
    this.tabLoading = !this.loading && !this.loadedTabs.has(tab);
    this.loadTab(tab);
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
            // The canceled order now belongs in the archive tab.
            this.loadedTabs.delete('orderHistory');
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

  /** Translate Hyperliquid's side and reduce-only flag into trading intent. */
  orderDirectionKey(
    order: PerpsOpenOrder
  ): 'perpsOpenLong' | 'perpsOpenShort' | 'perpsCloseLong' | 'perpsCloseShort' {
    if (order.reduceOnly) {
      return this.orderIsBuy(order) ? 'perpsCloseShort' : 'perpsCloseLong';
    }
    return this.orderIsBuy(order) ? 'perpsOpenLong' : 'perpsOpenShort';
  }

  orderIsPositionTpsl(order: PerpsOpenOrder): boolean {
    return !!order.isPositionTpsl;
  }

  fillTime(fill: PerpsFill): string {
    return formatFillTime(fill.time);
  }

  time(timestamp: number): string {
    return formatFillTime(timestamp);
  }

  /**
   * An order or fill size at its market's lot precision. History spans markets
   * this wallet may no longer hold, so an unknown coin sizes by magnitude.
   */
  size(value: string | number, coin: string): string {
    const market = this.markets.find((item) => item.coin === coin);
    return formatSize(value, market?.szDecimals);
  }

  /** i18n key for an order state, or '' when it needs the raw value. */
  orderStatusKey(status: string): string {
    if (ORDER_STATUS_LABELS[status]) {
      return ORDER_STATUS_LABELS[status];
    }
    if (status?.endsWith('Canceled')) {
      return 'perpsStatusCanceled';
    }
    if (status?.endsWith('Rejected')) {
      return 'perpsStatusRejected';
    }
    return '';
  }

  /** i18n key for a ledger row, or '' for exotic types (vault, staking, ...). */
  ledgerTypeKey(update: PerpsLedgerUpdate): string {
    return LEDGER_TYPE_LABELS[update.delta?.type] || '';
  }

  ledgerIsOut(update: PerpsLedgerUpdate): boolean {
    const delta = update.delta || ({} as any);
    if (delta.type === 'withdraw') {
      return true;
    }
    // A class transfer moves collateral out of the perps account when it lands
    // on the spot side.
    if (delta.type === 'accountClassTransfer') {
      return delta.toPerp === false;
    }
    // Peer-to-peer rows carry both sides: we are the sender unless the funds
    // landed on this address.
    if (delta.destination) {
      return delta.destination.toLowerCase() !== this.address?.toLowerCase();
    }
    return false;
  }

  /** Ledger amounts are USDC for bridge/class rows and token-denominated otherwise. */
  ledgerAmount(update: PerpsLedgerUpdate): string {
    const delta = update.delta || ({} as any);
    const value = delta.usdc ?? delta.amount;
    if (value === undefined) {
      return '';
    }
    const token = delta.usdc !== undefined ? 'USDC' : delta.token || '';
    return `${this.ledgerIsOut(update) ? '-' : '+'}${value} ${token}`.trim();
  }

}
