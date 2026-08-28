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

/** 两种主题共用的颜色；网格与文字颜色从 CSS 变量读取。 */
const UP_COLOR = '#06ccab';
const DOWN_COLOR = '#fa5555';
const VOLUME_ALPHA = '59'; // 8 位十六进制颜色的 35% 不透明度后缀
/** 在扩展宽度下，同屏最多这么多根 K 线仍然清晰可辨。 */
const INITIAL_VISIBLE_BARS = 30;
const RIGHT_OFFSET_BARS = 2;
/** 逻辑下标低于此值时，图表就去请求更早的柱子。 */
const HISTORY_LOAD_FROM = 5;
/** 超过这个数量时，一次 setData 加恢复视口，比 N 次 update 更便宜。 */
const MAX_INCREMENTAL_TAIL_BARS = 100;

/** 上次交给图表的内容，用于区分一次行情跳动和一个新数据集。 */
interface RenderedDataset {
  seriesKey: string;
  firstTime: number;
  lastTime: number;
  count: number;
}

/** 图表视角下的一根 K 线：柱子本身，以及它下面的成交量柱。 */
interface CandlePoint {
  bar: CandlestickData;
  /** 仅成交量换算失败时为 `null`；柱子照画。 */
  volume: HistogramData | null;
}

/**
 * 基于 lightweight-charts 库的 K 线 + 成交量图表。
 *
 * 传入 K 线，输出排好版的图表。实时跳动走 `series.update`，这样不会重置用户的缩放或滚动
 * 位置 —— 为什么这个区分是领域规则而不是渲染细节，见市场详情页的 ADR-0002。
 */
