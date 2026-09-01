import { Injectable } from '@angular/core';
import BigNumber from 'bignumber.js';
import { Observable, concat, forkJoin, merge, of } from 'rxjs';
import { catchError, filter, map, switchMap, tap } from 'rxjs/operators';

import {
  PerpsAssetCtx,
  PerpsMarket,
  PerpsUniverseItem,
} from '@popup/_lib/perps';
import { HyperliquidService } from './hyperliquid.service';
import { PerpsDataChannel } from './perps-data-channel.service';
import { PerpsDataset } from './perps-dataset';
import { retryTransientFetch } from './perps-fetch-failure';
import {
  PerpsMarketDatasetState,
  buildMarket,
  marketContextFields,
  mergeDexAssetContexts,
} from './perps-market-dataset';

/** 一个 DEX 的静态元数据，与它的实时上下文按同一顺序配对。 */
type MetaAndAssetCtxs = [{ universe: PerpsUniverseItem[] }, PerpsAssetCtx[]];

/**
 * 本模块需要交易场所提供的全部东西，不多不少。
 *
 * 注册表之所以单独问一次，是因为它唯一的用处是把一个 HIP-3 DEX 放进 asset-id 空间：
 * 标准永续按定义就是索引 0，直接跳过这次请求。
 */
interface PerpsMarketSource {
  readonly enabledDexes: string[];
  getDexRegistry(): Observable<any[]>;
  getMetaAndAssetCtxs(dex?: string): Observable<MetaAndAssetCtxs>;
}

/** 一个 DEX 的实时上下文，保持频道推送过来的样子。 */
interface PerpsMarketUpdate {
  dex: string;
  ctxs: PerpsAssetCtx[];
}

/**
 * 列表能陈旧到什么程度，超过它新来的观察者就要为一次新快照买单。
 *
 * 帧会免费把价格保持在最新，所以这跟数值新不新鲜无关 —— 它关心的是**集合**：
 * 上一次快照之后新上市或已下市的市场，在下一次快照之前是看不见的。
 */
const SNAPSHOT_TTL_MS = 15000;

/** 屏幕上已经有市场时，一次失败的快照转入退避。 */
const RETRY_BASE_MS = 1000;
/** 429 说的是一份按 IP 计的配额，它会在接下来的一分钟里回满。 */
const RATE_LIMITED_BASE_MS = 10000;
const RETRY_CAP_MS = 60000;

/** 列表就是一个数据集，所以它的条目只有一个名字。 */
const MARKET_LIST = { id: 'markets' };

const LOADING: PerpsMarketDatasetState = {
  availability: 'loading',
  markets: [],
  updatedAt: null,
};

/**
 * **行情数据集** —— 市场集合及其当前价格。
 *
 * 快照与帧的仲裁归共享的**数据集**核心，见
 * [ADR-0008](../../../../../docs/adr/0008-shared-dataset-snapshot-frame-arbiter.md)。
 * 只有行情特有的东西留在这里：一次快照如何跨 DEX 拼装、失败后走什么退避、
 * 一个集合可以多久不被核对，以及市场详情的数据源。
 *
 * 市场详情完全是另一种形状：一个页面读一个市场，然后跟随那个市场自己的频道，
 * 没有共享状态也没有后台刷新，所以它根本不走数据集。
 */
@Injectable({ providedIn: 'root' })
export class PerpsMarketDatasetService {
  private readonly source: PerpsMarketSource;
  private readonly dataset: PerpsDataset<
    { id: string },
    PerpsMarketDatasetState,
    PerpsMarketUpdate
  >;

  /**
   * 本会话最后一次持有的列表。
   *
   * 核心会在没人观察时忘掉一个条目，但市场列表是被来来去去的页面读取的：
   * 留住最后一份，下一个页面就能立刻出图，而它的年龄仍然能回答「是否欠一次新集合」。
   */
  private lastState: PerpsMarketDatasetState = LOADING;
  private observers = 0;
  private retryTimer: any;
  private retryAttempts = 0;

  constructor(
    hyperliquid: HyperliquidService,
    private readonly channel: PerpsDataChannel
  ) {
    this.source = hyperliquid;
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    const self = this;
    this.dataset = new PerpsDataset(channel, {
      // 新条目从本会话已经持有的那份列表起步，这正是下一个页面能立刻出图的原因 ——
      // 核心在没人观察时会忘掉条目，但列表比任何单个页面活得久。
      get initial() {
        return self.lastState;
      },
      keyOf: (key) => key.id,
      frames: () => this.openUpdates(),
      load: (_key, current) => this.loadSnapshot(current),
      foldFrame: (state, update) => this.foldUpdate(state, update),
      onConnectionState: (state, current) =>
        state === 'stale' && current.markets.length
          ? { ...current, availability: 'stale' }
          : current,
    });
  }

