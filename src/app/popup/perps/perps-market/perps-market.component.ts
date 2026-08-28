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
import { PerpsMarketDatasetService } from '@app/core/services/perps/perps-market-dataset.service';
import { PerpsDataChannel } from '@app/core/services/perps/perps-data-channel.service';
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
 * K 线更新允许以多高的频率重绘图表。
 *
 * 每一个状态仍会在到达的当下被吸收 —— 这里限的只是那次触发图表重绘的检查。活跃的市场每秒
 * 会印出好几笔成交，在 OnPush 下，若不加限制，每一笔都会让整个页面被检查一遍、画布被重绘
 * 一遍，只为把一根柱子挪动一个像素。
 */
const CANDLE_REFRESH_MS = 1000;

@Component({
  templateUrl: 'perps-market.component.html',
  styleUrls: ['perps-market.component.scss'],
  // 本页面上的一切都来自订阅，而光是资金费倒计时，就会让整个弹窗每秒被重新检查一次。
  // 下面每个回调都会自己标记视图；漏标的那个，就是一个悄无声息停止更新的视图。
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PerpsMarketComponent implements OnInit, OnDestroy {
  coin: string;
  market: PerpsMarket;
  /**
   * 关于这个市场，我们知道多少。`missing` 是交易场所答复它不承载这个币种，那是一个已有
   * 定论的事实，不值得重试；`error` 是请求失败，那才值得。
   */
  marketStatus: 'loading' | 'ready' | 'missing' | 'error' = 'loading';
  connectionState: PerpsConnectionState = 'connecting';

  candles: PerpsCandle[] = [];
  chartLoading = true;
  chartLoadError = false;
  /** 实时流恢复了，但它断流期间收盘的 K 线缺口没能补上。 */
  chartRecoveryError = false;
  interval: PerpsCandleInterval = '15m';
  /** 日内粒度，始终显示在屏幕上。 */
  readonly quickIntervals: PerpsCandleInterval[] = ['1m', '5m', '15m', '1h'];
  /** 较长的那些放在菜单里，因为它们被选中的次数少得多。 */
  readonly longIntervals: PerpsCandleInterval[] = ['12h', '1d', '1w', '1M'];
  showIntervalMenu = false;

  /** 市场切换器是否在标题栏下方展开。 */
  showCoinMenu = false;
  /**
   * 切换器当前按什么筛选。
   *
   * 保存在这里而不是列表里，是为了能在菜单关闭时清掉它：上次打开时留下的关键词会把除一个
   * 之外的所有市场都藏起来，而用户会把那一个读成整个交易场所。
   */
  coinKeyword = '';

  /** 距离下一次整点资金费结算的时间，格式为 HH:MM:SS。 */
  fundingCountdown = '';
  /** 首帧到达之前，占位统计卡片的骨架行。 */
  readonly statsSkeletonRows = [0, 1, 2, 3];

  /**
   * 切换器的搜索框，一存在就抢焦点。
   *
   * 用 setter 而不是 `ngAfterViewInit`：这个输入框随菜单一起创建和销毁，所以并不存在
   * 「init 之后的某一刻」可以去聚焦它。打开切换器本身已经是「要找另一个市场」的决定，
   * 而这样做能让这件事继续在键盘上完成，而不是回到鼠标上。
   */
  @ViewChild('coinSearch') set coinSearch(field: ElementRef<HTMLInputElement>) {
    field?.nativeElement.focus();
  }

  private routeSub: Unsubscribable;
  private marketsSub: Unsubscribable;
  private connectionSub: Unsubscribable;
  private datasetSub: Unsubscribable;
  /** 数据集上一次说的是什么，好让「种类的变化」永远不被压住。 */
  private datasetAvailability: PerpsCandleAvailability = 'loading';
  private countdownTimer: any;

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private chrome: ChromeService,
    private candleDatasets: PerpsCandleDatasetService,
    private cdr: ChangeDetectorRef,
    private channel: PerpsDataChannel,
    private markets$: PerpsMarketDatasetService
  ) {}

  ngOnInit() {
    this.connectionSub = this.channel
      .watchConnectionState()
      .subscribe((state) => {
        // 恢复现在是数据集自己的事；页面读取连接状态，只是为了说明屏幕上的东西
        // 是否仍然实时。
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
   * 把页面指向某个市场。
   *
   * 由参数流驱动，而不是路由快照：只有参数变化时 Angular 会复用这个组件，而在 init 时读一次
   * 快照，会让上一个市场的价格、统计和 K 线留在新市场的 URL 底下。
   */
  private openMarket(coin: string) {
    // 在改动序列键之前先作废。否则在存储回答「该加载哪个周期」的这段时间里，
    // Angular 可能会把上一个币种的柱子渲染在新币种底下。
    this.invalidateCandleDataset();
    this.coin = coin;
    this.market = undefined;
    this.marketStatus = 'loading';
    // 无论这次导航是怎么发起的，到达另一个市场就说明切换器的活已经干完了 —— 这个菜单属于
    // 它被打开时所覆盖的那个市场，留着不关，它就会挡住自己刚给出的答案。
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
    // 坐标轴跟随市场自己的最小变动价位，而不是当前价格恰好带着的精度：
    // 否则一个正好落在整数上的价格，会把整条坐标轴一起拽下去。
    return chartPriceDecimals(this.market?.szDecimals);
  }

  /**
   * 屏幕上这批 K 线的身份标识。任何一半发生变化，都意味着下一个数组是另一个数据集，
   * 而不是同一个数据集的更新视图。
   */
  get chartSeriesKey(): string {
    return `${this.coin}:${this.interval}`;
  }

  /**
   * 要显示的名称。路由里带的是协议币种，在 HIP-3 市场上它带有 DEX 前缀；那个前缀属于名称
   * 旁边的徽标，而不属于名称本身。
   */
  get symbol(): string {
    return this.market?.symbol ?? this.coin;
  }

  /** 标题栏的价格是盘口中间价，还是退回到标记价格的兜底值。 */
  get usingMid(): boolean {
    return !!this.market?.midPxExact;
  }

  /**
   * 屏幕上的东西是否仍然实时。
   *
   * 从连接本身读取，而不是从「上一帧是多久以前到的」推断：冷清的市场照样会产生周期性的帧，
   * 而仅凭沉默永远不能给一条健康的套接字定罪。
   */
  get isStale(): boolean {
    return this.connectionState === 'stale';
  }

  /** 「还没东西可显示」，区别于「已经显示过，而它确实不存在」。 */
  get isLoading(): boolean {
    return this.marketStatus === 'loading';
  }

  /**
   * 做多和做空是否可以通往下单表单。
   *
   * 「数据源不再实时」和「市场没有双边盘口」是两种不同的故障，后果却相同：从这里出发，
   * 下单表单没有任何可以诚实报出的价格，所以这个入口直接关闭，而不是把问题甩给下游。
   */
  get canOrder(): boolean {
    return (
      this.marketStatus === 'ready' &&
      this.connectionState === 'live' &&
      this.usingMid
    );
  }

  /**
   * 交易入口为什么关闭，以翻译 key 的形式给出；开放时为 `''`。
   *
   * 它只为已经加载成功的市场发声。在那之前，屏幕上根本没有入口需要解释：页面要么在显示骨架，
   * 要么在说明为什么它压根没有市场，此时再来一句关于按钮的话，是在回答一个用户还提不出来的
   * 问题。
   */
  get orderBlockedKey(): string {
    if (this.canOrder || this.marketStatus !== 'ready') {
      return '';
    }
    // 不用横幅的措辞：横幅说的是数据发生了什么，这里说的是它让用户付出什么代价。
    // 同一句话在同一屏上重复两遍，读起来像是渲染出了故障，而不像两个事实。
    if (this.connectionState !== 'live') {
      return this.isStale ? 'perpsEntryStale' : 'perpsEntryConnecting';
    }
    return 'perpsNoTwoSidedBook';
  }

  /**
   * 来自这个市场自己数据源的实时中间价；没有时退回标记价格，并由标题栏如实标注。
   *
   * 刻意不使用图表的最后一根 K 线：K 线只有在有成交印出时才会动，所以冷清的市场会把标题栏
   * 冻住，而盘口仍在移动；而且切换周期还会改变标题栏所报的东西。标记价格和预言机价格在统计
   * 卡片里各有自己的一行，那里会点明它们的用途 —— 保证金与强平、资金费。
   */
  get displayPrice(): string | null {
    return this.market?.midPxExact ?? this.market?.markPxExact ?? null;
  }

  /** 以旁边显示的同一个价格为基准，对昨日收盘价报出。 */
  get displayChangePercent(): string | null {
    return this.market?.changePercentExact ?? null;
  }

  /**
   * 究竟能不能报出 24 小时涨跌。
   *
   * 标题价格退回到标记价格的市场没有涨跌可显示：`prevDayPx` 是中间价，拿它和标记价格比较
   * 等于凭空造一个数字。那属于市场统计不可用，读作「无数据」—— 绝不是 `0%`。
   */
  get hasChange(): boolean {
    return this.displayChangePercent !== null;
  }

  /** 资金费按小时报价；按 Hyperliquid 自家界面的方式显示。 */
  get fundingPercent(): string {
    return formatFundingPercent(this.market?.fundingExact);
  }

  /**
   * 周期在屏幕上怎么写。
   *
   * 绝不用协议值：`1d` 和 `1w` 显示为大写，而月线 `1M` 与分钟线 `1m` 只差一个大小写。
   * 比较、存储和请求一律仍用协议值。
   */
  intervalLabel(interval: PerpsCandleInterval): string {
    return PERPS_CANDLE_INTERVAL_LABELS[interval];
  }

  /**
   * 菜单按钮上写什么。
   *
   * 当选中项就在菜单里时，它显示当前周期；否则它表示「这里还有更多」—— 用户正看着 15 分钟
   * K 线，按钮却固定写着 `1D`，那是在对屏幕上的东西作出错误陈述。
   */
  get intervalMenuLabel(): string {
    return this.intervalInMenu ? this.intervalLabel(this.interval) : '';
  }

  /** 菜单里是否含有当前选中项，从而应当显示为已选中。 */
  get intervalInMenu(): boolean {
    return this.longIntervals.includes(this.interval);
  }

  /** 资金费在整点结算；倒计时到下一个整点。 */
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
    this.marketsSub = this.markets$.watchMarketDetail(this.coin).subscribe({
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

  //#region 币种切换器

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
    // 关键词随菜单一起走：用户下一次要找的市场是一次新的搜索，
    // 而不是上一次半途放弃的那次的延续。
    this.coinKeyword = '';
    this.cdr.markForCheck();
  }

  //#endregion

  //#region K 线

  private watchDataset() {
    this.unwatchDataset();
    if (!this.coin) {
      return;
    }
    this.datasetSub = this.candleDatasets
      .watchDataset(this.coin, this.interval)
      .pipe(
        // 在节流之前吸收，绝不放进节流里面：整帧丢弃会在柱子于窗口中途滚动时丢掉它的
        // 收盘价。这里限的只是重绘，页面持有的数据始终精确。
        tap((state: PerpsCandleDatasetState) => this.absorbDataset(state)),
        // `leading` 让订阅后的第一个状态立刻生效，这样刚打开的图表绝不会等上一秒才出现；
        // `trailing` 保证一串更新里的最后一帧仍会落地，而不是一直隐形到下一笔成交印出。
        throttleTime(CANDLE_REFRESH_MS, asyncScheduler, {
          leading: true,
          trailing: true,
        })
      )
      .subscribe(() => this.cdr.markForCheck());
  }

  /**
   * 接收一个数据集状态，但不为它重绘。
   *
   * 种类的变化会立即标记而不受节流限制：一张刚刚失败的图表，或者刚刚丢掉了断流期间收盘柱子
   * 的图表，说的是不能等到下一个节流窗口的话。
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
   * 再取一页比屏幕上已有内容更早的柱子。
   *
   * 用户滚动到左边缘时图表会发出它；再往前是否还有东西可取，是数据集自己的账本。
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
   * 用户上次选择的周期，它是一种观看习惯而非某个市场的属性 —— 所以只记住一次，
   * 而不是每个市场各记一份。
   */
  private loadChartInterval() {
    this.chrome
      .getStorage(STORAGE_NAME.perpsChartInterval)
      .subscribe((saved) => {
        // 存储返回的是旧版本写进去的任意值。本版本不再提供的周期绝不能到达数据集：数据集
        // 会按周期换算请求窗口，遇到换算不了的周期会抛出异常 —— 而且是同步抛出，在订阅
        // 建立之前 —— 于是图表会一直转圈，连个可以落地的错误路径都没有。
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
