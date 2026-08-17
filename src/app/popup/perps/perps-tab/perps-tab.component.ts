import { Component, OnDestroy, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { Store } from '@ngrx/store';
import BigNumber from 'bignumber.js';
import { Unsubscribable } from 'rxjs';

import { AppState } from '@/app/reduers';
import { ChromeService } from '@/app/core';
import { STORAGE_NAME } from '@popup/_lib';
import { HyperliquidService } from '@/app/core/services/perps/hyperliquid.service';
import {
  PerpsAggregatedAccount,
  PerpsConnectionState,
  PerpsMarket,
  PerpsMarketSortKey,
  PerpsPosition,
  PerpsSortDirection,
  PERPS_MARKET_PAGE_SIZE,
  PERPS_NEO_COINS,
} from '@popup/_lib/perps';
import {
  formatCompactUsd,
  formatPrice,
  formatSignedPercent,
  formatSignedUsd,
  formatSize,
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
  accountLoadError = false;
  marketLoadError = false;

  account: PerpsAggregatedAccount;
  markets: PerpsMarket[] = [];
  /** Markets kept at the top: favourites and the Neo ecosystem. */
  pinnedMarkets: PerpsMarket[] = [];
  /** The rows below the pinned block, in ordering-snapshot order. */
  visibleMarkets: PerpsMarket[] = [];

  sortKey: PerpsMarketSortKey = 'volume';
  sortDirection: PerpsSortDirection = 'desc';
  readonly sortKeys: { key: PerpsMarketSortKey; label: string }[] = [
    { key: 'volume', label: 'perpsSortVolume' },
    { key: 'change', label: 'perpsSortChange' },
  ];

  searching = false;
  keyword = '';

  /** How many rows of the snapshot are materialised so far. */
  visibleCount = PERPS_MARKET_PAGE_SIZE;
  readonly skeletonRows = new Array(6);

  private favorites: string[] = [];
  /** The frozen row order; see `resnapshot`. */
  private orderedKeys: string[] = [];
  private pinnedKeys: string[] = [];
  private renderTimer: any;

  /** Feed health, shown as a banner and by dimming every quoted value. */
  connectionState: PerpsConnectionState = 'connecting';
  marketFeedAt: number | null = null;

  private accountSub: Unsubscribable;
  private marketsSub: Unsubscribable;
  private spotStateSub: Unsubscribable;
  private clearinghouseStateSubs: Unsubscribable[] = [];
  private connectionSub: Unsubscribable;
  private feedAtSub: Unsubscribable;
  private accountStateAddress: string;
  private pendingSpotState: any;
  private pendingClearinghouseState: any[] = [];
  private accountRequestId = 0;

  //#region template helpers
  formatCompactUsd = formatCompactUsd;
  formatPrice = formatPrice;
  formatUsd = formatUsd;
  formatSignedUsd = formatSignedUsd;
  formatSignedPercent = formatSignedPercent;
  //#endregion

  constructor(
    private router: Router,
    private store: Store<AppState>,
    private hyperliquid: HyperliquidService,
    private chrome: ChromeService
  ) {}

  ngOnInit() {
    this.accountSub = this.store.select('account').subscribe((state) => {
      const address = state.currentWallet?.accounts[0]?.address;
      if (address && address !== this.address) {
        this.address = address;
        this.account = undefined;
        this.pendingSpotState = undefined;
        this.pendingClearinghouseState = [];
        this.watchAccountState(address);
        this.loadAccount();
      }
    });

    this.watchMarkets();
    this.watchFeedHealth();
    this.loadListPreferences();
  }

  ngOnDestroy() {
    this.accountSub?.unsubscribe();
    this.marketsSub?.unsubscribe();
    this.spotStateSub?.unsubscribe();
    this.unwatchClearinghouseState();
    this.connectionSub?.unsubscribe();
    this.feedAtSub?.unsubscribe();
    clearTimeout(this.renderTimer);
  }

  /**
   * Track feed health, and re-snapshot the account whenever the feed comes back.
   *
   * Market frames repair themselves — each one carries the whole context array,
   * so the first frame after a reconnect is already a full picture. Account
   * state does not get that guarantee from us, so it is re-fetched over REST;
   * a position opened while the socket was down would otherwise stay invisible.
   */
  private watchFeedHealth() {
    this.feedAtSub = this.hyperliquid
      .watchMarketFeedAt()
      .subscribe((at) => (this.marketFeedAt = at));
    this.connectionSub = this.hyperliquid
      .watchConnectionState()
      .subscribe((state) => {
        const recovered = this.connectionState === 'stale' && state === 'live';
        this.connectionState = state;
        if (recovered) {
          this.loadAccount();
        }
      });
  }

  /** Merge bursts of frames into one repaint, ~250ms apart at most. */
  private scheduleRender() {
    if (this.renderTimer) {
      return;
    }
    this.renderTimer = setTimeout(() => {
      this.renderTimer = undefined;
      this.renderRows();
    }, 250);
  }

  private watchMarkets() {
    this.marketsSub = this.hyperliquid.watchMarkets().subscribe({
      next: (markets) => {
        const known = new Set(this.orderedKeys.concat(this.pinnedKeys));
        const changed =
          known.size !== markets.length ||
          markets.some((market) => !known.has(market.key));
        this.markets = markets;
        // A new or delisted market has to enter the order; a price move must
        // not. Coalesce the rest so several DEX frames repaint once.
        if (changed) {
          this.resnapshot();
        } else {
          this.scheduleRender();
        }
        this.loading = false;
        this.marketLoadError = false;
      },
      error: () => {
        this.loading = false;
        this.marketLoadError = true;
      },
    });
  }

  private loadAccount() {
    if (!this.address) {
      return;
    }
    const requestId = ++this.accountRequestId;
    const address = this.address;
    this.accountLoadError = false;
    this.hyperliquid
      .getAggregatedAccount(address)
      .subscribe({
        next: (account) => {
          if (requestId === this.accountRequestId && address === this.address) {
            let latest = account;
            this.pendingClearinghouseState.forEach((update) => {
              latest = this.hyperliquid.updateAggregatedFromClearinghouseState(
                latest,
                update
              );
            });
            if (this.pendingSpotState) {
              latest = this.hyperliquid.updateAggregatedFromSpotState(
                latest,
                this.pendingSpotState
              );
            }
            this.pendingClearinghouseState = [];
            this.pendingSpotState = undefined;
            this.account = latest;
          }
        },
        error: () => {
          if (requestId === this.accountRequestId && address === this.address) {
            this.accountLoadError = true;
          }
        },
      });
  }

  /**
   * After the initial REST snapshot, perps and spot account changes are both
   * driven by websocket payloads without issuing another `/info` request.
   */
  private watchAccountState(address: string) {
    this.spotStateSub?.unsubscribe();
    this.unwatchClearinghouseState();
    this.accountStateAddress = address.toLowerCase();
    this.spotStateSub = this.hyperliquid
      .subscribe({ type: 'spotState', user: this.accountStateAddress })
      .subscribe((update) => {
        if (this.account) {
          this.account = this.hyperliquid.updateAggregatedFromSpotState(
            this.account,
            update
          );
        } else {
          this.pendingSpotState = update;
        }
      });
    // One subscription per DEX: each clearinghouse reports its own pool, and a
    // shared subscription would let one DEX's frame overwrite another's.
    this.clearinghouseStateSubs = this.hyperliquid.enabledDexes.map((dex) =>
      this.hyperliquid
        .subscribe({
          type: 'clearinghouseState',
          user: this.accountStateAddress,
          dex,
        })
        .subscribe((update) => {
          if (this.account) {
            this.account =
              this.hyperliquid.updateAggregatedFromClearinghouseState(
                this.account,
                update
              );
          } else {
            this.pendingClearinghouseState.push(update);
          }
        })
    );
  }

  private unwatchClearinghouseState() {
    this.clearinghouseStateSubs.forEach((sub) => sub.unsubscribe());
    this.clearinghouseStateSubs = [];
  }

  setSortKey(key: PerpsMarketSortKey) {
    // Tapping the active key flips direction, the way a sortable column does.
    this.sortDirection =
      this.sortKey === key && this.sortDirection === 'desc' ? 'asc' : 'desc';
    this.sortKey = key;
    this.chrome.setStorage(STORAGE_NAME.perpsMarketSort, {
      key: this.sortKey,
      direction: this.sortDirection,
    });
    this.resnapshot();
  }

  toggleSearch() {
    this.searching = !this.searching;
    if (!this.searching && this.keyword) {
      this.keyword = '';
    }
    this.resnapshot();
  }

  onKeywordChange() {
    this.resnapshot();
  }

  loadMore() {
    this.visibleCount += PERPS_MARKET_PAGE_SIZE;
    this.renderRows();
  }

  get hasMore(): boolean {
    return this.orderedKeys.length > this.visibleCount;
  }

  get totalMarketCount(): number {
    return this.orderedKeys.length + this.pinnedKeys.length;
  }

  /**
   * Recompute the ordering snapshot.
   *
   * Called only from the things a user does — arriving, searching, changing the
   * sort, refreshing — never from a price update. Between these calls the row
   * order is frozen, so a market cannot climb past the one the user is reaching
   * for, and a tap lands where it was aimed.
   */
  private resnapshot() {
    const keyword = this.keyword.trim().toUpperCase();
    const matches = (market: PerpsMarket) =>
      !keyword || market.symbol.toUpperCase().includes(keyword);
    const pinned = this.markets.filter(
      (market) => this.isPinned(market) && matches(market)
    );
    const rest = this.markets.filter(
      (market) => !this.isPinned(market) && matches(market)
    );
    this.pinnedKeys = pinned.map((market) => market.key);
    this.orderedKeys = [...rest].sort(this.comparator()).map((m) => m.key);
    this.visibleCount = PERPS_MARKET_PAGE_SIZE;
    this.renderRows();
  }

  /**
   * Materialise rows from the frozen key order.
   *
   * Prices change by replacing market objects, so the rows are looked up afresh
   * — but always in snapshot order, which is what keeps a live update from
   * becoming a reshuffle.
   */
  private renderRows() {
    const byKey = new Map(this.markets.map((market) => [market.key, market]));
    this.pinnedMarkets = this.pinnedKeys
      .map((key) => byKey.get(key))
      .filter(Boolean);
    this.visibleMarkets = this.orderedKeys
      .slice(0, this.visibleCount)
      .map((key) => byKey.get(key))
      .filter(Boolean);
  }

  private comparator(): (a: PerpsMarket, b: PerpsMarket) => number {
    const sign = this.sortDirection === 'desc' ? 1 : -1;
    if (this.sortKey === 'change') {
      return (a, b) => {
        // A market with no computable change has no place in a ranking by
        // change: it sinks to the bottom either way rather than posing as 0%.
        if (a.changePercentExact === null || b.changePercentExact === null) {
          return a.changePercentExact === b.changePercentExact
            ? 0
            : a.changePercentExact === null
            ? 1
            : -1;
        }
        return (
          sign *
          new BigNumber(b.changePercentExact).comparedTo(a.changePercentExact)
        );
      };
    }
    return (a, b) =>
      sign * new BigNumber(b.dayVolumeExact).comparedTo(a.dayVolumeExact);
  }

  /** Favourites and the Neo ecosystem sit above the sorted list. */
  private isPinned(market: PerpsMarket): boolean {
    return (
      this.favorites.includes(market.coin) ||
      PERPS_NEO_COINS.includes(market.symbol)
    );
  }

  isFavorite(market: PerpsMarket): boolean {
    return this.favorites.includes(market.coin);
  }

  private loadListPreferences() {
    this.chrome.getStorage(STORAGE_NAME.perpsFavorites).subscribe((list) => {
      this.favorites = Array.isArray(list) ? list : [];
      this.resnapshot();
    });
    this.chrome.getStorage(STORAGE_NAME.perpsMarketSort).subscribe((saved) => {
      if (saved?.key === 'volume' || saved?.key === 'change') {
        this.sortKey = saved.key;
        this.sortDirection = saved.direction === 'asc' ? 'asc' : 'desc';
        this.resnapshot();
      }
    });
  }

  /** Collateral equity for the active account mode. */
  get accountEquityExact(): string {
    if (this.unsupportedAccountMode) {
      return '0';
    }
    return this.account?.totalBalanceExact ?? '0';
  }

  /**
   * Whether there is any equity at all. Templates cannot ask this of a decimal
   * string — `'0'` is truthy — so the question is answered here instead.
   */
  get hasEquity(): boolean {
    return new BigNumber(this.accountEquityExact).isGreaterThan(0);
  }

  /** Buying power, with free spot USDC folded only for Unified/portfolio mode. */
  get availableMarginExact(): string {
    if (this.unsupportedAccountMode) {
      return '0';
    }
    return this.account?.availableBalanceExact ?? '0';
  }

  /** Initial margin in use, reported by the perps clearinghouse. */
  get usedMarginExact(): string {
    return this.account?.totalMarginUsedExact ?? '0';
  }

  get marginRatioExact(): string | null {
    return this.account?.marginRatioExact ?? null;
  }

  /**
   * Which pool the margin ratio above describes. Shown whenever it is not the
   * canonical one, because "25%" means nothing if the user cannot tell which
   * of their independently-liquidated pools is at 25%.
   */
  get marginRatioDex(): string {
    return this.account?.marginRatioDex || '';
  }

  /**
   * Some DEX did not report, so the totals cover only part of the account.
   * The figures stay on screen — they are real for the pools that did report —
   * but they must not be presented as the whole picture.
   */
  get aggregateIncomplete(): boolean {
    return (this.account?.missingDexes?.length || 0) > 0;
  }

  /**
   * Actions that spend or move the account-wide total. Reducing or closing a
   * position on a DEX that did report stays available: blocking the exit is
   * worse than showing an incomplete balance.
   */
  get globalActionsDisabled(): boolean {
    return this.unsupportedAccountMode || this.aggregateIncomplete;
  }

  /**
   * Spot USDC held outside perps under a standard account: real balance, but it
   * needs a Spot→Perps transfer before it can back a position, so it is surfaced
   * separately instead of inflating the perps equity above.
   */
  get separateSpotUsdcExact(): string {
    return this.account && !this.account.unified
      ? this.account.spotUsdcExact ?? '0'
      : '0';
  }

  get hasSeparateSpotUsdc(): boolean {
    return new BigNumber(this.separateSpotUsdcExact).isGreaterThan(0);
  }

  /** Values on screen are last-known rather than live. */
  get feedStale(): boolean {
    return this.connectionState === 'stale';
  }

  /** How long ago the newest market frame arrived, for the stale banner. */
  get lastUpdatedLabel(): string {
    if (!this.marketFeedAt) {
      return '';
    }
    const seconds = Math.max(0, Math.round((Date.now() - this.marketFeedAt) / 1000));
    if (seconds < 60) {
      return `${seconds}s`;
    }
    return `${Math.floor(seconds / 60)}m`;
  }

  /**
   * The price a market row shows: the book mid, or the mark when no two-sided
   * book exists. The row labels which one it is — a mark is not a price anyone
   * can trade at, and letting it pass for one is how a user reads an untradeable
   * market as a tradeable one.
   */
  listPrice(market: PerpsMarket): string | null {
    return market.midPxExact ?? market.markPxExact ?? null;
  }

  /** True when the row is quoting the mark because the book has no mid. */
  usingMarkPrice(market: PerpsMarket): boolean {
    return !market.midPxExact && !!market.markPxExact;
  }

  /** A position's market, located by key so HIP-3 namesakes stay distinct. */
  marketFor(position: PerpsPosition): PerpsMarket {
    return this.markets.find((item) => item.key === position.key);
  }

  /**
   * Rows are identified by market key, so a price update rewrites the numbers
   * in place instead of tearing down and rebuilding every row — which is what
   * reloads each coin logo and loses the user's scroll position.
   */
  trackByKey(_index: number, market: PerpsMarket): string {
    return market.key;
  }

  /** Sign test for a decimal string, which a template cannot do with `< 0`. */
  isNegative(value: string | null): boolean {
    return value !== null && new BigNumber(value).isLessThan(0);
  }

  /** Return on equity arrives as a fraction; the label shows a percentage. */
  returnOnEquityPercent(position: PerpsPosition): string {
    return new BigNumber(position.returnOnEquityExact).times(100).toFixed();
  }

  get hasPositions(): boolean {
    if (this.unsupportedAccountMode) {
      return false;
    }
    return (this.account?.positions?.length || 0) > 0;
  }

  get unsupportedAccountMode(): boolean {
    return this.account?.abstractionMode === 'portfolioMargin';
  }

  /**
   * A position's size at its market's lot precision. Located by market key, not
   * by symbol: the same symbol can exist on the canonical DEX and on a HIP-3 one
   * with different lot precision. The markets arrive separately from the
   * account, so an unknown market falls back to sizing by magnitude rather than
   * showing nothing.
   */
  positionSize(position: PerpsPosition): string {
    const market = this.marketFor(position);
    return formatSize(
      new BigNumber(position.sziExact).absoluteValue(),
      market?.szDecimals
    );
  }

  toMarket(coin: string) {
    this.router.navigateByUrl(`/popup/perps/market/${coin}`);
  }

  toFunding(tab: 'deposit' | 'withdraw' | 'transfer') {
    if (this.unsupportedAccountMode) {
      return;
    }
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
}
