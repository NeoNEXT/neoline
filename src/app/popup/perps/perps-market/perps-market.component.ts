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
import { asyncScheduler, Subject, Unsubscribable } from 'rxjs';
import { tap, throttleTime } from 'rxjs/operators';

import { ChromeService } from '@/app/core';
import { HyperliquidService } from '@/app/core/services/perps/hyperliquid.service';
import { STORAGE_NAME } from '@popup/_lib';
import {
  PerpsCandle,
  PerpsCandleInterval,
  PerpsConnectionState,
  PerpsMarket,
  isCandleInterval,
  PERPS_CANDLE_INTERVAL_LABELS,
  PERPS_CANDLE_HISTORY_LIMIT,
  PERPS_CANDLE_LIMIT,
  PERPS_HOME_URL,
} from '@popup/_lib/perps';
import {
  chartPriceDecimals,
  formatFundingPercent,
  mergeCandles,
  pad2,
} from '../perps.util';

declare var chrome: any;

const PERPS_BASICS_URL =
  'https://hyperliquid.gitbook.io/hyperliquid-docs/trading/perpetual-futures';

/**
 * How often live candle frames are allowed to reach the view.
 *
 * Every frame is still folded into the dataset the moment it lands — this
 * rations only the check that redraws the chart. An active market prints
 * several trades a second, and under OnPush each one would otherwise have the
 * page checked and the canvas repainted to move one bar by a pixel.
 */
const CANDLE_REFRESH_MS = 1000;

/**
 * How closely snapshot requests may follow one another.
 *
 * Stepping through the interval row is four taps in about a second, and each
 * one would otherwise be its own snapshot — the priciest request this page
 * makes, since Hyperliquid charges a candle snapshot by the bar. The first tap
 * still fetches at once so a single one feels instant; the rest of the burst
 * collapses into the tap that ends it.
 */
