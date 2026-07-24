import { Component, OnDestroy, OnInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { Store } from '@ngrx/store';
import { Unsubscribable } from 'rxjs';

import { AppState } from '@/app/reduers';
import { ChromeService, HyperliquidService } from '@/app/core';
import { STORAGE_NAME } from '@popup/_lib';
import {
  PerpsCandle,
  PerpsCandleInterval,
  PerpsFill,
  PerpsMarket,
} from '@popup/_lib/perps';
import {
  coinColor,
  coinLogo,
  formatCompactUsd,
  formatFillTime,
  formatPrice,
  formatSignedPercent,
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
  private candleSub: Unsubscribable;
  /** Monotonic token so a stale candle snapshot can't overwrite a newer interval. */
  private candleReqId = 0;
  private countdownTimer: any;

  //#region template helpers
  coinLogo = coinLogo;
  coinColor = coinColor;
  formatPrice = formatPrice;
  formatCompactUsd = formatCompactUsd;
  formatSignedPercent = formatSignedPercent;
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
    this.unwatchCandles();
    clearInterval(this.countdownTimer);
  }

  get priceDecimals(): number {
    return priceDecimals(this.market?.markPx || 0);
  }

  /** Funding is quoted per hour; show it the way Hyperliquid's own UI does. */
  get fundingPercent(): string {
    if (!this.market) {
      return '--';
    }
    return `${(this.market.funding * 100).toFixed(4)}%`;
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
    this.hyperliquid.getUserFills(this.address).subscribe((fills) => {
      this.fills = fills.filter((f) => f.coin === this.coin).slice(0, 5);
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
    this.unwatchCandles();
    const reqId = ++this.candleReqId;
    this.hyperliquid.getCandles(this.coin, this.interval).subscribe((res) => {
      if (reqId !== this.candleReqId) {
        // A newer interval selection superseded this request while in flight.
        return;
      }
      this.candles = res;
      this.chartLoading = false;
      this.watchCandles();
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

  learnBasics() {
    if (chrome.tabs) {
      chrome.tabs.create({ url: PERPS_BASICS_URL });
    } else {
      window.open(PERPS_BASICS_URL, '_blank');
    }
  }

  back() {
    this.router.navigateByUrl('/popup/home');
  }

  toOrder(side: 'long' | 'short') {
    this.router.navigateByUrl(`/popup/perps/order/${this.coin}?side=${side}`);
  }
}
