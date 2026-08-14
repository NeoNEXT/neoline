import {
  AfterViewInit,
  Component,
  ElementRef,
  Input,
  NgZone,
  OnChanges,
  OnDestroy,
  SimpleChanges,
  ViewChild,
} from '@angular/core';
import {
  ColorType,
  createChart,
  IChartApi,
  ISeriesApi,
  UTCTimestamp,
} from 'lightweight-charts';
import BigNumber from 'bignumber.js';
import { PerpsCandle } from '@popup/_lib/perps';

/** Colors shared by both themes; grid/text colors are read from CSS variables. */
const UP_COLOR = '#06ccab';
const DOWN_COLOR = '#fa5555';
const VOLUME_ALPHA = '59'; // 35% opacity suffix for 8-digit hex colors
/** Candles stay legible at extension width up to about this many on screen. */
const INITIAL_VISIBLE_BARS = 30;
const RIGHT_OFFSET_BARS = 2;

/**
 * Candlestick + volume chart backed by the lightweight-charts library.
 *
 * The public contract is unchanged from the original SVG implementation:
 * candles in, sized chart out. Incremental updates go through `series.update`
 * so live ticks don't reset the user's zoom or scroll position.
 */
@Component({
  selector: 'perps-chart',
  templateUrl: 'perps-chart.component.html',
  styleUrls: ['perps-chart.component.scss'],
})
export class PerpsChartComponent implements AfterViewInit, OnChanges, OnDestroy {
  @Input() candles: PerpsCandle[] = [];
  @Input() loading = false;
  /** Decimal places used for the price axis. */
  @Input() priceDecimals = 4;

  @ViewChild('chartContainer', { static: true })
  private container: ElementRef<HTMLDivElement>;

  private chart: IChartApi;
  private candleSeries: ISeriesApi<'Candlestick'>;
  private volumeSeries: ISeriesApi<'Histogram'>;
  private themeObserver: MutationObserver;
  private viewReady = false;
  /** Fingerprint of the rendered range, to tell live ticks from full reloads. */
  private renderedFirstTime = 0;
  private renderedCount = 0;

  constructor(private zone: NgZone) {}

  get isEmpty(): boolean {
    return !this.loading && (!this.candles || this.candles.length === 0);
  }

