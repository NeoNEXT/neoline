import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  ElementRef,
  OnDestroy,
  OnInit,
  ViewChild,
} from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { asyncScheduler, Unsubscribable } from 'rxjs';
import { tap, throttleTime } from 'rxjs/operators';

import { ChromeService } from '@/app/core';
import { HyperliquidService } from '@/app/core/services/perps/hyperliquid.service';
import {
  PerpsCandleAvailability,
  PerpsCandleDatasetState,
} from '@/app/core/services/perps/perps-candle-dataset';
import { PerpsCandleDatasetService } from '@/app/core/services/perps/perps-candle-dataset.service';
import { STORAGE_NAME } from '@popup/_lib';
import {
  PerpsCandle,
  PerpsCandleInterval,
  PerpsConnectionState,
  PerpsMarket,
  isCandleInterval,
  PERPS_CANDLE_INTERVAL_LABELS,
  PERPS_HOME_URL,
} from '@popup/_lib/perps';
import {
  chartPriceDecimals,
  formatFundingPercent,
  pad2,
} from '../perps.util';

declare var chrome: any;

const PERPS_BASICS_URL =
  'https://hyperliquid.gitbook.io/hyperliquid-docs/trading/perpetual-futures';

/**
 * How often candle updates are allowed to redraw the chart.
 *
 * Every state is still absorbed the moment it lands — this rations only the
 * check that redraws the chart. An active market prints
 * several trades a second, and under OnPush each one would otherwise have the
 * page checked and the canvas repainted to move one bar by a pixel.
 */
const CANDLE_REFRESH_MS = 1000;

