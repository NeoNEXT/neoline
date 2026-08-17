import {
  Component,
  EventEmitter,
  HostListener,
  Input,
  OnChanges,
  OnDestroy,
  OnInit,
  Output,
  SimpleChanges,
} from '@angular/core';
import { Router } from '@angular/router';
import BigNumber from 'bignumber.js';
import { Unsubscribable } from 'rxjs';

import { ChromeService } from '@/app/core';
import { STORAGE_NAME } from '@popup/_lib';
import { HyperliquidService } from '@/app/core/services/perps/hyperliquid.service';
import {
  PerpsConnectionState,
  PerpsMarket,
  PerpsMarketSortKey,
  PERPS_MARKET_PAGE_SIZE,
  PERPS_NEO_COINS,
} from '@popup/_lib/perps';
import { formatCompactUsd, formatPrice, formatSignedPercent } from '../perps.util';

/**
 * The market list itself: sorting, pinning, paging and the rows.
 *
 * It is shared by the home tab and the markets page. Searching and sorting are
 * the markets page's job — the tab just links to it and follows whatever was
 * chosen there — so the keyword arrives as an input rather than being held
 * here, and the list stays the one place row order is decided.
 */
@Component({
  selector: 'perps-market-list',
  templateUrl: 'perps-market-list.component.html',
  styleUrls: ['perps-market-list.component.scss'],
})
export class PerpsMarketListComponent implements OnInit, OnChanges, OnDestroy {
  /** Filter term. Empty shows everything. */
  @Input() keyword = '';
  /**
   * Show the sort control. The home tab renders the list without one and just
   * follows the saved preference — sorting is what the markets page is for.
   */
  @Input() showSort = false;
  /**
   * The markets this list is showing. Emitted so a host that needs them for
   * something else — the home tab sizes its positions by their market's
   * `szDecimals` — can read them off this subscription instead of opening a
   * second one: `watchMarkets` refetches per subscriber, and `/info` is charged
   * against a shared per-IP weight budget.
   */
  @Output() marketsLoaded = new EventEmitter<PerpsMarket[]>();

  loading = true;
  marketLoadError = false;

  markets: PerpsMarket[] = [];
  /** Markets kept at the top: favourites and the Neo ecosystem. */
  pinnedMarkets: PerpsMarket[] = [];
  /** The rows below the pinned block, in ordering-snapshot order. */
  visibleMarkets: PerpsMarket[] = [];

  sortKey: PerpsMarketSortKey = 'volume';
  readonly sortKeys: { key: PerpsMarketSortKey; label: string }[] = [
    { key: 'volume', label: 'perpsSortVolume' },
    { key: 'change', label: 'perpsSortChange' },
  ];
  sortMenuOpen = false;

  /** How many rows of the snapshot are materialised so far. */
  visibleCount = PERPS_MARKET_PAGE_SIZE;
  readonly skeletonRows = new Array(6);

  /** Feed health, which dims every quote the list is showing. */
  connectionState: PerpsConnectionState = 'connecting';

  private favorites: string[] = [];
  /** The frozen row order; see `resnapshot`. */
  private orderedKeys: string[] = [];
  private pinnedKeys: string[] = [];
  private renderTimer: any;

  private marketsSub: Unsubscribable;
  private connectionSub: Unsubscribable;

  //#region template helpers
  formatCompactUsd = formatCompactUsd;
  formatPrice = formatPrice;
  formatSignedPercent = formatSignedPercent;
  //#endregion

  constructor(
    private router: Router,
    private hyperliquid: HyperliquidService,
    private chrome: ChromeService
  ) {}

  ngOnInit() {
    this.watchMarkets();
    this.connectionSub = this.hyperliquid
      .watchConnectionState()
      .subscribe((state) => (this.connectionState = state));
    this.loadListPreferences();
  }

  ngOnChanges(changes: SimpleChanges) {
    // Typing is a user action, so it re-snapshots — the row order is allowed to
    // change here, unlike on a price update.
    if (changes.keyword && !changes.keyword.firstChange) {
      this.resnapshot();
    }
  }

  /** Tapping anywhere else dismisses the sort menu without choosing. */
  @HostListener('document:click', ['$event.target'])
  onDocumentClick(target: HTMLElement) {
    if (this.sortMenuOpen && !target?.closest?.('.sort-select-wrap')) {
      this.sortMenuOpen = false;
    }
  }

  ngOnDestroy() {
    this.marketsSub?.unsubscribe();
    this.connectionSub?.unsubscribe();
    clearTimeout(this.renderTimer);
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
        this.marketsLoaded.emit(markets);
      },
      error: () => {
        this.loading = false;
        this.marketLoadError = true;
      },
    });
  }

  /** The label the sort control shows for whatever is currently selected. */
  get sortKeyLabel(): string {
    return this.sortKeys.find((item) => item.key === this.sortKey)?.label || '';
  }

  setSortKey(key: PerpsMarketSortKey) {
    this.sortKey = key;
    this.sortMenuOpen = false;
    this.chrome.setStorage(STORAGE_NAME.perpsMarketSort, { key: this.sortKey });
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

  /** Values on screen are last-known rather than live. */
  get feedStale(): boolean {
    return this.connectionState === 'stale';
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
    const keyword = (this.keyword || '').trim().toUpperCase();
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

  /** Every sort key ranks highest-first; there is no direction to reverse. */
  private comparator(): (a: PerpsMarket, b: PerpsMarket) => number {
    if (this.sortKey === 'change') {
      return (a, b) => {
        // A market with no computable change has no place in a ranking by
        // change: it sinks to the bottom rather than posing as 0%.
        if (a.changePercentExact === null || b.changePercentExact === null) {
          return a.changePercentExact === b.changePercentExact
            ? 0
            : a.changePercentExact === null
            ? 1
            : -1;
        }
        return new BigNumber(b.changePercentExact).comparedTo(
          a.changePercentExact
        );
      };
    }
    return (a, b) =>
      new BigNumber(b.dayVolumeExact).comparedTo(a.dayVolumeExact);
  }

  /** Favourites and the Neo ecosystem sit above the sorted list. */
  private isPinned(market: PerpsMarket): boolean {
    return (
      this.favorites.includes(market.coin) ||
      PERPS_NEO_COINS.includes(market.symbol)
    );
  }

  private loadListPreferences() {
    this.chrome.getStorage(STORAGE_NAME.perpsFavorites).subscribe((list) => {
      this.favorites = Array.isArray(list) ? list : [];
      this.resnapshot();
    });
    this.chrome.getStorage(STORAGE_NAME.perpsMarketSort).subscribe((saved) => {
      if (this.sortKeys.some((item) => item.key === saved?.key)) {
        this.sortKey = saved.key;
        this.resnapshot();
      }
    });
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

  toMarket(coin: string) {
    this.router.navigateByUrl(`/popup/perps/market/${coin}`);
  }
}
