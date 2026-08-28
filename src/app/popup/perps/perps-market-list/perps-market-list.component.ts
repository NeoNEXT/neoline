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

import { PerpsMarketDatasetService } from '@app/core/services/perps/perps-market-dataset.service';
import { PerpsDataChannel } from '@app/core/services/perps/perps-data-channel.service';
import {
  PerpsConnectionState,
  PerpsMarket,
  PerpsMarketSortKey,
  PERPS_MARKET_PAGE_SIZE,
  PERPS_NEO_COINS,
} from '@popup/_lib/perps';
import { formatCompactUsd, formatPrice, formatSignedPercent } from '../perps.util';

/**
 * 市场列表本身：排序、置顶、翻页以及各行的渲染。
 *
 * 它由首页 tab 和市场页共用。搜索和排序是市场页的职责 —— tab 只是链接过去 —— 所以关键词
 * 是以 input 传进来的，而不是保存在这里；这个列表则始终是决定行顺序的唯一地方。
 */
@Component({
  selector: 'perps-market-list',
  templateUrl: 'perps-market-list.component.html',
  styleUrls: ['perps-market-list.component.scss'],
})
export class PerpsMarketListComponent implements OnInit, OnChanges, OnDestroy {
  /** 筛选词。为空时显示全部。 */
  @Input() keyword = '';
  /**
   * 是否显示排序控件。只有市场页会显示；首页 tab 上的列表要读作「最大的那些市场」，
   * 它始终按成交量排名。
   */
  @Input() showSort = false;
  /**
   * 这个列表所代表的市场，会被标记为「已经打开的那个」。
   *
   * 只有币种切换器会设置它：那是一份「从当前位置可以去哪儿」的菜单，而一份不说明当前在
   * 哪儿的菜单，会逼用户回头再读一遍标题栏。
   */
  @Input() activeCoin = '';
  /**
   * 用户点选的那一行，以币种标识。
   *
   * 列表自己仍然会路由过去 —— 这在所有界面上都一样。这个事件说的是「用户做出了选择」，
   * 而这正是把列表渲染在某个可关闭容器里的宿主所需要的：点选当前已经打开的那个市场并
   * 不会路由到任何地方，于是一个等待路由的宿主，会在那次最明确表示「关掉」的点击上
   * 反而保持打开。
   */
  @Output() marketSelected = new EventEmitter<string>();
  /**
   * 这个列表正在展示的市场。之所以发出去，是让另有用途的宿主 —— 首页 tab 要按各市场的
   * `szDecimals` 格式化仓位数量 —— 可以从这个订阅里读到它们，而不必另开一个：
   * `watchMarkets` 每来一个订阅者就重新取一次，而 `/info` 是按 IP 共享的权重预算计费的。
   */
  @Output() marketsLoaded = new EventEmitter<PerpsMarket[]>();

  loading = true;
  marketLoadError = false;

  markets: PerpsMarket[] = [];
  /** 置顶的市场：收藏与 Neo 生态。 */
  pinnedMarkets: PerpsMarket[] = [];
  /** 置顶区下方的各行，按排序快照的顺序排列。 */
  visibleMarkets: PerpsMarket[] = [];

  /**
   * 列表如何排名。每次构建列表都取成交量：排序是用户对眼前这一页提出的问题，不是一项
   * 设置；从上次访问延续下来的排序，对用户而言是一个看不出缘由的顺序。
   */
  sortKey: PerpsMarketSortKey = 'volume';
  readonly sortKeys: { key: PerpsMarketSortKey; label: string }[] = [
    { key: 'volume', label: 'perpsSortVolume' },
    { key: 'change', label: 'perpsSortChange' },
  ];
  sortMenuOpen = false;

  /** 快照中已经实际渲染出来的行数。 */
  visibleCount = PERPS_MARKET_PAGE_SIZE;
  readonly skeletonRows = new Array(6);

  /** 数据源健康度，它会把列表显示的所有报价调暗。 */
  connectionState: PerpsConnectionState = 'connecting';

  /** 被冻结的行顺序；见 `resnapshot`。 */
  private orderedKeys: string[] = [];
  private pinnedKeys: string[] = [];
  private renderTimer: any;

  private marketsSub: Unsubscribable;
  private connectionSub: Unsubscribable;

  //#region 模板辅助方法
  formatCompactUsd = formatCompactUsd;
  formatPrice = formatPrice;
  formatSignedPercent = formatSignedPercent;
  //#endregion

