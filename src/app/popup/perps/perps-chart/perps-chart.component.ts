import {
  AfterViewInit,
  Component,
  ElementRef,
  EventEmitter,
  Input,
  NgZone,
  OnChanges,
  OnDestroy,
  Output,
  SimpleChanges,
  ViewChild,
} from '@angular/core';
import {
  CandlestickData,
  ColorType,
  createChart,
  HistogramData,
  IChartApi,
  ISeriesApi,
  TickMarkType,
  Time,
  UTCTimestamp,
} from 'lightweight-charts';
import BigNumber from 'bignumber.js';
import { PerpsCandle } from '@popup/_lib/perps';
import { pad2, stripTrailingZeros } from '../perps.util';

/** Colors shared by both themes; grid/text colors are read from CSS variables. */
const UP_COLOR = '#06ccab';
const DOWN_COLOR = '#fa5555';
const VOLUME_ALPHA = '59'; // 35% opacity suffix for 8-digit hex colors
/** Candles stay legible at extension width up to about this many on screen. */
const INITIAL_VISIBLE_BARS = 30;
const RIGHT_OFFSET_BARS = 2;
/** Logical index below which the chart asks for older bars. */
const HISTORY_LOAD_FROM = 5;
/** Above this, one setData plus range restore is cheaper than N updates. */
const MAX_INCREMENTAL_TAIL_BARS = 100;

/** What was last handed to the chart, for telling a tick from a new dataset. */
interface RenderedDataset {
  seriesKey: string;
  firstTime: number;
  lastTime: number;
  count: number;
}

/** One candle as the chart sees it: the bar and the volume column under it. */
interface CandlePoint {
  bar: CandlestickData;
  /** `null` when only the volume failed to convert; the bar still draws. */
  volume: HistogramData | null;
}