const CANDLE_FETCH_MS = 300;

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
  private candleSub: Unsubscribable;
  /**
   * Snapshot requests, rationed.
   *
   * Wired here rather than in `ngOnInit` because the first request is issued
   * from the route's own callback: a pipe that started later would drop it.
   */
  private candleFetch$ = new Subject<void>();
  private fetchSub = this.candleFetch$
    .pipe(
      throttleTime(CANDLE_FETCH_MS, asyncScheduler, {
        leading: true,
        trailing: true,
      })
    )
    .subscribe(() => this.fetchCandles());
  /** Monotonic token so a stale candle snapshot can't overwrite a newer interval. */
  private candleReqId = 0;
  /** Live frames received after the current REST snapshot was requested. */
  private activeCandleSnapshot: {
    reqId: number;
    liveFrames: PerpsCandle[];
  } | null = null;
  /** A stale → live transition that happened while another snapshot was open. */
  private pendingCandleRecovery = false;
  /** True once an earlier snapshot added nothing, so we stop paging. */
  private historyExhausted = false;
  private historyLoading = false;
  private countdownTimer: any;

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private chrome: ChromeService,
    private hyperliquid: HyperliquidService,
    private cdr: ChangeDetectorRef
  ) {}

  ngOnInit() {
    this.connectionSub = this.hyperliquid
      .watchConnectionState()
      .subscribe((state) => {
        const recovered = this.connectionState === 'stale' && state === 'live';
        this.connectionState = state;
        if (recovered) {
          this.recoverCandles();
        }
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
    this.fetchSub?.unsubscribe();
    this.unwatchCandles();
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

  private loadCandles() {
    this.chartLoadError = false;
    this.chartRecoveryError = false;
    this.historyExhausted = false;
    this.historyLoading = false;
    this.unwatchCandles();
    this.candleReqId++;
    this.activeCandleSnapshot = null;
    this.pendingCandleRecovery = false;
    // Bars this session has already seen are drawn before the network is asked
    // anything: a spinner over a chart we could have painted is the worse
    // answer, and the snapshot behind it corrects the tail a moment later.
    const cached = this.hyperliquid.cachedCandles(this.coin, this.interval);
    // Nothing cached clears instead: candles from the previous interval under
    // the new interval's label are a chart of something the user did not ask
    // for.
    this.candles = cached || [];
    this.chartLoading = !cached;
    if (cached) {
      // Frames from here on, so what was painted from memory is current within
      // a second whether or not the snapshot behind it is quick.
      this.watchCandles();
    }
    this.cdr.markForCheck();
    this.candleFetch$.next();
  }

  /** The snapshot itself, once the tap that asked for it has settled. */
  private fetchCandles() {
    const reqId = this.candleReqId;
    // Anything already on screen came from the cache, and live frames may have
    // carried its trailing bar past what this snapshot saw — so the snapshot
    // is merged into it rather than put in its place.
    const seeded = this.candles.length > 0;
    this.beginCandleSnapshot(reqId);
    this.hyperliquid.getCandles(this.coin, this.interval).subscribe({
      next: (res) => {
        if (reqId !== this.candleReqId) {
          return;
        }
        const liveFrames = this.finishCandleSnapshot(reqId);
        this.candles = seeded
          ? mergeCandles(this.candles, res || [])
          : res || [];
        // A REST response can land after a newer websocket statement for the
        // same bar. Reapply frames observed during the request so arrival
        // order cannot make the older snapshot win.
        this.candles = mergeCandles(this.candles, liveFrames);
        this.chartLoading = false;
        this.chartLoadError = false;
        this.cacheCandles();
        this.cdr.markForCheck();
        if (!this.candleSub) {
          this.watchCandles();
        }
        this.runPendingCandleRecovery(reqId);
      },
      error: () => {
        if (reqId !== this.candleReqId) {
          return;
        }
        this.finishCandleSnapshot(reqId);
        this.chartLoading = false;
        // Cached bars stay up: they are what the exchange last said, and an
        // empty chart is not the more honest answer for a top-up that failed.
        if (!seeded) {
          this.candles = [];
          this.chartLoadError = true;
        }
        this.cdr.markForCheck();
        this.runPendingCandleRecovery(reqId);
      },
    });
  }

  /** Keep the remembered dataset in step with the one on screen. */
  private cacheCandles() {
    this.hyperliquid.rememberCandles(this.coin, this.interval, this.candles);
  }

  /**
   * Refill what the feed missed while it was down.
   *
   * A reconnected socket replays the subscription, but the exchange streams
   * only the bar that is open now: every bar that closed while we were dark is
   * a hole nothing else will ever fill. The snapshot is taken again and merged
   * into the existing tail while the gap remains queryable. Once the gap is
   * older than the exchange's 5000-bar history, the available range becomes a
   * genuinely different dataset and is reloaded rather than joined across a
   * hole.
   */
  private recoverCandles() {
    if (!this.coin) {
      return;
    }
    if (this.chartLoading || this.activeCandleSnapshot) {
      this.pendingCandleRecovery = true;
      return;
    }
    // Nothing on screen to merge into, so what is owed is the first load.
    if (!this.candles.length) {
      this.loadCandles();
      return;
    }
    const reqId = this.candleReqId;
    const endTime = Date.now();
    const intervalMs = this.hyperliquid.intervalMs(this.interval);
    const earliestRecoverable =
      endTime - intervalMs * PERPS_CANDLE_HISTORY_LIMIT;
    const lastTime = this.candles[this.candles.length - 1].t;
    const reloadAvailableDataset = lastTime < earliestRecoverable;
    const startTime = reloadAvailableDataset
      ? earliestRecoverable
      : lastTime;
    this.beginCandleSnapshot(reqId);
    this.hyperliquid
      .getCandleRange(this.coin, this.interval, startTime, endTime)
      .subscribe({
        next: (res) => {
          if (reqId !== this.candleReqId) {
            return;
          }
          const liveFrames = this.finishCandleSnapshot(reqId);
          if (reloadAvailableDataset && !res?.length) {
            this.chartRecoveryError = true;
            this.cdr.markForCheck();
            this.runPendingCandleRecovery(reqId);
            return;
          }
          this.candles = reloadAvailableDataset
            ? mergeCandles(res || [], liveFrames)
            : mergeCandles(
                mergeCandles(this.candles, res || []),
                liveFrames
              );
          this.chartRecoveryError = false;
          this.cacheCandles();
          this.cdr.markForCheck();
          this.runPendingCandleRecovery(reqId);
        },
        error: () => {
          if (reqId !== this.candleReqId) {
            return;
          }
          this.finishCandleSnapshot(reqId);
          // Price frames may be live again while the closed bars remain
          // incomplete. Keep what is known, but expose that interruption.
          this.chartRecoveryError = true;
          this.cdr.markForCheck();
          this.runPendingCandleRecovery(reqId);
        },
      });
  }

  private beginCandleSnapshot(reqId: number) {
    this.activeCandleSnapshot = { reqId, liveFrames: [] };
  }

  private finishCandleSnapshot(reqId: number): PerpsCandle[] {
    if (this.activeCandleSnapshot?.reqId !== reqId) {
      return [];
    }
    const frames = this.activeCandleSnapshot.liveFrames;
    this.activeCandleSnapshot = null;
    return frames;
  }

  private runPendingCandleRecovery(reqId: number) {
    if (reqId !== this.candleReqId || !this.pendingCandleRecovery) {
      return;
    }
    this.pendingCandleRecovery = false;
    this.recoverCandles();
  }

  /**
   * Another page of bars older than what is already on screen.
   *
   * The chart emits this when the user scrolls to the left edge. Prepending
   * keeps the dataset's right side (and therefore the live-update identity)
   * intact; an empty page means the exchange has nothing further back.
   */
  loadEarlierCandles() {
    if (
      this.historyExhausted ||
      this.historyLoading ||
      this.chartLoading ||
      !this.candles.length
    ) {
      return;
    }
    this.historyLoading = true;
    const endTime = this.candles[0].t;
    const reqId = this.candleReqId;
    this.hyperliquid
      .getCandles(this.coin, this.interval, PERPS_CANDLE_LIMIT, endTime)
      .subscribe({
        next: (res) => {
          if (reqId !== this.candleReqId) {
            return;
          }
          this.historyLoading = false;
          const older = (res || []).filter((candle) => candle.t < endTime);
          if (older.length === 0) {
            this.historyExhausted = true;
            return;
          }
          this.candles = [...older, ...this.candles];
          this.cacheCandles();
          this.cdr.markForCheck();
        },
        error: () => {
          if (reqId === this.candleReqId) {
            this.historyLoading = false;
          }
        },
      });
  }

  /** Live candle updates replace the trailing bar, or append when it rolls over. */
  private watchCandles() {
    const candleSubscription = {
      type: 'candle',
      coin: this.coin,
      interval: this.interval,
    };
    this.candleSub = this.hyperliquid
      .subscribe(candleSubscription)
      .pipe(
        // Folded before the throttle, never inside it: dropping whole frames
        // would lose a bar's closing print when it rolls over mid-window.
        // Only the redraw is rationed, and the dataset stays exact.
        tap((candle: PerpsCandle) => this.absorbCandle(candle)),
        // `leading` keeps the first frame after subscribing instant, so a
        // freshly opened chart never waits a second to start moving;
        // `trailing` guarantees the last frame of a burst still lands rather
        // than sitting invisible until the next trade prints.
        throttleTime(CANDLE_REFRESH_MS, asyncScheduler, {
          leading: true,
          trailing: true,
        })
      )
      .subscribe(() => {
        this.cacheCandles();
        this.cdr.markForCheck();
      });
  }

  /** Fold one live frame into the dataset, without touching the view. */
  private absorbCandle(candle: PerpsCandle) {
    if (!candle) {
      return;
    }
    if (this.activeCandleSnapshot?.reqId === this.candleReqId) {
      this.activeCandleSnapshot.liveFrames.push(candle);
    }
    const last = this.candles[this.candles.length - 1];
    if (last && last.t === candle.t) {
      this.candles = [...this.candles.slice(0, -1), candle];
    } else if (!last || candle.t > last.t) {
      // Append only. Dropping the oldest bar to hold a fixed window would
      // move the dataset's starting point, which is exactly how the chart
      // tells one dataset from another — so every roll-over would redraw
      // the whole series and throw away the user's zoom.
      this.candles = [...this.candles, candle];
    }
  }

  private unwatchCandles() {
    this.candleSub?.unsubscribe();
    this.candleSub = undefined;
  }

  private invalidateCandleDataset() {
    this.unwatchCandles();
    this.candleReqId++;
    this.activeCandleSnapshot = null;
    this.pendingCandleRecovery = false;
    this.candles = [];
    this.chartLoading = true;
    this.chartLoadError = false;
    this.chartRecoveryError = false;
    this.historyExhausted = false;
    this.historyLoading = false;
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
        // build no longer ships must not reach `getCandles`, which sizes its
        // request window from the interval and throws — synchronously, before
        // the subscription exists — on one it cannot size, leaving the chart
        // spinning with no error path to land in.
        if (isCandleInterval(saved)) {
          this.interval = saved;
        }
        this.cdr.markForCheck();
        this.loadCandles();
      });
  }

  selectInterval(interval: PerpsCandleInterval) {
    this.showIntervalMenu = false;
    if (this.interval === interval) {
      return;
    }
    this.interval = interval;
    this.chrome.setStorage(STORAGE_NAME.perpsChartInterval, interval);
    this.loadCandles();
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
