import { Component, OnDestroy, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { Store } from '@ngrx/store';
import { Unsubscribable } from 'rxjs';

import { AppState } from '@/app/reduers';
import { GlobalService, HyperliquidService } from '@/app/core';
import {
  PerpsAccount,
  PerpsMarket,
  PerpsMarketFilter,
  PerpsPosition,
  PERPS_MAJOR_COINS,
  PERPS_NEO_COINS,
} from '@popup/_lib/perps';
import {
  coinColor,
  coinLogo,
  formatCompactUsd,
  formatPrice,
  formatSignedPercent,
  formatSignedUsd,
  formatUsd,
} from '../perps.util';

/**
 * The 永续合约 tab on the home page: account summary, open positions and the
 * market list. Only rendered for NeoX wallets — Hyperliquid keys are secp256k1.
 */
@Component({
  selector: 'app-perps',
  templateUrl: 'perps-tab.component.html',
  styleUrls: ['perps-tab.component.scss'],
})
export class PerpsTabComponent implements OnInit, OnDestroy {
  address: string;
  loading = true;

  account: PerpsAccount;
  markets: PerpsMarket[] = [];
  visibleMarkets: PerpsMarket[] = [];

  filter: PerpsMarketFilter = 'all';
  readonly filters: { key: PerpsMarketFilter; label: string }[] = [
    { key: 'all', label: 'perpsFilterAll' },
    { key: 'neo', label: 'perpsFilterNeo' },
    { key: 'major', label: 'perpsFilterMajor' },
    { key: 'gainers', label: 'perpsFilterGainers' },
  ];

  searching = false;
  keyword = '';

  private accountSub: Unsubscribable;
  private marketsSub: Unsubscribable;
  private spotStateSub: Unsubscribable;
  private clearinghouseStateSub: Unsubscribable;
  private accountStateAddress: string;
  private pendingSpotState: any;
  private pendingClearinghouseState: any;
  private accountRequestId = 0;

  //#region template helpers
  coinLogo = coinLogo;
  coinColor = coinColor;
  formatCompactUsd = formatCompactUsd;
  formatPrice = formatPrice;
  formatUsd = formatUsd;
  formatSignedUsd = formatSignedUsd;
  formatSignedPercent = formatSignedPercent;
  //#endregion

  constructor(
    private router: Router,
    private store: Store<AppState>,
    private global: GlobalService,
    private hyperliquid: HyperliquidService
  ) {}

  ngOnInit() {
    this.accountSub = this.store.select('account').subscribe((state) => {
      const address = state.currentWallet?.accounts[0]?.address;
      if (address && address !== this.address) {
        this.address = address;
        this.account = undefined;
        this.pendingSpotState = undefined;
        this.pendingClearinghouseState = undefined;
        this.watchAccountState(address);
        this.loadAccount();
      }
    });

    this.watchMarkets();
  }

  ngOnDestroy() {
    this.accountSub?.unsubscribe();
    this.marketsSub?.unsubscribe();
    this.spotStateSub?.unsubscribe();
    this.clearinghouseStateSub?.unsubscribe();
  }

  private watchMarkets() {
    this.marketsSub = this.hyperliquid.watchMarkets().subscribe((markets) => {
      this.markets = markets;
      this.applyFilter();
      this.loading = false;
    });
  }

  private loadAccount() {
    if (!this.address) {
      return;
    }
    const requestId = ++this.accountRequestId;
    const address = this.address;
    this.hyperliquid
      .getAccount(address)
      .subscribe((account) => {
        if (requestId === this.accountRequestId && address === this.address) {
          let latest = account;
          if (this.pendingClearinghouseState) {
            latest = this.hyperliquid.updateAccountFromClearinghouseState(
              latest,
              this.pendingClearinghouseState
            );
          }
          if (this.pendingSpotState) {
            latest = this.hyperliquid.updateAccountFromSpotState(
              latest,
              this.pendingSpotState
            );
          }
          this.pendingClearinghouseState = undefined;
          this.pendingSpotState = undefined;
          this.account = latest;
        }
      });
  }

  /**
   * After the initial REST snapshot, perps and spot account changes are both
   * driven by websocket payloads without issuing another `/info` request.
   */
  private watchAccountState(address: string) {
    this.spotStateSub?.unsubscribe();
    this.clearinghouseStateSub?.unsubscribe();
    this.accountStateAddress = address.toLowerCase();
    this.spotStateSub = this.hyperliquid
      .subscribe({ type: 'spotState', user: this.accountStateAddress })
      .subscribe((update) => {
        if (this.account) {
          this.account = this.hyperliquid.updateAccountFromSpotState(
            this.account,
            update
          );
        } else {
          this.pendingSpotState = update;
        }
      });
    this.clearinghouseStateSub = this.hyperliquid
      .subscribe({
        type: 'clearinghouseState',
        user: this.accountStateAddress,
      })
      .subscribe((update) => {
        if (this.account) {
          this.account = this.hyperliquid.updateAccountFromClearinghouseState(
            this.account,
            update
          );
        } else {
          this.pendingClearinghouseState = update;
        }
      });
  }

  setFilter(filter: PerpsMarketFilter) {
    this.filter = filter;
    this.applyFilter();
  }

  toggleSearch() {
    this.searching = !this.searching;
    if (!this.searching) {
      this.keyword = '';
      this.applyFilter();
    }
  }

  applyFilter() {
    let list = this.markets;
    switch (this.filter) {
      case 'neo':
        list = list.filter((m) => PERPS_NEO_COINS.includes(m.coin));
        break;
      case 'major':
        list = list.filter((m) => PERPS_MAJOR_COINS.includes(m.coin));
        break;
      case 'gainers':
        list = [...list].sort((a, b) => b.changePercent - a.changePercent);
        break;
    }
    const keyword = this.keyword.trim().toUpperCase();
    if (keyword) {
      list = list.filter((m) => m.coin.includes(keyword));
    }
    if (this.filter === 'all' && !keyword) {
      // Surface the Neo ecosystem markets first; this is a Neo wallet.
      const neo = list.filter((m) => PERPS_NEO_COINS.includes(m.coin));
      const rest = list.filter((m) => !PERPS_NEO_COINS.includes(m.coin));
      list = [...neo, ...rest];
    }
    this.visibleMarkets = list.slice(0, 30);
  }

  /** Collateral equity for the active account mode. */
  get accountEquity(): number {
    return this.account?.totalBalance || 0;
  }

  /** Buying power, with free spot USDC folded only for Unified/portfolio mode. */
  get availableMargin(): number {
    return this.account?.availableBalance || 0;
  }

  /** Initial margin in use, reported by the perps clearinghouse. */
  get usedMargin(): number {
    return this.account?.totalMarginUsed || 0;
  }

  get marginRatio(): number | null {
    return this.account?.marginRatio ?? null;
  }

  /**
   * Spot USDC held outside perps under a standard account: real balance, but it
   * needs a Spot→Perps transfer before it can back a position, so it is surfaced
   * separately instead of inflating the perps equity above.
   */
  get separateSpotUsdc(): number {
    return this.account && !this.account.unified
      ? this.account.spotUsdc || 0
      : 0;
  }

  get hasPositions(): boolean {
    return (this.account?.positions?.length || 0) > 0;
  }

  /** Sparkline path for a market row; derived from the 24h move, not history. */
  sparklinePath(market: PerpsMarket): string {
    const up = market.changePercent >= 0;
    return up
      ? 'M1 20 L10 18 L19 21 L28 15 L37 16 L46 12 L55 14 L64 9 L71 11'
      : 'M1 6 L10 10 L19 16 L28 20 L37 17 L46 19 L55 15 L64 18 L71 13';
  }

  toMarket(coin: string) {
    this.router.navigateByUrl(`/popup/perps/market/${coin}`);
  }

  toFunding(tab: 'deposit' | 'withdraw') {
    this.router.navigateByUrl(`/popup/perps/funding?tab=${tab}`);
  }

  toHistory() {
    this.router.navigateByUrl('/popup/perps/history');
  }

  addToPosition(position: PerpsPosition) {
    this.router.navigateByUrl(
      `/popup/perps/order/${position.coin}?side=${
        position.isLong ? 'long' : 'short'
      }`
    );
  }

  closePosition(position: PerpsPosition) {
    this.router.navigateByUrl(`/popup/perps/order/${position.coin}?close=1`);
  }

  /** Closing every position at once needs a signed exchange action per market. */
  closeAll() {
    this.global.snackBarTip('perpsTradingComingSoon');
  }
}
