import { Injectable } from '@angular/core';
import BigNumber from 'bignumber.js';
import {
  BehaviorSubject,
  Observable,
  Subscription,
  concat,
  forkJoin,
  of,
} from 'rxjs';
import {
  catchError,
  filter,
  map,
  shareReplay,
  switchMap,
  tap,
} from 'rxjs/operators';

import {
  PerpsAssetCtx,
  PerpsConnectionState,
  PerpsMarket,
  PerpsUniverseItem,
} from '@popup/_lib/perps';
import { HyperliquidService } from './hyperliquid.service';
import { PerpsDataChannel } from './perps-data-channel.service';
import { retryTransientFetch } from './perps-fetch-failure';
import {
  PerpsMarketDatasetState,
  buildMarket,
  marketContextFields,
  mergeDexAssetContexts,
} from './perps-market-dataset';

/** 某个 DEX 的静态元数据与它的实时上下文配对，顺序一致。 */
type MetaAndAssetCtxs = [{ universe: PerpsUniverseItem[] }, PerpsAssetCtx[]];

/**
 * 本模块对交易场所的全部需求，多一点都不要。
 *
 * 注册表要单独请求，因为它唯一的作用是把某个 HIP-3 DEX 定位到资产 id 空间里：标准永续
 * 市场按定义就是下标 0，因此完全跳过这次请求。
 */
interface PerpsMarketSource {
  readonly enabledDexes: string[];
  getDexRegistry(): Observable<any[]>;
  getMetaAndAssetCtxs(dex?: string): Observable<MetaAndAssetCtxs>;
}

/**
 * 列表可以旧到什么程度，超过就由新来的观察者付一次新快照的代价。
 *
 * 价格由帧免费保持最新，所以这条规则管的不是数字的新鲜度 —— 它管的是「集合」：上次快照
 * 之后新上架或已下架的市场，在下一次快照之前都是看不见的。
 */
const SNAPSHOT_TTL_MS = 15000;

/** 屏幕上已经有市场时，失败的快照转为退避重试。 */
const RETRY_BASE_MS = 1000;
/** 429 是一个按 IP 计的额度，要到接下来的一分钟才补得回来。 */
const RATE_LIMITED_BASE_MS = 10000;
const RETRY_CAP_MS = 60000;

const LOADING: PerpsMarketDatasetState = {
  availability: 'loading',
  markets: [],
  updatedAt: null,
};

/**
 * 行情数据集（Market Dataset）—— 市场集合及其当前价格。
 *
 * 集合来自快照，数值来自数据通道（Data Channel）的帧，两者的仲裁放在这里而不是页面上：
 * 在首次快照之前到达的帧会被暂存、待快照落地后重放到它上面，因此慢吞吞的 REST 响应不会
 * 让列表落后整整一代；而帧永远不能凭空造出或移除一个市场 —— 这也正是重连之后要重新取
 * 快照、而不是指望数据流自己追上来的原因。
 *
 * 这个列表是单例，由所有观察它的页面共享。市场详情则完全是另一种形态：一个页面读一个
 * 市场，然后跟随该市场自己的频道，没有共享状态，也没有后台刷新。
 */
@Injectable({ providedIn: 'root' })
export class PerpsMarketDatasetService {
  private readonly source: PerpsMarketSource;

  private readonly state$ = new BehaviorSubject<PerpsMarketDatasetState>(
    LOADING
  );
  private observers = 0;
  private liveSub: Subscription;
  private connectionState: PerpsConnectionState = 'connecting';
  /** 首次快照之前见到的帧，按 DEX 分别暂存。 */
  private readonly pendingAssetContexts = new Map<string, PerpsAssetCtx[]>();
  /** 当前在途的快照，由所有请求方共享。 */
  private snapshotRequest: Observable<PerpsMarket[]> | null = null;
  private retryTimer: any;
  private retryAttempts = 0;

  constructor(
    hyperliquid: HyperliquidService,
    private readonly channel: PerpsDataChannel
  ) {
    this.source = hyperliquid;
  }