  ngAfterViewInit() {
    this.viewReady = true;
    if (this.candles?.length) {
      this.render();
    }
    // Grid and axis text colors differ between the two app themes.
    this.themeObserver = new MutationObserver(() => this.applyThemeColors());
    this.themeObserver.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-theme-style'],
    });
  }

  ngOnChanges(changes: SimpleChanges) {
    if (!this.viewReady) {
      return;
    }
    if (changes.candles) {
      this.render();
    }
    if (changes.priceDecimals && this.candleSeries) {
      this.zone.runOutsideAngular(() =>
        this.candleSeries.applyOptions({
          priceFormat: {
            type: 'price',
            precision: this.priceDecimals,
            minMove: Math.pow(10, -this.priceDecimals),
          },
        })
      );
    }
  }

  ngOnDestroy() {
    this.themeObserver?.disconnect();
    if (this.chart) {
      this.chart.remove();
      this.chart = undefined;
    }
  }

  private render() {
    const data = this.candles || [];
    if (data.length === 0) {
      return;
    }
    this.zone.runOutsideAngular(() => {
      if (!this.chart) {
        this.createChart();
      }
      const firstTime = data[0].t;
      const isLiveTick =
        firstTime === this.renderedFirstTime &&
        data.length === this.renderedCount;
      if (isLiveTick) {
        // Same window, refreshed trailing bar: update in place to keep zoom.
        this.applyBar(data[data.length - 1]);
      } else {
        this.setAllData(data);
        this.showRecentBars(data.length);
      }
      this.renderedFirstTime = firstTime;
      this.renderedCount = data.length;
    });
  }

  private createChart() {
    const colors = this.readThemeColors();
    this.chart = createChart(this.container.nativeElement, {
      autoSize: true,
      layout: {
        background: { type: ColorType.Solid, color: 'transparent' },
        textColor: colors.text,
        fontSize: 10,
      },
      grid: {
        vertLines: { visible: false },
        horzLines: { color: colors.grid },
      },
      rightPriceScale: { borderVisible: false },
      timeScale: {
        borderVisible: false,
        timeVisible: true,
        secondsVisible: false,
      },
      crosshair: {
        horzLine: { labelBackgroundColor: colors.text },
        vertLine: { labelBackgroundColor: colors.text },
      },
    });
    this.candleSeries = this.chart.addCandlestickSeries({
      upColor: UP_COLOR,
      downColor: DOWN_COLOR,
      wickUpColor: UP_COLOR,
      wickDownColor: DOWN_COLOR,
      borderVisible: false,
      priceFormat: {
        type: 'price',
        precision: this.priceDecimals,
        minMove: Math.pow(10, -this.priceDecimals),
      },
    });
    this.volumeSeries = this.chart.addHistogramSeries({
      priceScaleId: 'volume',
      priceFormat: { type: 'volume' },
      lastValueVisible: false,
      priceLineVisible: false,
    });
    // Volume occupies the bottom fifth, candles keep the rest.
    this.chart
      .priceScale('volume')
      .applyOptions({ scaleMargins: { top: 0.8, bottom: 0 } });
    this.candleSeries
      .priceScale()
      .applyOptions({ scaleMargins: { top: 0.15, bottom: 0.3 } });
  }

  /**
   * `fitContent` compressed the complete candle snapshot into one screen. Start
   * at a readable density instead, while leaving later live ticks and user
   * zoom/scroll untouched.
   */
  private showRecentBars(dataLength: number) {
    const lastIndex = dataLength - 1;
    this.chart.timeScale().setVisibleLogicalRange({
      from: Math.max(0, lastIndex - INITIAL_VISIBLE_BARS + 1),
      to: lastIndex + RIGHT_OFFSET_BARS,
    });
  }

  private setAllData(data: PerpsCandle[]) {
    this.candleSeries.setData(
      data.map((c) => ({
        time: this.toChartTime(c.t),
        open: this.chartNumber(c.o),
        high: this.chartNumber(c.h),
        low: this.chartNumber(c.l),
        close: this.chartNumber(c.c),
      }))
    );
    this.volumeSeries.setData(
      data.map((c) => ({
        time: this.toChartTime(c.t),
        value: this.volumeUsd(c),
        color: this.volumeColor(c),
      }))
    );
  }

  private applyBar(c: PerpsCandle) {
    const time = this.toChartTime(c.t);
    this.candleSeries.update({
      time,
      open: this.chartNumber(c.o),
      high: this.chartNumber(c.h),
      low: this.chartNumber(c.l),
      close: this.chartNumber(c.c),
    });
    this.volumeSeries.update({
      time,
      value: this.volumeUsd(c),
      color: this.volumeColor(c),
    });
  }

  /** Hyperliquid candle volume is base-asset size; chart it as USD notional. */
  private volumeUsd(c: PerpsCandle): number {
    const value = new BigNumber(c.v).times(c.c);
    return value.isFinite() && value.isGreaterThanOrEqualTo(0)
      ? value.toNumber()
      : 0;
  }

  private volumeColor(c: PerpsCandle): string {
    return (
      (new BigNumber(c.c).isGreaterThanOrEqualTo(c.o)
        ? UP_COLOR
        : DOWN_COLOR) + VOLUME_ALPHA
    );
  }

  /**
   * Protocol decimals stay as strings/BigNumber through every calculation.
   * lightweight-charts accepts only IEEE-754 numbers, so conversion happens
   * once at this rendering boundary; chart coordinates never feed trading.
   */
  private chartNumber(value: string): number {
    const decimal = new BigNumber(value);
    return decimal.isFinite() ? decimal.toNumber() : 0;
  }

  /**
   * lightweight-charts renders timestamps as UTC; shift by the local offset so
   * axis labels show wall-clock time, matching the rest of the app.
   */
  private toChartTime(ms: number): UTCTimestamp {
    const offsetMs = new Date(ms).getTimezoneOffset() * 60 * 1000;
    return ((ms - offsetMs) / 1000) as UTCTimestamp;
  }

  private readThemeColors() {
    const style = getComputedStyle(document.documentElement);
    return {
      text: style.getPropertyValue('--tip-color').trim() || '#afb6be',
      grid: style.getPropertyValue('--line-color').trim() || '#f4f4f4',
    };
  }

  private applyThemeColors() {
    if (!this.chart) {
      return;
    }
    const colors = this.readThemeColors();
    this.zone.runOutsideAngular(() =>
      this.chart.applyOptions({
        layout: {
          background: { type: ColorType.Solid, color: 'transparent' },
          textColor: colors.text,
        },
        grid: {
          vertLines: { visible: false },
          horzLines: { color: colors.grid },
        },
      })
    );
  }
}
