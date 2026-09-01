import { Injectable } from '@angular/core';
import { EMPTY, Observable, Subject, merge, of } from 'rxjs';
import { catchError, map, tap } from 'rxjs/operators';

import {
  PerpsCandle,
  PerpsCandleInterval,
  PERPS_CANDLE_LIMIT,
} from '@popup/_lib/perps';

import { HyperliquidService } from './hyperliquid.service';
import { PerpsDataChannel } from './perps-data-channel.service';
import { PerpsDataset } from './perps-dataset';
import {
  PerpsCandleDatasetState,
  candlesAreFresh,
  foldCandle,
  mergeCandles,
  recoveryWindow,
  snapshotWindow,
} from './perps-candle-dataset';

/**
 * 本模块需要交易场所提供的全部东西，不多不少。
 *
 * 快照按一个显式区间去要：由柱子根数换算出时间窗口是本模块自己的规则，
 * 传输层不该知道这件事。
 */
interface PerpsCandleSource {
  getCandleRange(
    coin: string,
    interval: PerpsCandleInterval,
    startTime: number,
    endTime: number
  ): Observable<PerpsCandle[]>;
}

/** 一个以（市场主键，K 线周期）为身份的数据集。 */
export interface PerpsCandleKey {
  coin: string;
  interval: PerpsCandleInterval;
}

/**
 * 要折叠进数据集的一次增量。
 *
 * 对数据集来说，一根实时柱子和一页历史柱子是同一种东西 —— 都是比它手里更新的内容 ——
 * 所以两者以同样的方式到达、经由同一个折叠函数落定。正因如此，本会话已经画过的柱子、
 * 一页历史和 websocket 才能全都抵达状态，而不需要第二条写入路径。
 */
type PerpsCandleUpdate =
  | { kind: 'live'; candle: PerpsCandle }
  | { kind: 'batch'; candles: PerpsCandle[] };

/**
 * 快照请求彼此可以挨多近 —— 这条限制是跨所有数据集的。
 *
 * 在周期那一排上一路点过去，大约一秒内四次点击，而每一次点的都是**不同的**数据集 ——
 * 所以配给不能挂在其中任何一个身上。第一次点击仍然立刻取数，好让单次点击是即时的；
 * 这一串连点的其余部分收敛到结束它的那一次上，而用户已经离开的数据集直接丢弃，不再取数。
 */
const SNAPSHOT_WINDOW_MS = 300;

/** 本会话记住的数据集，最近使用的排在最后。 */
const REMEMBERED_DATASETS = 8;

const LOADING: PerpsCandleDatasetState = {
  availability: 'loading',
  candles: [],
  updatedAt: null,
};

/**
 * 按（市场主键，K 线周期）划分的 **K 线数据集**。
 *
 * 快照与帧的仲裁归共享的**数据集**核心，见
 * [ADR-0008](../../../../../docs/adr/0008-shared-dataset-snapshot-frame-arbiter.md)。
 * 只有 K 线特有的东西留在这里：快照窗口怎么定大小、数据源断开期间有柱子收盘时重连欠什么、
 * 跨数据集的快照请求配给、历史翻页，以及本会话已经画过的柱子。
 */
@Injectable({ providedIn: 'root' })
export class PerpsCandleDatasetService {
  private readonly source: PerpsCandleSource;
  private readonly dataset: PerpsDataset<
    PerpsCandleKey,
    PerpsCandleDatasetState,
    PerpsCandleUpdate
  >;

  /**
   * 某个市场与周期上最后显示过的 K 线。
   *
   * 只在会话内保留：它的用处是让用户已经打开过的市场在网络回答之前先画出来，
   * 而不是一份历史仓库。
   */
  private readonly remembered = new Map<string, PerpsCandle[]>();
  /** 历史翻页的投递口，供当前打开着的数据集使用。 */
  private readonly updates = new Map<string, Subject<PerpsCandleUpdate>>();
  /** 当前被观察着的数据集，供配给决策使用。 */
  private readonly watchers = new Map<string, number>();
  private readonly historyLoading = new Set<string>();
  private readonly historyExhausted = new Set<string>();
  private snapshotTimer: any = null;
  private pendingSnapshot: PerpsCandleKey | null = null;

  constructor(hyperliquid: HyperliquidService, channel: PerpsDataChannel) {
    this.source = hyperliquid;
    this.dataset = new PerpsDataset(channel, {
      initial: LOADING,
      keyOf: (key) => this.keyOf(key),
      frames: (key) => this.openUpdates(key, channel),
      load: (key, current, reason) =>
        reason === 'reconnect'
          ? this.recoveryLoad(key, current)
          : this.snapshotLoad(key, current),
      foldFrame: (state, update) => this.foldUpdate(state, update),
      // 数据源断开会在已收盘的柱子里留下一个洞 —— 等恢复流程弄清它能不能补上之后，
      // 那正是 `gapped` 要说的话。它与「某个值可能已经变了」不是同一个论断，
      // 所以这里没什么可说的。
      onConnectionState: (_state, current) => current,
    });
  }