  /**
   * 共享的实时市场列表。
   *
   * 失败以 `unavailable` 的形式发布出去，而不是让流报错：之后一次成功的重试必须能送达
   * 同一批订阅者，而一个已经出错的 observable 就到此为止了。
   */
  watchMarkets(): Observable<PerpsMarketDatasetState> {
    return new Observable<PerpsMarketDatasetState>((observer) => {
      this.observers += 1;
      const subscription = this.dataset
        .watch(MARKET_LIST)
        .pipe(tap((state) => this.retain(state)))
        .subscribe(observer);
      this.ensureSnapshot();
      return () => {
        subscription.unsubscribe();
        this.observers = Math.max(0, this.observers - 1);
        if (this.observers === 0) {
          clearTimeout(this.retryTimer);
          this.retryTimer = undefined;
        }
      };
    });
  }

  /** 当前列表；只有在手里那份太旧时才先取一次快照。 */
  getMarkets(): Observable<PerpsMarket[]> {
    const current = this.dataset.peek(MARKET_LIST);
    if (this.isFresh(current)) {
      return of(current.markets);
    }
    return this.dataset.refresh(MARKET_LIST).pipe(
      tap((state) => this.retain(state)),
      map((state) => state.markets)
    );
  }

  /**
   * 单个市场的实时上下文，来自那个市场自己的数据源。
   *
   * 详情页是用户按下做多或做空之前盯着看的东西，所以它跟随该市场的 `activeAssetCtx`
   * 频道，而不是列表那套按 DEX 的周期性帧。一帧同时带着价格和 24 小时统计，
   * 因此页面绝不会把一条消息里的价格和另一条里的 `prevDayPx` 配到一起。
   *
   * 对本版本不承载的币种发出 `null`：已下市的资产、本版本没有启用的 DEX，
   * 或者一个错的路由参数。这与「请求失败」是不同的答案，后者会报错 ——
   * 两种情况下页面都没东西可显示，但只有其中一种值得给出重试入口。
   */
  watchMarketDetail(coin: string): Observable<PerpsMarket | null> {
    const dex = coin?.includes(':') ? coin.slice(0, coin.indexOf(':')) : '';
    if (!coin || !this.source.enabledDexes.includes(dex)) {
      return of(null);
    }
    return this.marketSnapshot(coin, dex).pipe(
      // 没有这次快照，页面就什么都没有；而它只是一次普通读取，所以在告诉用户「市场加载
      // 不出来」之前，值得为路上掉线的连接再问一次。这是一份短促、均匀的尝试预算 ——
      // 一个正在盯着看的用户等得起。它不同于列表那套后台退避：那套是为了让已经显示出来的
      // 价格活着，没有人对着一块空白屏幕干等。
      retryTransientFetch(),
      switchMap((market) =>
        market
          ? concat(
              of(market),
              // 快照在飞期间到达的帧会丢掉，而这不花任何代价：每一帧都是一份完整的
              // 上下文，所以下一帧会把错过的那些重新说一遍。
              this.channel.subscribe({ type: 'activeAssetCtx', coin }).pipe(
                filter((frame) => !!frame?.ctx),
                map((frame) => ({
                  ...market,
                  ...marketContextFields(frame.ctx),
                }))
              )
            )
          : of(null)
      )
    );
  }

  /**
   * 单个市场的静态元数据，加上一帧上下文。
   *
   * 只问这个市场自己所在的 DEX —— 正是这一点让详情页避开了列表所需的全 DEX 快照。
   * DEX 从币种本身读出：HIP-3 币种把它的 DEX 作为前缀带着，而一个不带前缀的币种
   * 按定义就是标准永续。
   */
  private marketSnapshot(
    coin: string,
    dex: string
  ): Observable<PerpsMarket | null> {
    const registry = dex ? this.source.getDexRegistry() : of([]);
    return registry.pipe(
      switchMap((perpDexs) => {
        const dexIndex = dex
          ? (Array.isArray(perpDexs) ? perpDexs : []).findIndex(
              (item) => item?.name === dex
            )
          : 0;
        if (dexIndex < 0) {
          return of(null);
        }
        return this.source.getMetaAndAssetCtxs(dex || undefined).pipe(
          map(([meta, ctxs]) => {
            const universe = meta?.universe || [];
            const index = universe.findIndex(
              (item) =>
                (dex && !item.name.includes(':')
                  ? `${dex}:${item.name}`
                  : item.name) === coin
            );
            const item = universe[index];
            const ctx = ctxs?.[index];
            if (!item || item.isDelisted || !ctx) {
              return null;
            }
            return buildMarket(item, ctx, dex, dexIndex, index);
          })
        );
      })
    );
  }

  //#region 列表

  /**
   * 产品真正展示的每个 DEX 各订一条市场上下文，外加本会话已经画出来的那份列表。
   *
   * 另一个选择 `allDexsAssetCtxs` 会把所有已部署的 HIP-3 DEX 塞进一帧广播出来 ——
   * 测试网上大约 170KB，其中四分之三是 NeoLine 根本不列出的 DEX —— 而它到达的频率
   * 并不比按 DEX 的帧更高。
   */
  private openUpdates(): Observable<PerpsMarketUpdate> {
    return merge(
      ...this.source.enabledDexes.map((dex) =>
        this.channel
          .subscribe({ type: 'assetCtxs', dex })
          .pipe(map((update) => ({ dex, ctxs: update?.ctxs })))
      )
    );
  }

