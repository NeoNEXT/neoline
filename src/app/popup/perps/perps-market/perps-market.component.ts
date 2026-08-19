import { Component, OnDestroy, OnInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { Store } from '@ngrx/store';
import BigNumber from 'bignumber.js';
import { Unsubscribable } from 'rxjs';

import { AppState } from '@/app/reduers';
import { ChromeService } from '@/app/core';
import { HyperliquidService } from '@/app/core/services/perps/hyperliquid.service';
import { STORAGE_NAME } from '@popup/_lib';
import {
  PerpsCandle,
  PerpsCandleInterval,
  PerpsFill,
  PerpsMarket,
  PERPS_HOME_URL,
} from '@popup/_lib/perps';
import {
  formatCompactUsd,
  formatFillTime,
  formatPrice,
  formatSignedPercent,
  formatSignedUsd,
  formatSize,
  pad2,
  priceDecimals,
} from '../perps.util';

declare var chrome: any;

const PERPS_BASICS_URL =
  'https://hyperliquid.gitbook.io/hyperliquid-docs/trading/perpetual-futures';

@Component({
  templateUrl: 'perps-market.component.html',
  styleUrls: ['perps-market.component.scss'],
})
export class PerpsMarketComponent implements OnInit, OnDestroy {
  coin: string;
  market: PerpsMarket;
  fills: PerpsFill[] = [];

  candles: PerpsCandle[] = [];
  chartLoading = true;
  chartLoadError = false;
  interval: PerpsCandleInterval = '15m';
  readonly quickIntervals: PerpsCandleInterval[] = ['1m', '3m', '5m', '15m'];
  readonly longIntervals: PerpsCandleInterval[] = ['1h', '4h', '1d'];
  longInterval: PerpsCandleInterval = '1d';
  showIntervalMenu = false;

  isFavorite = false;
  /** Time to the next hourly funding settlement, as HH:MM:SS. */
  fundingCountdown = '';

  private address: string;
  private accountSub: Unsubscribable;
  private marketsSub: Unsubscribable;
  private fillsSub: Unsubscribable;
  private candleSub: Unsubscribable;
  /** Monotonic token so a stale candle snapshot can't overwrite a newer interval. */
  private candleReqId = 0;
  private countdownTimer: any;

  //#region template helpers
  formatPrice = formatPrice;
  formatCompactUsd = formatCompactUsd;
  formatSignedPercent = formatSignedPercent;
  formatSignedUsd = formatSignedUsd;
  //#endregion

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private store: Store<AppState>,
    private chrome: ChromeService,
    private hyperliquid: HyperliquidService
  ) {}

  ngOnInit() {
    this.coin = this.route.snapshot.params.coin;
    this.accountSub = this.store.select('account').subscribe((state) => {
      const address = state.currentWallet?.accounts[0]?.address;
      if (address && address !== this.address) {
        this.address = address;
        this.loadFills();
      }
    });
    this.loadMarket();
    this.loadCandles();
    this.loadFavorite();
    this.tickCountdown();
    this.countdownTimer = setInterval(() => this.tickCountdown(), 1000);
  }

  ngOnDestroy() {
    this.accountSub?.unsubscribe();
    this.marketsSub?.unsubscribe();
    this.fillsSub?.unsubscribe();
    this.unwatchCandles();
    clearInterval(this.countdownTimer);
  }

  get priceDecimals(): number {
    // The axis follows the market's own tick, so it cannot show a precision
    // the exchange never quotes, nor disagree with the header above it.
    return priceDecimals(
      this.displayPrice,
      this.market?.szDecimals,
      this.usingMid
    );
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
   * The live mid from the shared market stream — the same price the market
   * list and the order form quote, so one coin reads the same everywhere.
   *
   * The chart's trailing candle is deliberately not used: a candle only moves
   * when a trade prints, so a quiet market freezes the header while the book
   * keeps moving, and changing interval would change what the header quotes.
   * Mark and oracle stay where they belong — margin, liquidation and funding —
   * with the oracle shown on its own row in the stats card below.
   */
  get displayPrice(): string | null {
    return this.market?.midPxExact ?? this.market?.markPxExact ?? null;
  }

  /** Quoted off the same price shown beside it, against yesterday's close. */
  get displayChangePercent(): string | null {
    return this.market?.changePercentExact ?? null;
  }

  /** Funding is quoted per hour; show it the way Hyperliquid's own UI does. */
  get fundingPercent(): string {
    if (!this.market) {
      return '--';
    }
    return `${new BigNumber(this.market.fundingExact).times(100).toFixed(4)}%`;
  }

  /** Sign test for a decimal string, which a template cannot do with `< 0`. */
  isNegative(value: string | null): boolean {
    return value !== null && new BigNumber(value).isLessThan(0);
  }

  /** Funding settles on the hour; count down to the next boundary. */
  private tickCountdown() {
    const hourMs = 3600 * 1000;
    const remaining = hourMs - (Date.now() % hourMs);
    const total = Math.floor(remaining / 1000);
    this.fundingCountdown = `${pad2(Math.floor(total / 3600))}:${pad2(
      Math.floor((total % 3600) / 60)
    )}:${pad2(total % 60)}`;
  }

  private loadMarket() {
    this.marketsSub = this.hyperliquid.watchMarkets().subscribe((markets) => {
      this.market = markets.find((m) => m.coin === this.coin);
    });
  }

  private loadFills() {
    this.fillsSub?.unsubscribe();
    this.fillsSub = this.hyperliquid
      .watchUserFills(this.address)
      .subscribe((update) => {
        const incoming: PerpsFill[] = Array.isArray(update)
          ? update
          : update?.fills || [];
        const merged = update?.isSnapshot
          ? incoming
          : [...incoming, ...this.fills];
        const seen = new Set<string>();
        this.fills = merged
          .filter((fill) => fill.coin === this.coin)
          .filter((fill) => {
            const key = `${fill.tid ?? ''}:${fill.oid ?? ''}:${fill.time}:${fill.px}:${fill.sz}`;
            if (seen.has(key)) {
              return false;
            }
            seen.add(key);
            return true;
          })
          .sort((a, b) => b.time - a.time)
          .slice(0, 5);
      });
  }

  //#region favorite

  private loadFavorite() {
    this.chrome.getStorage(STORAGE_NAME.perpsFavorites).subscribe((list) => {
      this.isFavorite = Array.isArray(list) && list.includes(this.coin);
    });
  }

  toggleFavorite() {
    this.chrome.getStorage(STORAGE_NAME.perpsFavorites).subscribe((list) => {
      const favorites: string[] = Array.isArray(list) ? list : [];
      const next = favorites.includes(this.coin)
        ? favorites.filter((item) => item !== this.coin)
        : [...favorites, this.coin];
      this.chrome.setStorage(STORAGE_NAME.perpsFavorites, next);
      this.isFavorite = next.includes(this.coin);
    });
  }

  //#endregion

  //#region candles

  private loadCandles() {
    this.chartLoading = true;
    this.chartLoadError = false;
    this.unwatchCandles();
    const reqId = ++this.candleReqId;
    this.hyperliquid.getCandles(this.coin, this.interval).subscribe({
      next: (res) => {
        if (reqId !== this.candleReqId) {
          return;
        }
        this.candles = res;
        this.chartLoading = false;
        this.chartLoadError = false;
        this.watchCandles();
      },
      error: () => {
        if (reqId === this.candleReqId) {
          this.candles = [];
          this.chartLoading = false;
          this.chartLoadError = true;
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
      .subscribe((candle: PerpsCandle) => {
        if (!candle) {
          return;
        }
        const last = this.candles[this.candles.length - 1];
        if (last && last.t === candle.t) {
          this.candles = [...this.candles.slice(0, -1), candle];
        } else {
          this.candles = [...this.candles.slice(1), candle];
        }
      });
  }

  private unwatchCandles() {
    this.candleSub?.unsubscribe();
    this.candleSub = undefined;
  }

  selectInterval(interval: PerpsCandleInterval) {
    if (this.interval === interval) {
      return;
    }
    this.interval = interval;
    this.showIntervalMenu = false;
    this.loadCandles();
  }

  selectLongInterval(interval: PerpsCandleInterval) {
    this.longInterval = interval;
    this.selectInterval(interval);
  }

  //#endregion

  fillLabel(fill: PerpsFill): string {
    return fill.dir || (fill.side === 'B' ? 'Buy' : 'Sell');
  }

  fillIsBuy(fill: PerpsFill): boolean {
    return fill.side === 'B';
  }

  fillTime(fill: PerpsFill): string {
    return formatFillTime(fill.time);
  }

  fillSize(fill: PerpsFill): string {
    return formatSize(fill.sz, this.market?.szDecimals);
  }

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
    this.router.navigateByUrl(`/popup/perps/order/${this.coin}?side=${side}`);
  }
}