  /** 一个数据集，由所有观察同一市场与周期的调用方共享。 */
  watchDataset(
    coin: string,
    interval: PerpsCandleInterval
  ): Observable<PerpsCandleDatasetState> {
    const key = { coin, interval };
    const id = this.keyOf(key);
    return new Observable<PerpsCandleDatasetState>((observer) => {
      this.watchers.set(id, (this.watchers.get(id) || 0) + 1);
      const subscription = this.dataset
        .watch(key)
        // 记住屏幕上的内容，恰恰只在有人正看着它的时候才值得做 ——
        // 那也是它之后唯一的用途。
        .pipe(tap((state) => this.remember(id, state.candles)))
        .subscribe(observer);
      this.requestSnapshot(key);
      return () => {
        subscription.unsubscribe();
        const left = (this.watchers.get(id) || 1) - 1;
        if (left > 0) {
          this.watchers.set(id, left);
        } else {
          this.watchers.delete(id);
        }
      };
    });
  }

  /**
   * 再要一页比本数据集手里更早的柱子。
   *
   * 往前拼接不会动数据集的右端；空的一页意味着交易场所再往前没有东西了，
   * 于是不再继续要。
   */
  loadEarlier(coin: string, interval: PerpsCandleInterval) {
    const key = { coin, interval };
    const id = this.keyOf(key);
    if (this.historyExhausted.has(id) || this.historyLoading.has(id)) {
      return;
    }
    const state = this.dataset.peek(key);
    if (state.availability === 'loading' || !state.candles.length) {
      return;
    }
    this.historyLoading.add(id);
    // 这次取数是数据集自己的，不是核心的，所以必须让条目站住等它落地。
    const release = this.dataset.keepAlive(key);
    const endTime = state.candles[0].t;
    const { startTime } = snapshotWindow(interval, PERPS_CANDLE_LIMIT, endTime);
    this.source.getCandleRange(coin, interval, startTime, endTime).subscribe({
      next: (res) => {
        this.historyLoading.delete(id);
        // 交易场所可能会把窗口末端那根柱子重复给一次。
        const older = (res || []).filter((candle) => candle.t < endTime);
        if (!older.length) {
          this.historyExhausted.add(id);
        } else {
          this.updates.get(id)?.next({ kind: 'batch', candles: older });
        }
        release();
      },
      error: () => {
        this.historyLoading.delete(id);
        release();
      },
    });
  }

  private keyOf({ coin, interval }: PerpsCandleKey): string {
    return `${coin}:${interval}`;
  }

  /**
   * 更新一个打开着的数据集的全部来源：本会话已经画过的柱子、交易场所的实时帧，
   * 以及本模块自己取回的历史页。
   */
  private openUpdates(
    key: PerpsCandleKey,
    channel: PerpsDataChannel
  ): Observable<PerpsCandleUpdate> {
    const id = this.keyOf(key);
    return new Observable<PerpsCandleUpdate>((observer) => {
      const local = new Subject<PerpsCandleUpdate>();
      this.updates.set(id, local);
      // 本会话已经见过的柱子在向网络问任何事之前就先画出来：在一张本来画得出来的图上
      // 盖一个转圈是更差的答案，而随后到达的快照会在片刻之后修正尾部。
      const cached = this.remembered.get(id);
      const seeded =
        cached && candlesAreFresh(cached, key.interval, Date.now())
          ? of<PerpsCandleUpdate>({ kind: 'batch', candles: cached })
          : EMPTY;
      const subscription = merge(
        seeded,
        channel
          .subscribe({
            type: 'candle',
            coin: key.coin,
            interval: key.interval,
          })
          .pipe(
            map((candle: PerpsCandle) => ({
              kind: 'live' as const,
              candle,
            }))
          ),
        local
      ).subscribe(observer);
      return () => {
        subscription.unsubscribe();
        if (this.updates.get(id) === local) {
          this.updates.delete(id);
        }
      };
    });
  }