/**
 * Candlestick + volume chart backed by the lightweight-charts library.
 *
 * Candles in, sized chart out. Live ticks go through `series.update` so they
 * don't reset the user's zoom or scroll position — see the market detail
 * page's ADR-0002 for why that distinction is a domain rule and not a
 * rendering detail.
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
  /**
   * Identity of the dataset on screen, normally market plus interval.
   *
   * A change here means these are different candles, not newer ones, so the
   * whole series is replaced. Without it, a new interval whose first bar
   * happened to start at the same time as the old one would be mistaken for a
   * live tick.
   */
  @Input() seriesKey = '';
  /**
   * The visible window has reached the oldest bar we have. The parent pages
   * an earlier snapshot and prepends it; this component will not snap the
   * viewport back to the latest bars when that happens.
   */
  @Output() needEarlier = new EventEmitter<void>();

  @ViewChild('chartContainer', { static: true })
  private container: ElementRef<HTMLDivElement>;

  private chart: IChartApi;
  private candleSeries: ISeriesApi<'Candlestick'>;
  private volumeSeries: ISeriesApi<'Histogram'>;
  private themeObserver: MutationObserver;
  private viewReady = false;
  private rendered: RenderedDataset | null = null;
  /** First-bar time we already asked to extend, so the same edge is not re-paged. */
  private historyRequestedAt: number | null = null;

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
    if (changes.candles || changes.seriesKey) {
      this.render();
    }
    if (changes.priceDecimals && this.candleSeries) {
      this.zone.runOutsideAngular(() =>
        this.candleSeries.applyOptions({ priceFormat: this.priceFormat() })
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
    if (data.length === 0 && !this.chart) {
      return;
    }
    this.zone.runOutsideAngular(() => {
      if (!this.chart) {
        this.createChart();
      }
      if (data.length === 0) {
        // An empty dataset is an answer, not the absence of one. Leaving the
        // previous interval's candles up beside a "failed to load" message
        // shows a market that is not there.
        this.candleSeries.setData([]);
        this.volumeSeries.setData([]);
        this.rendered = null;
        this.historyRequestedAt = null;
        return;
      }
      const next: RenderedDataset = {
        seriesKey: this.seriesKey,
        firstTime: data[0].t,
        lastTime: data[data.length - 1].t,
        count: data.length,
      };
      const prev = this.rendered;
      // This is a cheap proxy for an unchanged prefix, not its proof: the
      // producer only replaces the last bar, prepends history, or appends.
      // Checking the old tail at its old index catches accidental trimming
      // without comparing the whole array on every frame.
      const appended = prev ? data.slice(prev.count) : [];
      let appendedAfter = prev?.lastTime ?? 0;
      const appendedInOrder = appended.every((candle) => {
        const inOrder = candle.t > appendedAfter;
        appendedAfter = candle.t;
        return inOrder;
      });
      const isTailUpdate =
        prev !== null &&
        prev.seriesKey === next.seriesKey &&
        prev.firstTime === next.firstTime &&
        next.count >= prev.count &&
        data[prev.count - 1]?.t === prev.lastTime &&
        appendedInOrder;
      const isHistoryPrepend =
        prev !== null &&
        prev.seriesKey === next.seriesKey &&
        next.firstTime < prev.firstTime &&
        next.count > prev.count;
      // Assign before viewport changes so a left-edge callback can page.
      this.rendered = next;
      if (isTailUpdate) {
        // On a roll-over the previous bar is replayed as well: a bar's final
        // OHLCV can differ from the last value that streamed while it was
        // still open.
        const appendedCount = next.count - prev.count;
        if (appendedCount <= MAX_INCREMENTAL_TAIL_BARS) {
          data
            .slice(Math.max(0, prev.count - 1))
            .forEach((candle) => this.applyBar(candle));
        } else {
          this.replaceTailPreservingViewport(data);
        }
      } else if (isHistoryPrepend) {
        this.prependHistory(data, prev.firstTime);
      } else {
        this.historyRequestedAt = null;
        this.setAllData(data);
        this.showRecentBars(data.length);
      }
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
        attributionLogo: false,
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
        fixLeftEdge: true,
        tickMarkFormatter: (time: Time, type: TickMarkType) =>
          this.axisLabel(time, type),
      },
      localization: {
        timeFormatter: (time: Time) => this.crosshairLabel(time),
        priceFormatter: (price: number) => this.axisPrice(price),
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
      priceFormat: this.priceFormat(),
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
    this.chart
      .timeScale()
      .subscribeVisibleLogicalRangeChange((range) => this.onVisibleRange(range));
  }

  /**
   * Keep the bars the user is looking at in the same place on screen after
   * older history is inserted at index 0. `setData` would otherwise leave the
   * logical range alone, so the left edge would suddenly show the new oldest
   * bars instead of the ones they had scrolled to.
   *
   * The shift counts bars the chart actually drew ahead of the previous start,
   * never candles handed in: an unrenderable point is dropped on its way to
   * the series, so shifting by the raw array difference would move the window
   * further than the data moved and slide the user's bars off to the right.
   */
  private prependHistory(data: PerpsCandle[], prevFirstTime: number) {
    const range = this.chart.timeScale().getVisibleLogicalRange();
    const bars = this.setAllData(data);
    if (!range) {
      return;
    }
    const boundary = this.toChartTime(prevFirstTime);
    const added =
      boundary === null
        ? 0
        : bars.filter((bar) => (bar.time as number) < boundary).length;
    if (added <= 0) {
      return;
    }
    this.chart.timeScale().setVisibleLogicalRange({
      from: range.from + added,
      to: range.to + added,
    });
  }

  /** Replace a large append in bulk without changing existing logical indices. */
  private replaceTailPreservingViewport(data: PerpsCandle[]) {
    const range = this.chart.timeScale().getVisibleLogicalRange();
    this.setAllData(data);
    if (range) {
      this.chart.timeScale().setVisibleLogicalRange(range);
    }
  }

  private onVisibleRange(range: { from: number; to: number } | null) {
    if (!range || this.loading || !this.rendered) {
      return;
    }
    if (range.from > HISTORY_LOAD_FROM) {
      this.historyRequestedAt = null;
      return;
    }
    if (this.historyRequestedAt === this.rendered.firstTime) {
      return;
    }
    this.historyRequestedAt = this.rendered.firstTime;
    this.zone.run(() => this.needEarlier.emit());
  }

  private priceFormat() {
    return {
      type: 'price' as const,
      precision: this.priceDecimals,
      minMove: Math.pow(10, -this.priceDecimals),
    };
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

  /** Returns the bars actually drawn, which invalid points make fewer. */
  private setAllData(data: PerpsCandle[]): CandlestickData[] {
    const bars: CandlestickData[] = [];
    const volumes: HistogramData[] = [];
    data.forEach((candle) => {
      const point = this.toPoint(candle);
      if (!point) {
        return;
      }
      bars.push(point.bar);
      if (point.volume) {
        volumes.push(point.volume);
      }
    });
    this.candleSeries.setData(bars);
    this.volumeSeries.setData(volumes);
    return bars;
  }

  private applyBar(candle: PerpsCandle) {
    const point = this.toPoint(candle);
    if (!point) {
      return;
    }
    this.candleSeries.update(point.bar);
    if (point.volume) {
      this.volumeSeries.update(point.volume);
    }
  }

  /**
   * One candle as chart coordinates, or `null` when it cannot become them.
   *
   * Protocol decimals stay as strings through every calculation; this is the
   * rendering boundary where they become IEEE-754 numbers, and the only one.
   * A point that cannot survive the conversion is dropped and recorded rather
   * than drawn at zero: a candle printed at zero is a price claim the market
   * never made.
   *
   * Volume is judged separately and can fail on its own. A price that
   * converted is a fact the market printed, and it does not stop being one
   * because the volume field beside it is unusable — so a broken volume costs
   * this candle its column, not its bar. What it must never do is fall back to
   * zero: a zero-height column says this interval traded nothing, which is a
   * claim about the market rather than about our data. An interval that
   * genuinely traded nothing converts perfectly well and is drawn as the empty
   * column it is.
   */
  private toPoint(candle: PerpsCandle): CandlePoint | null {
    const time = this.toChartTime(candle?.t);
    const prices = [candle?.o, candle?.h, candle?.l, candle?.c].map((value) =>
      this.toCoordinate(value, false)
    );
    if (time === null || prices.some((price) => price === null)) {
      console.warn('[perps] skipped an unrenderable candle', candle);
      return null;
    }
    const [open, high, low, close] = prices;
    // USD notional, from this candle's own protocol values multiplied exactly.
    // Hyperliquid quotes candle volume as base-asset size; chart it as USD.
    const notional = this.toCoordinate(
      new BigNumber(candle?.v).times(candle?.c),
      true
    );
    if (notional === null) {
      console.warn('[perps] skipped an unrenderable candle volume', candle);
    }
    return {
      bar: { time, open, high, low, close },
      volume:
        notional === null
          ? null
          : { time, value: notional, color: this.volumeColor(candle) },
    };
  }

  /**
   * A protocol decimal as a finite chart coordinate, or `null`.
   *
   * BigNumber's own `isFinite` is not the test that matters at this boundary:
   * `1e400` is a perfectly finite decimal that becomes `Infinity` the instant
   * it is a `number`, and `1e-400` becomes `0`. Magnitude is therefore checked
   * on the converted value, which is the one the chart will actually plot.
   * `allowZero` separates the two kinds of quantity crossing here — a price of
   * zero is never a price this market printed, while a volume of zero is a
   * real quantity.
   */
  private toCoordinate(
    value: BigNumber.Value,
    allowZero: boolean
  ): number | null {
    const decimal = new BigNumber(value);
    if (!decimal.isFinite() || decimal.isLessThan(0)) {
      return null;
    }
    const coordinate = decimal.toNumber();
    if (!Number.isFinite(coordinate) || (!allowZero && coordinate <= 0)) {
      return null;
    }
    return coordinate;
  }

  private volumeColor(c: PerpsCandle): string {
    return (
      (new BigNumber(c.c).isGreaterThanOrEqualTo(c.o)
        ? UP_COLOR
        : DOWN_COLOR) + VOLUME_ALPHA
    );
  }

  /**
   * The exchange's own UTC seconds, unshifted.
   *
   * Nudging timestamps by the local offset would make the axis read as local
   * time for free, but it also moves every bar boundary: a daily candle would
   * stop closing when Hyperliquid closes it, and the day a clock changes would
   * grow a bar of the wrong width. The offset belongs in the labels instead —
   * see `axisLabel` and `crosshairLabel`.
   */
  private toChartTime(ms: number): UTCTimestamp | null {
    // Whole seconds: the library keys bars by this value, and a fractional one
    // would make two views of the same bar two different bars.
    return Number.isFinite(ms) ? (Math.floor(ms / 1000) as UTCTimestamp) : null;
  }

  /**
   * Axis labels in the reader's own timezone.
   *
   * The library's own formatter would print UTC, which is the one timezone
   * nobody is in. The tick type is honoured so the axis keeps the library's
   * density — dates where a day turns over, times in between — instead of
   * spending the popup's width on a full date at every tick.
   */
  private axisLabel(time: Time, type: TickMarkType): string {
    const date = new Date((time as number) * 1000);
    switch (type) {
      case TickMarkType.Year:
        return `${date.getFullYear()}`;
      case TickMarkType.Month:
      case TickMarkType.DayOfMonth:
        return `${date.getMonth() + 1}/${date.getDate()}`;
      default:
        return `${pad2(date.getHours())}:${pad2(date.getMinutes())}`;
    }
  }

  /**
   * Axis prices at the market's tick, without the padding.
   *
   * `precision` decides how many decimals the scale reserves, and it has to be
   * the market's full tick so that a round price cannot collapse it. Printing
   * that width on every label pads $4 out to "4.0000", so the meaningless
   * zeros come off here — the same rule the header follows.
   */
  private axisPrice(price: number): string {
    return stripTrailingZeros(new BigNumber(price).toFixed(this.priceDecimals));
  }

  /** The crosshair names one bar, so it carries the date as well as the time. */
  private crosshairLabel(time: Time): string {
    const date = new Date((time as number) * 1000);
    return `${date.getMonth() + 1}/${date.getDate()} ${pad2(
      date.getHours()
    )}:${pad2(date.getMinutes())}`;
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