@Component({
  selector: 'perps-chart',
  templateUrl: 'perps-chart.component.html',
  styleUrls: ['perps-chart.component.scss'],
})
export class PerpsChartComponent implements AfterViewInit, OnChanges, OnDestroy {
  @Input() candles: PerpsCandle[] = [];
  @Input() loading = false;
  /** 价格坐标轴使用的小数位数。 */
  @Input() priceDecimals = 4;
  /**
   * 屏幕上这个数据集的身份，通常是市场加周期。
   *
   * 它一变，就说明这是「另一批 K 线」而不是「更新的 K 线」，因此整条序列会被替换。没有
   * 它的话，一个新周期若恰好首根柱子的起始时间与旧周期相同，就会被误当成一次实时跳动。
   */
  @Input() seriesKey = '';
  /**
   * 可见窗口已经到达我们手上最老的那根柱子。父组件会翻页取更早的快照并前插进来；
   * 发生这件事时，本组件不会把视口弹回最新的柱子。
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
  /** 已经请求过延展的首根柱子时间，避免对同一个边缘重复翻页。 */
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
    // 网格和坐标轴文字的颜色在两种应用主题下不同。
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
        // 空数据集是一个答案，而不是没有答案。把上一个周期的 K 线留在「加载失败」的
        // 提示旁边，展示的是一个并不存在的市场。
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
      // 这是对「前缀未变」的一个廉价近似，而不是证明：生产方只会替换最后一根柱子、
      // 前插历史，或者追加。在旧位置上检查旧的末根柱子，就能在不逐帧比较整个数组的
      // 前提下，抓到意外的裁剪。
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
      // 在视口变化之前赋值，好让左边缘回调能够翻页。
      this.rendered = next;
      if (isTailUpdate) {
        // 柱子滚动时，前一根也会被重放一遍：一根柱子最终的 OHLCV，可能与它还开着时
        // 流式推送的最后一个值不同。
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
    // 成交量占底部五分之一，K 线占其余部分。
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
   * 在下标 0 处插入更早的历史之后，让用户正在看的那些柱子仍停在屏幕上的同一位置。
   * 否则 `setData` 不会动逻辑范围，于是左边缘会突然显示新的最老柱子，而不是用户滚动到
   * 的那些。
   *
   * 平移量统计的是图表在原起点之前实际画出来的柱子数，绝不是传进来的 K 线数：画不出来
   * 的点会在送往序列的路上被丢掉，所以按原始数组差值平移，会让窗口移动得比数据更多，
   * 把用户的柱子甩到右边去。
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

  /** 批量替换一次大规模追加，且不改变已有的逻辑下标。 */
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
   * `fitContent` 会把完整的 K 线快照压进一屏。改为从一个可读的密度开始，
   * 同时不去动之后的实时跳动和用户的缩放/滚动。
   */
  private showRecentBars(dataLength: number) {
    const lastIndex = dataLength - 1;
    this.chart.timeScale().setVisibleLogicalRange({
      from: Math.max(0, lastIndex - INITIAL_VISIBLE_BARS + 1),
      to: lastIndex + RIGHT_OFFSET_BARS,
    });
  }

  /** 返回实际画出来的柱子数；无效的点会让它变少。 */
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
   * 把一根 K 线转成图表坐标；转不了时返回 `null`。
   *
   * 协议小数在所有计算中始终保持字符串形态；这里是它们变成 IEEE-754 数字的渲染边界，
   * 而且是唯一的一处。挺不过这次换算的点会被丢弃并记录下来，而不是画在零上：画在零上的
   * K 线，是在替市场做一个它从未做过的价格陈述。
   *
   * 成交量单独判定，可以自己失败。换算成功的价格是市场印出来的事实，它不会因为旁边的
   * 成交量字段不可用就不再是事实 —— 所以坏掉的成交量只让这根 K 线丢掉它的量柱，而不是
   * 丢掉它的价格柱。绝不能做的是退回到零：零高度的量柱等于说这个周期没有任何成交，那是
   * 在陈述市场，而不是在陈述我们的数据。真正没有成交的周期换算得完全正常，会被画成它
   * 本来的那根空柱子。
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
    // 美元名义价值，由这根 K 线自己的协议值精确相乘得到。
    // Hyperliquid 把 K 线成交量按基础资产数量报出；这里按美元来画。
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
   * 把一个协议小数转成有限的图表坐标；转不了时返回 `null`。
   *
   * 在这个边界上，BigNumber 自己的 `isFinite` 不是要紧的那个判断：`1e400` 是一个完全
   * 有限的小数，一变成 `number` 就是 `Infinity`，而 `1e-400` 会变成 `0`。所以量级要在
   * 换算后的值上检查 —— 那才是图表真正会画的那个值。`allowZero` 用来区分经过这里的两类
   * 数量：价格为零绝不是这个市场印出来的价格，而成交量为零是一个真实的数量。
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
   * 交易场所自己的 UTC 秒，不做平移。
   *
   * 按本地时区偏移微调时间戳，可以白得一条按本地时间读的坐标轴，但它同时会挪动每一根
   * 柱子的边界：日线就不会在 Hyperliquid 收盘的时刻收盘，而调整时钟的那一天还会多出
   * 一根宽度不对的柱子。时区偏移应当放在标签里 —— 见 `axisLabel` 与 `crosshairLabel`。
   */
  private toChartTime(ms: number): UTCTimestamp | null {
    // 取整秒：这个库按这个值给柱子建索引，取小数会把同一根柱子的两个视图
    // 变成两根不同的柱子。
    return Number.isFinite(ms) ? (Math.floor(ms / 1000) as UTCTimestamp) : null;
  }

  /**
   * 按读者自己的时区显示坐标轴标签。
   *
   * 这个库自带的格式化器会打印 UTC，而那恰恰是没人身处其中的那个时区。这里尊重刻度类型，
   * 好让坐标轴保持库原有的密度 —— 跨天处显示日期，其间显示时刻 —— 而不是把弹窗的宽度
   * 全花在每个刻度都印一个完整日期上。
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
   * 按市场最小变动价位显示坐标轴价格，去掉补位的零。
   *
   * `precision` 决定刻度尺预留多少位小数，它必须取市场完整的最小变动价位，免得一个整数
   * 价格把它压塌。可是每个标签都印满这个宽度，会把 $4 补成 "4.0000"，所以这些没有意义的
   * 零在这里去掉 —— 与标题栏遵循同一条规则。
   */
  private axisPrice(price: number): string {
    return stripTrailingZeros(new BigNumber(price).toFixed(this.priceDecimals));
  }

  /** 十字光标指向的是某一根柱子，所以它除了时刻还要带上日期。 */
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