  private foldUpdate(
    state: PerpsMarketDatasetState,
    update: PerpsMarketUpdate
  ): PerpsMarketDatasetState {
    if (!Array.isArray(update.ctxs) || update.ctxs.length === 0) {
      return state;
    }
    // 快照定义哪些市场存在，一个上下文数组造不出新市场来。什么都还没加载时也就没有
    // 东西可更新 —— 而取数还开着时到达的帧，会改为回放到它的结果上。
    if (!state.markets.length) {
      return state;
    }
    return {
      availability: state.availability === 'incomplete' ? 'incomplete' : 'live',
      markets: mergeDexAssetContexts(state.markets, update.dex, update.ctxs),
      updatedAt: Date.now(),
    };
  }

  private retain(state: PerpsMarketDatasetState) {
    this.lastState = state;
  }

  private isFresh(state: PerpsMarketDatasetState): boolean {
    return (
      state.updatedAt !== null && Date.now() - state.updatedAt < SNAPSHOT_TTL_MS
    );
  }

  private ensureSnapshot() {
    if (this.isFresh(this.dataset.peek(MARKET_LIST))) {
      return;
    }
    this.dataset
      .refresh(MARKET_LIST)
      .subscribe({ error: () => undefined });
  }

  /**
   * 所有可交易市场与它们的实时上下文合并，按 24 小时成交量排序。
   *
   * 已下市的资产被丢掉 —— 但它们仍然在 `universe` 里占着一个索引，所以 asset id
   * 取自原始位置，绝不能重新计算。
   */
  private loadSnapshot(
    current: PerpsMarketDatasetState
  ): Observable<PerpsMarketDatasetState> {
    return this.source.getDexRegistry().pipe(
      switchMap((perpDexs) => this.snapshotRequests(perpDexs)),
      map((responses) => {
        const { markets, missing } = this.foldSnapshot(responses);
        this.retryAttempts = 0;
        return {
          availability: missing
            ? ('incomplete' as const)
            : ('live' as const),
          markets,
          updatedAt: Date.now(),
        };
      }),
      catchError((error) => {
        this.scheduleRetry(error);
        // 已经在屏幕上的市场还不构成用户的问题：原样继续显示，
        // 并按逐渐拉长的间隔再问一次。
        return of(
          current.markets.length
            ? current
            : {
                availability: 'unavailable' as const,
                markets: [],
                updatedAt: current.updatedAt,
              }
        );
      })
    );
  }

  private scheduleRetry(error: any) {
    if (this.observers === 0) {
      return;
    }
    clearTimeout(this.retryTimer);
    const base = error?.status === 429 ? RATE_LIMITED_BASE_MS : RETRY_BASE_MS;
    const delay = Math.min(
      base * Math.pow(2, this.retryAttempts),
      RETRY_CAP_MS
    );
    this.retryAttempts += 1;
    this.retryTimer = setTimeout(() => this.ensureSnapshot(), delay);
  }

  private snapshotRequests(
    perpDexs: any[]
  ): Observable<Array<{ dex: string; dexIndex: number; response: MetaAndAssetCtxs } | null>> {
    const requests = [
      this.source.getMetaAndAssetCtxs().pipe(
        map((response) => ({ dex: '', dexIndex: 0, response }))
      ),
    ];
    const supported = new Set(this.source.enabledDexes.filter(Boolean));
    (Array.isArray(perpDexs) ? perpDexs : []).forEach((item, dexIndex) => {
      const dex = item?.name;
      if (!dex || dexIndex === 0 || !supported.has(dex)) {
        return;
      }
      requests.push(
        this.source.getMetaAndAssetCtxs(dex).pipe(
          map((response) => ({ dex, dexIndex, response })),
          // 一个取不到的 builder DEX 不能把标准永续市场一起藏掉 ——
          // 但这样得到的列表是 `incomplete`，不是 `live`。
          catchError(() => of(null))
        )
      );
    });
    return forkJoin(requests);
  }

  private foldSnapshot(
    responses: Array<{ dex: string; dexIndex: number; response: MetaAndAssetCtxs } | null>
  ): { markets: PerpsMarket[]; missing: boolean } {
    const markets: PerpsMarket[] = [];
    responses.filter(Boolean).forEach(({ dex, dexIndex, response }) => {
      const [meta, ctxs] = response || ([] as any);
      (meta?.universe || []).forEach((item, index) => {
        const ctx = ctxs?.[index];
        if (item.isDelisted || !ctx) {
          return;
        }
        markets.push(buildMarket(item, ctx, dex, dexIndex, index));
      });
    });
    return {
      markets: markets.sort((a, b) =>
        new BigNumber(b.dayVolumeExact).comparedTo(a.dayVolumeExact)
      ),
      missing: responses.some((r) => r === null),
    };
  }

  //#endregion
}