  /**
   * 折叠进一次更新。
   *
   * 除非一次取数给出新的可用性，否则它原样保留 —— 于是一个数据源补不回来的缺口，
   * 不会被下一帧悄悄抹掉：一根实时的末尾柱子，对它身后那些仍然缺失的已收盘柱子什么都没说。
   */
  private foldUpdate(
    state: PerpsCandleDatasetState,
    update: PerpsCandleUpdate
  ): PerpsCandleDatasetState {
    const candles =
      update.kind === 'batch'
        ? mergeCandles(update.candles, state.candles)
        : foldCandle(state.candles, update.candle);
    if (candles === state.candles) {
      return state;
    }
    return {
      availability:
        state.availability === 'loading' && candles.length
          ? 'live'
          : state.availability,
      candles,
      updatedAt: Date.now(),
    };
  }

  /**
   * 快照请求是跨所有数据集配给的，所以这里决定的是**什么时候**去请核心取数，
   * 而不是自己去取。
   */
  private requestSnapshot(key: PerpsCandleKey) {
    if (this.snapshotTimer) {
      // 只有用户最终停在的那个数据集值得一次快照。
      this.pendingSnapshot = key;
      return;
    }
    this.dataset.refresh(key).subscribe({ error: () => undefined });
    this.openSnapshotWindow();
  }

  private openSnapshotWindow() {
    this.snapshotTimer = setTimeout(() => {
      this.snapshotTimer = null;
      const next = this.pendingSnapshot;
      this.pendingSnapshot = null;
      if (next && this.watchers.has(this.keyOf(next))) {
        this.dataset.refresh(next).subscribe({ error: () => undefined });
        this.openSnapshotWindow();
      }
    }, SNAPSHOT_WINDOW_MS);
  }

  private snapshotLoad(
    key: PerpsCandleKey,
    current: PerpsCandleDatasetState
  ): Observable<PerpsCandleDatasetState> {
    const seeded = current.candles.length > 0;
    const { startTime, endTime } = snapshotWindow(
      key.interval,
      PERPS_CANDLE_LIMIT,
      Date.now()
    );
    return this.source
      .getCandleRange(key.coin, key.interval, startTime, endTime)
      .pipe(
        map((res) => {
          // 交易场所会忽略超出它 5000 根历史的区间，所以这个上限只是在裁剪我们渲染的尾部。
          const snapshot = (res || []).slice(-PERPS_CANDLE_LIMIT);
          // 空答复也是一种答复：一个没有柱子的市场，和一个我们够不着的市场不是一回事，
          // 只有后者才算不可用。
          return this.loaded(
            seeded ? mergeCandles(current.candles, snapshot) : snapshot,
            'live'
          );
        }),
        // 记住的柱子继续留着：它们是交易场所最后说过的话，而对一次失败的增量补取来说，
        // 一张空图并不是更诚实的答案。
        catchError(() =>
          of(seeded ? current : this.loaded([], 'unavailable'))
        )
      );
  }

  /**
   * 把数据源断开期间漏掉的东西补回来。
   *
   * 重连后的 socket 会重放订阅，但交易场所只推当前正开着的那根柱子：
   * 断开期间收盘的每一根，都是一个再没有别的东西会去填的洞。
   */
  private recoveryLoad(
    key: PerpsCandleKey,
    current: PerpsCandleDatasetState
  ): Observable<PerpsCandleDatasetState> {
    // 屏幕上没有东西可供合并，所以欠的是第一次取数。
    if (!current.candles.length) {
      return this.snapshotLoad(key, current);
    }
    const { startTime, endTime, reloadAvailableDataset } = recoveryWindow(
      current.candles,
      key.interval,
      Date.now()
    );
    return this.source
      .getCandleRange(key.coin, key.interval, startTime, endTime)
      .pipe(
        map((res) => {
          if (reloadAvailableDataset && !res?.length) {
            return this.loaded(current.candles, 'gapped');
          }
          return this.loaded(
            reloadAvailableDataset
              ? res || []
              : mergeCandles(current.candles, res || []),
            'live'
          );
        }),
        // 价格帧可能已经恢复实时，而已收盘的柱子仍然是残缺的。
        // 保留已知的部分，但把那次中断如实暴露出来。
        catchError(() => of(this.loaded(current.candles, 'gapped')))
      );
  }

  private loaded(
    candles: PerpsCandle[],
    availability: PerpsCandleDatasetState['availability']
  ): PerpsCandleDatasetState {
    return { availability, candles, updatedAt: Date.now() };
  }

  private remember(id: string, candles: PerpsCandle[]) {
    if (!candles.length) {
      return;
    }
    // 重新插入会把键挪到末尾，从而让这个 map 保持「最近最少使用」的顺序，
    // 于是第一个键就是该淘汰的那个。
    this.remembered.delete(id);
    this.remembered.set(id, candles);
    while (this.remembered.size > REMEMBERED_DATASETS) {
      this.remembered.delete(this.remembered.keys().next().value);
    }
  }
}