  /**
   * 共享的实时市场列表。
   *
   * 第一个观察者会开启各 DEX 的订阅，并用一次快照为它们播下种子；最后一个观察者关闭
   * 它们。失败会以 `unavailable` 发布出去，而不是让整条流 error：之后重试成功的结果
   * 必须能送达同一批订阅者，而一个已经 error 的 observable 就此终结。
   */
  watchMarkets(): Observable<PerpsMarketDatasetState> {
    return new Observable<PerpsMarketDatasetState>((observer) => {
      this.observers += 1;
      if (this.observers === 1) {
        this.start();
      }
      const subscription = this.state$.subscribe(observer);
      this.ensureSnapshot();
      return () => {
        subscription.unsubscribe();
        this.observers -= 1;
        if (this.observers === 0) {
          this.stop();
        }
      };
    });
  }

  /** 当前列表；只有在手上这份太旧时才先取一次快照。 */
  getMarkets(): Observable<PerpsMarket[]> {
    const current = this.state$.value;
    if (this.isFresh(current)) {
      return of(current.markets);
    }
    return this.loadSnapshot();
  }

  /**
   * 单个市场的实时上下文，来自该市场自己的数据源。
   *
   * 详情页是用户按下做多或做空之前一直盯着的页面，所以它跟随该市场的 `activeAssetCtx`
   * 频道，而不是列表那种按 DEX 的周期性帧。一帧会把价格和 24 小时统计一起带来，因此页面
   * 绝不会把这条消息里的价格与另一条消息里的 `prevDayPx` 配成一对。
   *
   * 对于本版本不承载的币种会发出 `null`：可能是已下架的资产、本版本未启用的 DEX，或者
   * 一个错误的路由参数。这和「请求失败」是不同的答案，后者会 error —— 两种情况下页面都
   * 没东西可显示，但只有其中一种值得提供重试。
   */
  watchMarketDetail(coin: string): Observable<PerpsMarket | null> {
    const dex = coin?.includes(':') ? coin.slice(0, coin.indexOf(':')) : '';
    if (!coin || !this.source.enabledDexes.includes(dex)) {
      return of(null);
    }
    return this.marketSnapshot(coin, dex).pipe(
      // 没有这份快照，页面就什么都没有；而且它只是一次普通读取，所以对于一条在去程上
      // 断掉的连接，值得在告诉用户「市场加载失败」之前再问一次。这是一份短促、间隔均匀、
      // 用户盯着也等得起的预算 —— 不是列表那种后台退避，那种退避是为了让已经可见的价格
      // 保持存活，并没有人在对着一片空白干等。
      retryTransientFetch(),
      switchMap((market) =>
        market
          ? concat(
              of(market),
              // 快照在途期间到达的帧会丢失，而这不付出任何代价：每一帧都是完整的上下文，
              // 所以下一帧会把错过的那些帧说过的话重述一遍。
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
   * 单个市场的静态元数据，外加一帧上下文。
   *
   * 只请求该市场自己所属的那个 DEX，这正是详情页得以避开列表所需的全 DEX 快照的原因。
   * DEX 是从币种本身读出来的：HIP-3 币种会把它的 DEX 作为前缀带上，而不带前缀的币种
   * 按定义就属于标准永续。
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
   * 产品真正会展示的每个 DEX 各订阅一条市场上下文。
   *
   * 另一个选择 `allDexsAssetCtxs` 会把所有已部署的 HIP-3 DEX 塞进同一帧广播出来 ——
   * 在测试网上大约 170KB，其中四分之三是 NeoLine 根本不列出的 DEX —— 而且它到达的频率
   * 并不比按 DEX 的帧更高。
   */
  private start() {
    const stream = new Subscription();
    this.source.enabledDexes.forEach((dex) => {
      stream.add(
        this.channel
          .subscribe({ type: 'assetCtxs', dex })
          .subscribe((update) => this.applyFrame(dex, update?.ctxs))
      );
    });
    stream.add(
      this.channel.watchConnectionState().subscribe((state) => {
        const recovered = this.connectionState === 'stale' && state === 'live';
        this.connectionState = state;
        if (state === 'stale') {
          if (this.state$.value.markets.length) {
            this.publish({ availability: 'stale' });
          }
        } else if (recovered) {
          // 帧自己会重述价格，但它既不能新增也不能移除市场 ——
          // 所以「有哪些市场」才是重连欠下的那笔账。
          this.loadSnapshot().subscribe({ error: () => undefined });
        }
      })
    );
    this.liveSub = stream;
  }

  private stop() {
    this.liveSub?.unsubscribe();
    this.liveSub = undefined;
    clearTimeout(this.retryTimer);
    this.retryTimer = undefined;
  }

  private isFresh(state: PerpsMarketDatasetState): boolean {
    return (
      state.updatedAt !== null && Date.now() - state.updatedAt < SNAPSHOT_TTL_MS
    );
  }

  private ensureSnapshot() {
    const current = this.state$.value;
    if (this.snapshotRequest || this.isFresh(current)) {
      return;
    }
    this.loadSnapshot().subscribe({
      error: (error) => this.onSnapshotError(error),
    });
  }

  private onSnapshotError(error: any) {
    if (this.observers === 0) {
      return;
    }
    if (!this.state$.value.markets.length) {
      this.publish({ availability: 'unavailable' });
      return;
    }
    // 市场已经在屏幕上了，所以这次失败还不是用户的问题 ——
    // 继续显示它们，并以逐渐拉长的间隔再问。
    clearTimeout(this.retryTimer);
    const base = error?.status === 429 ? RATE_LIMITED_BASE_MS : RETRY_BASE_MS;
    const delay = Math.min(
      base * Math.pow(2, this.retryAttempts),
      RETRY_CAP_MS
    );
    this.retryAttempts += 1;
    this.retryTimer = setTimeout(() => this.ensureSnapshot(), delay);
  }

  /**
   * 所有可交易市场与它们的实时上下文合并的结果，按 24 小时成交量排序。
   *
   * 已下架的资产会被剔除 —— 但它们在 `universe` 里仍然占着一个下标，所以资产 id 取自
   * 原始位置，绝不能重新计算。
   */
  private loadSnapshot(): Observable<PerpsMarket[]> {
    if (this.snapshotRequest) {
      return this.snapshotRequest;
    }
    const request = this.source.getDexRegistry().pipe(
      switchMap((perpDexs) => this.snapshotRequests(perpDexs)),
      map((responses) => this.foldSnapshot(responses)),
      tap(({ markets, missing }) => {
        this.pendingAssetContexts.clear();
        this.retryAttempts = 0;
        this.snapshotRequest = null;
        this.publish({
          availability: missing ? 'incomplete' : 'live',
          markets,
          updatedAt: Date.now(),
        });
      }),
      map(({ markets }) => markets),
      catchError((error) => {
        this.snapshotRequest = null;
        throw error;
      }),
      // 在途快照只有一份，大家共享：同时到来的多个页面，不该各自从同一个 IP 额度里
      // 花掉一个请求。
      shareReplay({ bufferSize: 1, refCount: false })
    );
    this.snapshotRequest = request;
    return request;
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
          // 一个不可用的 builder DEX 不能把标准永续市场藏起来 ——
          // 但由此得到的列表是 `incomplete`，不是 `live`。
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
    const sorted = markets.sort((a, b) =>
      new BigNumber(b.dayVolumeExact).comparedTo(a.dayVolumeExact)
    );
    // 在这次快照之前到达的帧会被重放到它上面，这样慢吞吞的 REST 响应就不会让列表落后
    // 整整一代。
    let seeded = sorted;
    this.pendingAssetContexts.forEach((ctxs, dex) => {
      seeded = mergeDexAssetContexts(seeded, dex, ctxs);
    });
    return { markets: seeded, missing: responses.some((r) => r === null) };
  }

  private applyFrame(dex: string, ctxs: PerpsAssetCtx[]) {
    if (!Array.isArray(ctxs) || ctxs.length === 0) {
      return;
    }
    const current = this.state$.value;
    if (!current.markets.length) {
      // 快照才定义有哪些市场存在；在它落地之前先把帧攥着，
      // 而不是从一个上下文数组里凭空造出市场。
      this.pendingAssetContexts.set(dex, ctxs);
      return;
    }
    this.publish({
      markets: mergeDexAssetContexts(current.markets, dex, ctxs),
      updatedAt: Date.now(),
      availability:
        current.availability === 'incomplete' ? 'incomplete' : 'live',
    });
  }

  private publish(patch: Partial<PerpsMarketDatasetState>) {
    this.state$.next({ ...this.state$.value, ...patch });
  }

  //#endregion
}