  constructor(
    private router: Router,
    private markets$: PerpsMarketDatasetService,
    private channel: PerpsDataChannel
  ) {}

  ngOnInit() {
    this.watchMarkets();
    this.connectionSub = this.channel
      .watchConnectionState()
      .subscribe((state) => (this.connectionState = state));
  }

  ngOnChanges(changes: SimpleChanges) {
    // 打字是用户动作，所以要重新取快照 —— 与价格更新不同，行顺序在这里是允许变的。
    if (changes.keyword && !changes.keyword.firstChange) {
      this.resnapshot();
    }
  }

  /** 点击别处会关掉排序菜单，且不做选择。 */
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

  /** 把成串到达的帧合并成一次重绘，最快也要间隔约 250ms。 */
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
    this.marketsSub = this.markets$.watchMarkets().subscribe((state) => {
      if (state.availability === 'loading') {
        return;
      }
      // 什么都没到过，所以没有列表可显示 —— 之后的重试会向这同一个订阅者发布一份。
      if (state.availability === 'unavailable' && !state.markets.length) {
        this.loading = false;
        this.marketLoadError = true;
        return;
      }
      const markets = state.markets;
      const known = new Set(this.orderedKeys.concat(this.pinnedKeys));
      const changed =
        known.size !== markets.length ||
        markets.some((market) => !known.has(market.key));
      this.markets = markets;
      // 新上架或已下架的市场必须进入顺序；价格波动则不能。其余情况做合并，
      // 让多个 DEX 的帧只触发一次重绘。
      if (changed) {
        this.resnapshot();
      } else {
        this.scheduleRender();
      }
      this.loading = false;
      this.marketLoadError = false;
      this.marketsLoaded.emit(markets);
    });
  }

  /** 排序控件为当前所选项显示的文案。 */
  get sortKeyLabel(): string {
    return this.sortKeys.find((item) => item.key === this.sortKey)?.label || '';
  }

  setSortKey(key: PerpsMarketSortKey) {
    this.sortKey = key;
    this.sortMenuOpen = false;
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

  /** 屏幕上的数值是最后已知值，而不是实时值。 */
  get feedStale(): boolean {
    return this.connectionState === 'stale';
  }

  /**
   * 重新计算排序快照。
   *
   * 只由用户的动作触发 —— 进入页面、搜索、切换排序、下拉刷新 —— 绝不由价格更新触发。
   * 在这些调用之间行顺序是冻结的，因此一个市场不可能爬到用户正伸手要点的那一行前面，
   * 点击也就落在瞄准的地方。
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
   * 按冻结的键顺序把行实际渲染出来。
   *
   * 价格变化是通过替换市场对象来体现的，所以这些行会被重新查一遍 —— 但始终按快照顺序，
   * 这正是让实时更新不至于变成一次重新洗牌的关键。
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

  /** 每种排序键都是从高到低排名；没有可反转的方向。 */
  private comparator(): (a: PerpsMarket, b: PerpsMarket) => number {
    if (this.sortKey === 'change') {
      return (a, b) => {
        // 一个算不出涨跌的市场，在按涨跌排名里没有位置：
        // 它沉到最底下，而不是冒充 0%。
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

  /** Neo 生态排在已排序列表的上方。 */
  private isPinned(market: PerpsMarket): boolean {
    return PERPS_NEO_COINS.includes(market.symbol);
  }

  /**
   * 市场行显示的价格：盘口中间价；没有双边盘口时用标记价格。这一行会标明它是哪一种 ——
   * 标记价格不是任何人能成交的价格，让它冒充成交价，正是用户把一个不可交易的市场读成
   * 可交易市场的原因。
   */
  listPrice(market: PerpsMarket): string | null {
    return market.midPxExact ?? market.markPxExact ?? null;
  }

  /** 盘口没有中间价、因而这一行报的是标记价格时为 true。 */
  usingMarkPrice(market: PerpsMarket): boolean {
    return !market.midPxExact && !!market.markPxExact;
  }

  /**
   * 行按市场主键标识，这样价格更新只是就地改写数字，而不是把每一行拆掉重建 ——
   * 后者会重新加载每个币种图标，并丢掉用户的滚动位置。
   */
  trackByKey(_index: number, market: PerpsMarket): string {
    return market.key;
  }

  toMarket(coin: string) {
    this.marketSelected.emit(coin);
    this.router.navigateByUrl(`/popup/perps/market/${coin}`);
  }
}