@Component({
  templateUrl: 'perps-market.component.html',
  styleUrls: ['perps-market.component.scss'],
  // Everything on this page arrives from a subscription, and the funding
  // countdown alone would otherwise have the whole popup re-checked once a
  // second. Every callback below marks the view itself; one that forgets to is
  // a view that silently stops updating.
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PerpsMarketComponent implements OnInit, OnDestroy {
  coin: string;
  market: PerpsMarket;
  /**
   * How much of this market is known. `missing` is the exchange answering that
   * it does not carry this coin, which is a settled fact and not worth
   * retrying; `error` is a request that failed, which is.
   */
  marketStatus: 'loading' | 'ready' | 'missing' | 'error' = 'loading';
  connectionState: PerpsConnectionState = 'connecting';

  candles: PerpsCandle[] = [];
  chartLoading = true;
  chartLoadError = false;
  /** The live stream recovered, but its closed-candle gap could not be filled. */
  chartRecoveryError = false;
  interval: PerpsCandleInterval = '15m';
  /** Intraday granularities, always on screen. */
  readonly quickIntervals: PerpsCandleInterval[] = ['1m', '5m', '15m', '1h'];
  /** The longer ones, behind the menu, where they are picked far less often. */
  readonly longIntervals: PerpsCandleInterval[] = ['12h', '1d', '1w', '1M'];
  showIntervalMenu = false;

  /** Whether the market switcher is open under the header. */
  showCoinMenu = false;
  /**
   * What the switcher is filtered by.
   *
   * Held here rather than in the list so it can be cleared when the menu
   * closes: a keyword left over from the last time it was opened would hide
   * every market but one, and the user would be reading that as the whole
   * exchange.
   */
  coinKeyword = '';

  /** Time to the next hourly funding settlement, as HH:MM:SS. */
  fundingCountdown = '';
  /** Placeholder rows standing in for the stats card before the first frame. */
  readonly statsSkeletonRows = [0, 1, 2, 3];

  /**
   * The switcher's search field, focused the moment it exists.
   *
   * A setter rather than `ngAfterViewInit`: the field is created and destroyed
   * with the menu, so there is no one moment after init to focus it. Opening
   * the switcher is already the decision to look for another market, and this
   * is what lets that continue at the keyboard instead of at the mouse.
   */
  @ViewChild('coinSearch') set coinSearch(field: ElementRef<HTMLInputElement>) {
    field?.nativeElement.focus();
  }

  private routeSub: Unsubscribable;
  private marketsSub: Unsubscribable;
  private connectionSub: Unsubscribable;
  private datasetSub: Unsubscribable;
  /** What the dataset last said, so a change of kind is never held back. */
  private datasetAvailability: PerpsCandleAvailability = 'loading';
  private countdownTimer: any;

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private chrome: ChromeService,
    private hyperliquid: HyperliquidService,
    private candleDatasets: PerpsCandleDatasetService,
    private cdr: ChangeDetectorRef
  ) {}

  ngOnInit() {
    this.connectionSub = this.hyperliquid
      .watchConnectionState()
      .subscribe((state) => {
        // Recovery is the dataset's own business now; the page reads the
        // connection only to say whether what is on screen is still live.
        this.connectionState = state;
        this.cdr.markForCheck();
      });
    this.routeSub = this.route.params.subscribe((params) =>
      this.openMarket(params.coin)
    );
    this.tickCountdown();
    this.countdownTimer = setInterval(() => this.tickCountdown(), 1000);
  }

  /**
   * Point the page at a market.
   *
   * Driven by the parameter stream rather than by the route snapshot: Angular
   * reuses this component when only the parameter changes, and a snapshot read
   * once at init would leave the previous market's price, statistics and
   * candles on screen under the new market's URL.
   */
  private openMarket(coin: string) {
    // Invalidate before changing the series key. Otherwise Angular can render
    // the previous coin's bars under the new coin while storage is answering
    // which interval to load.
    this.invalidateCandleDataset();
    this.coin = coin;
    this.market = undefined;
    this.marketStatus = 'loading';
    // Arriving at another market is the switcher's job done, however the
    // navigation was started — the menu belongs to the market it was opened
    // over, and left up it would be covering the answer it just gave.
    this.closeCoinMenu();
    this.loadMarket();
    this.loadChartInterval();
    this.cdr.markForCheck();
  }

  ngOnDestroy() {
    this.routeSub?.unsubscribe();
    this.marketsSub?.unsubscribe();
    this.connectionSub?.unsubscribe();
    this.unwatchDataset();
    clearInterval(this.countdownTimer);
  }

  get priceDecimals(): number {
    // The axis follows the market's own tick, not whatever precision the
    // current price happens to be carrying: a price that lands on a round
    // number would otherwise drag the whole axis down with it.
    return chartPriceDecimals(this.market?.szDecimals);
  }

  /**
   * What identifies the candles on screen. Changing either half means the next
   * array is a different dataset rather than a newer view of this one.
   */
  get chartSeriesKey(): string {
    return `${this.coin}:${this.interval}`;
  }

  /**
   * The name to show. The route carries the protocol coin, which on a HIP-3
   * market is prefixed with its DEX; that prefix belongs in the badge beside
   * the name, not inside it.
   */
  get symbol(): string {
    return this.market?.symbol ?? this.coin;
  }

  /** Whether the header price is the book mid rather than the mark fallback. */
  get usingMid(): boolean {
    return !!this.market?.midPxExact;
  }

  /**
   * Whether what is on screen is still live.
   *
   * Read from the connection itself rather than from how long ago a frame
   * arrived: a quiet market still produces periodic frames, but silence alone
   * never condemns a healthy socket.
   */
  get isStale(): boolean {
    return this.connectionState === 'stale';
  }

  /** Nothing to show yet, as opposed to shown and genuinely absent. */
  get isLoading(): boolean {
    return this.marketStatus === 'loading';
  }

  /**
   * Whether Long and Short may lead to the order form.
   *
   * A feed that is no longer live and a market with no two-sided book are
   * different faults with the same consequence: there is no price the order
   * form could honestly quote from here, so the entry closes rather than
   * handing the problem downstream.
   */
  get canOrder(): boolean {
    return (
      this.marketStatus === 'ready' &&
      this.connectionState === 'live' &&
      this.usingMid
    );
  }

  /**
   * Why the trade entry is closed, as a translation key, or `''` when open.
   *
   * Only speaks for a market that loaded. Before that there is no entry on
   * screen to explain: the page is showing a skeleton or saying why it has no
   * market at all, and a second sentence about the buttons would be answering
   * a question the user cannot yet have asked.
   */
  get orderBlockedKey(): string {
    if (this.canOrder || this.marketStatus !== 'ready') {
      return '';
    }
    // Not the banner's wording: the banner says what happened to the data,
    // this says what it costs the user. Repeating one sentence twice on one
    // screen reads as a rendering fault rather than as two facts.
    if (this.connectionState !== 'live') {
      return this.isStale ? 'perpsEntryStale' : 'perpsEntryConnecting';
    }
    return 'perpsNoTwoSidedBook';
  }

  /**
   * The live mid from this market's own feed, falling back to the mark, which
   * the header then labels as such.
   *
   * The chart's trailing candle is deliberately not used: a candle only moves
   * when a trade prints, so a quiet market freezes the header while the book
   * keeps moving, and changing interval would change what the header quotes.
   * Mark and oracle also keep their own rows in the stats card, where their
   * jobs — margin and liquidation, funding — are named.
   */
  get displayPrice(): string | null {
    return this.market?.midPxExact ?? this.market?.markPxExact ?? null;
  }

  /** Quoted off the same price shown beside it, against yesterday's close. */
  get displayChangePercent(): string | null {
    return this.market?.changePercentExact ?? null;
  }

  /**
   * Whether a 24h change can be quoted at all.
   *
   * A market whose header price fell back to the mark has no change to show:
   * `prevDayPx` is a mid, and comparing it to a mark would invent a number.
   * That is market statistics unavailable, which reads as "no data" — never as
   * `0%`.
   */
  get hasChange(): boolean {
    return this.displayChangePercent !== null;
  }

  /** Funding is quoted per hour; show it the way Hyperliquid's own UI does. */
  get fundingPercent(): string {
    return formatFundingPercent(this.market?.fundingExact);
  }

  /**
   * How an interval is written on screen.
   *
   * Never the protocol value: `1d` and `1w` are shown capitalised, and the
   * monthly `1M` sits one capital away from the minute `1m`. Comparisons,
   * storage and requests all stay on the protocol value.
   */
  intervalLabel(interval: PerpsCandleInterval): string {
    return PERPS_CANDLE_INTERVAL_LABELS[interval];
  }

  /**
   * What the menu button reads.
   *
   * It names the current interval when the selection lives inside the menu,
   * and otherwise says there is more in here — showing a fixed `1D` while the
   * user is looking at 15-minute candles states the wrong thing about what is
   * on screen.
   */
  get intervalMenuLabel(): string {
    return this.intervalInMenu ? this.intervalLabel(this.interval) : '';
  }

  /** Whether the menu holds the current selection, and so reads as chosen. */
  get intervalInMenu(): boolean {
    return this.longIntervals.includes(this.interval);
  }

  /** Funding settles on the hour; count down to the next boundary. */
  private tickCountdown() {
    const hourMs = 3600 * 1000;
    const remaining = hourMs - (Date.now() % hourMs);
    const total = Math.floor(remaining / 1000);
    this.fundingCountdown = `${pad2(Math.floor(total / 3600))}:${pad2(
      Math.floor((total % 3600) / 60)
    )}:${pad2(total % 60)}`;
    this.cdr.markForCheck();
  }

  private loadMarket() {
    this.marketsSub?.unsubscribe();
    this.marketsSub = this.hyperliquid.watchMarketDetail(this.coin).subscribe({
      next: (market) => {
        this.market = market ?? undefined;
        this.marketStatus = market ? 'ready' : 'missing';
        this.cdr.markForCheck();
      },
      error: () => {
        this.marketStatus = 'error';
        this.cdr.markForCheck();
      },
    });
  }

  //#region coin switcher

  toggleCoinMenu() {
    if (this.showCoinMenu) {
      this.closeCoinMenu();
      return;
    }
    this.showCoinMenu = true;
    this.cdr.markForCheck();
  }

  closeCoinMenu() {
    this.showCoinMenu = false;
    // The keyword goes with the menu: the next market the user looks for is a
    // new search, not a continuation of the one they abandoned.
    this.coinKeyword = '';
    this.cdr.markForCheck();
  }

  //#endregion

  //#region candles

  private watchDataset() {
    this.unwatchDataset();
    if (!this.coin) {
      return;
    }
    this.datasetSub = this.candleDatasets
      .watchDataset(this.coin, this.interval)
      .pipe(
        // Absorbed before the throttle, never inside it: dropping whole states
        // would lose a bar's closing print when it rolls over mid-window. Only
        // the redraw is rationed, and what the page holds stays exact.
        tap((state: PerpsCandleDatasetState) => this.absorbDataset(state)),
        // `leading` keeps the first state after subscribing instant, so a
        // freshly opened chart never waits a second to appear; `trailing`
        // guarantees the last frame of a burst still lands rather than sitting
        // invisible until the next trade prints.
        throttleTime(CANDLE_REFRESH_MS, asyncScheduler, {
          leading: true,
          trailing: true,
        })
      )
      .subscribe(() => this.cdr.markForCheck());
  }

  /**
   * Take one dataset state, without redrawing for it.
   *
   * A change of kind is marked at once rather than rationed: a chart that has
   * just failed, or has just lost the bars that closed while the feed was
   * down, is saying something that must not wait for the next throttle window.
   */
  private absorbDataset(state: PerpsCandleDatasetState) {
    const changedKind = this.datasetAvailability !== state.availability;
    this.datasetAvailability = state.availability;
    this.candles = state.candles;
    this.chartLoading = state.availability === 'loading';
    this.chartLoadError = state.availability === 'unavailable';
    this.chartRecoveryError = state.availability === 'gapped';
    if (changedKind) {
      this.cdr.markForCheck();
    }
  }

  private unwatchDataset() {
    this.datasetSub?.unsubscribe();
    this.datasetSub = undefined;
  }

  /**
   * Another page of bars older than what is already on screen.
   *
   * The chart emits this when the user scrolls to the left edge; whether there
   * is anything further back to ask for is the dataset's own bookkeeping.
   */
  loadEarlierCandles() {
    if (this.coin) {
      this.candleDatasets.loadEarlier(this.coin, this.interval);
    }
  }

  private invalidateCandleDataset() {
    this.unwatchDataset();
    this.datasetAvailability = 'loading';
    this.candles = [];
    this.chartLoading = true;
    this.chartLoadError = false;
    this.chartRecoveryError = false;
  }

  /**
   * The interval the user last chose, which is a viewing habit rather than a
   * property of any one market — so it is remembered once, not per market.
   */
  private loadChartInterval() {
    this.chrome
      .getStorage(STORAGE_NAME.perpsChartInterval)
      .subscribe((saved) => {
        // Storage answers with whatever an older build wrote. An interval this
        // build no longer ships must not reach the dataset, which sizes its
        // request window from the interval and throws — synchronously, before
        // the subscription exists — on one it cannot size, leaving the chart
        // spinning with no error path to land in.
        if (isCandleInterval(saved)) {
          this.interval = saved;
        }
        this.cdr.markForCheck();
        this.watchDataset();
      });
  }

  selectInterval(interval: PerpsCandleInterval) {
    this.showIntervalMenu = false;
    if (this.interval === interval) {
      return;
    }
    this.interval = interval;
    this.chrome.setStorage(STORAGE_NAME.perpsChartInterval, interval);
    this.watchDataset();
  }

  //#endregion

  learnBasics() {
    if (chrome.tabs) {
      chrome.tabs.create({ url: PERPS_BASICS_URL });
    } else {
      window.open(PERPS_BASICS_URL, '_blank');
    }
  }

  back() {
    this.router.navigateByUrl(PERPS_HOME_URL);
  }

  toOrder(side: 'long' | 'short') {
    if (!this.canOrder) {
      return;
    }
    this.router.navigateByUrl(`/popup/perps/order/${this.coin}?side=${side}`);
  }
}
