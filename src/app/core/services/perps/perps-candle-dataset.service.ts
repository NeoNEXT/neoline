import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable, Subscription } from 'rxjs';

import {
  PerpsCandle,
  PerpsCandleInterval,
  PerpsConnectionState,
  PERPS_CANDLE_LIMIT,
} from '@popup/_lib/perps';

import { HyperliquidService } from './hyperliquid.service';
import { PerpsDataChannel } from './perps-data-channel.service';
import {
  PerpsCandleDatasetState,
  candlesAreFresh,
  foldCandle,
  mergeCandles,
  recoveryWindow,
  snapshotWindow,
} from './perps-candle-dataset';

/**
 * 本模块对交易场所的全部需求，多一点都不要。
 *
 * 快照按显式的时间范围请求：由柱子数量换算出时间窗口是本模块自己的规则，不该由传输层
 * 知道。
 */
interface PerpsCandleSource {
  getCandleRange(
    coin: string,
    interval: PerpsCandleInterval,
    startTime: number,
    endTime: number
  ): Observable<PerpsCandle[]>;
}

/**
 * 跨所有数据集，快照请求之间最密可以挨到多近。
 *
 * 在周期切换栏上依次点过去，是一秒左右四次点击，而每一次指向的都是不同的数据集 ——
 * 所以这个配额不能挂在其中任何一个数据集上。第一次点击仍然立刻发起请求，好让单独点一下
 * 感觉是即时的；这一串点击中余下的部分会坍缩到结束这串点击的那一次上，而用户已经离开的
 * 数据集则被丢弃，不再去取。
 */
const SNAPSHOT_WINDOW_MS = 300;

/** 本次会话记住的数据集，最近使用的排在最后。 */
const REMEMBERED_DATASETS = 8;

interface CandleEntry {
  key: string;
  coin: string;
  interval: PerpsCandleInterval;
  subject: BehaviorSubject<PerpsCandleDatasetState>;
  observers: number;
  started: boolean;
  connectionState: PerpsConnectionState;
  subscriptions: Subscription;
  /** 快照在途期间见到的实时帧。 */
  snapshotBuffer: PerpsCandle[];
  /** 该数据集有快照或补缺请求未完成时置位。 */
  requestInFlight: boolean;
  /** 请求进行中到达的一次 stale → live 状态跃迁。 */
  pendingRecovery: boolean;
  historyExhausted: boolean;
  historyLoading: boolean;
}

/**
 * 每个（市场主键, K 线周期）对应的 K 线数据集（Candle Dataset）。
 *
 * 快照与实时帧的仲裁放在这里，而不是放在页面上：数据集一被观察就立刻开启订阅，快照在途
 * 期间到达的帧会被暂存、待快照落地后再折叠回去，而且整个数据集是带键的 —— 于是用户已经
 * 离开的那个市场的答复，会落进它自己的条目，而不会去和当前屏幕上的那个赛跑。
 */
@Injectable({ providedIn: 'root' })
export class PerpsCandleDatasetService {
  private readonly source: PerpsCandleSource;
  private readonly entries = new Map<string, CandleEntry>();
  /**
   * 某个市场与周期上一次显示过的 K 线。
   *
   * 只在本次会话内保留，并且活得比条目本身更久：它的作用是让用户已经打开过的市场在网络
   * 答复之前就能先画出来，而不是一个历史数据存储。
   */
  private readonly remembered = new Map<string, PerpsCandle[]>();
  private snapshotTimer: any = null;
  private pendingSnapshot: CandleEntry | null = null;

  constructor(
    hyperliquid: HyperliquidService,
    private readonly channel: PerpsDataChannel
  ) {
    this.source = hyperliquid;
  }

  /** 单个数据集，由所有观察同一市场与周期的调用方共享。 */
  watchDataset(
    coin: string,
    interval: PerpsCandleInterval
  ): Observable<PerpsCandleDatasetState> {
    return new Observable<PerpsCandleDatasetState>((observer) => {
      const entry = this.entry(coin, interval);
      entry.observers += 1;
      const subscription = entry.subject.subscribe(observer);
      if (!entry.started) {
        this.start(entry);
      }
      return () => {
        subscription.unsubscribe();
        entry.observers = Math.max(0, entry.observers - 1);
        this.stopIfUnused(entry);
      };
    });
  }

  /**
   * 再取一页比该数据集现有内容更早的柱子。
   *
   * 前插不会动数据集的右侧；返回空页说明交易场所再往前也没有数据了，此后不再继续请求。
   */
  loadEarlier(coin: string, interval: PerpsCandleInterval) {
    const entry = this.entries.get(this.key(coin, interval));
    if (!entry || entry.historyExhausted || entry.historyLoading) {
      return;
    }
    const state = entry.subject.value;
    if (state.availability === 'loading' || !state.candles.length) {
      return;
    }
    entry.historyLoading = true;
    const endTime = state.candles[0].t;
    const { startTime } = snapshotWindow(interval, PERPS_CANDLE_LIMIT, endTime);
    this.source.getCandleRange(coin, interval, startTime, endTime).subscribe({
      next: (res) => {
        entry.historyLoading = false;
        // 交易场所可能会把窗口末端的那根柱子重复返回。
        const older = (res || []).filter((candle) => candle.t < endTime);
        if (!older.length) {
          entry.historyExhausted = true;
          this.stopIfUnused(entry);
          return;
        }
        this.publish(entry, [...older, ...entry.subject.value.candles]);
        this.stopIfUnused(entry);
      },
      error: () => {
        entry.historyLoading = false;
        this.stopIfUnused(entry);
      },
    });
  }

  private key(coin: string, interval: PerpsCandleInterval): string {
    return `${coin}:${interval}`;
  }

  private entry(coin: string, interval: PerpsCandleInterval): CandleEntry {
    const key = this.key(coin, interval);
    let entry = this.entries.get(key);
    if (!entry) {
      entry = {
        key,
        coin,
        interval,
        subject: new BehaviorSubject<PerpsCandleDatasetState>({
          availability: 'loading',
          candles: [],
          updatedAt: null,
        }),
        observers: 0,
        started: false,
        connectionState: 'connecting',
        subscriptions: new Subscription(),
        snapshotBuffer: [],
        requestInFlight: false,
        pendingRecovery: false,
        historyExhausted: false,
        historyLoading: false,
      };
      this.entries.set(key, entry);
    }
    return entry;
  }

  private start(entry: CandleEntry) {
    if (entry.started) {
      return;
    }
    entry.started = true;
    entry.subscriptions = new Subscription();

    // 本次会话已经见过的柱子会先画出来，然后才向网络问任何东西：在一张本可以画出来的
    // 图上盖个转圈是更糟的答案，而它背后的快照片刻之后会把尾部修正过来。
    const cached = this.remembered.get(entry.key);
    if (cached && candlesAreFresh(cached, entry.interval, Date.now())) {
      entry.subject.next({
        availability: 'live',
        candles: cached,
        updatedAt: Date.now(),
      });
    }

    entry.subscriptions.add(
      this.channel.watchConnectionState().subscribe((state) => {
        const recovered =
          entry.connectionState === 'stale' && state === 'live';
        entry.connectionState = state;
        if (recovered) {
          this.recover(entry);
        }
      })
    );

    // 帧从数据集被打开的那一刻起就开始收，而不是从快照答复的那一刻起：其间收盘的柱子
    // 是别的东西永远补不上的，而下面的缓冲无论如何都能处理好重叠部分。
    entry.subscriptions.add(
      this.channel
        .subscribe({
          type: 'candle',
          coin: entry.coin,
          interval: entry.interval,
        })
        .subscribe((candle: PerpsCandle) => this.applyFrame(entry, candle))
    );

    this.requestSnapshot(entry);
  }

  private requestSnapshot(entry: CandleEntry) {
    if (this.snapshotTimer) {
      // 只有用户最终停留的那个数据集才值得取一次快照。
      this.pendingSnapshot = entry;
      return;
    }
    this.dispatchSnapshot(entry);
    this.openSnapshotWindow();
  }

  private openSnapshotWindow() {
    this.snapshotTimer = setTimeout(() => {
      this.snapshotTimer = null;
      const next = this.pendingSnapshot;
      this.pendingSnapshot = null;
      if (next && next.observers > 0) {
        this.dispatchSnapshot(next);
        this.openSnapshotWindow();
      }
    }, SNAPSHOT_WINDOW_MS);
  }

  private dispatchSnapshot(entry: CandleEntry) {
    if (entry.requestInFlight) {
      return;
    }
    const seeded = entry.subject.value.candles.length > 0;
    const { startTime, endTime } = snapshotWindow(
      entry.interval,
      PERPS_CANDLE_LIMIT,
      Date.now()
    );
    this.beginRequest(entry);
    this.source
      .getCandleRange(entry.coin, entry.interval, startTime, endTime)
      .subscribe({
        next: (res) => {
          // 交易场所会忽略超出它 5000 根历史的范围，所以这个上限只是修剪我们要渲染的
          // 尾部。
          const snapshot = (res || []).slice(-PERPS_CANDLE_LIMIT);
          const buffered = this.finishRequest(entry);
          // REST 响应可能落在同一根柱子更新的 websocket 陈述之后。把请求期间观察到的
          // 帧重新应用一遍，就能保证到达顺序不会让更旧的快照获胜。
          const merged = mergeCandles(
            seeded
              ? mergeCandles(entry.subject.value.candles, snapshot)
              : snapshot,
            buffered
          );
          // 空答复也是答复：没有柱子的市场，和我们够不着的市场不是一回事，
          // 只有后者才算不可用。
          this.publish(entry, merged, 'live');
          this.afterRequest(entry);
        },
        error: () => {
          this.finishRequest(entry);
          // 记住的柱子继续留着：它们是交易场所最后说过的话，而对于一次失败的增量补充，
          // 空白图表并不是更诚实的答案。
          if (!seeded) {
            this.publish(entry, [], 'unavailable');
          }
          this.afterRequest(entry);
        },
      });
  }

  /**
   * 把数据流断开期间错过的内容补回来。
   *
   * 重连后的套接字会重放订阅，但交易场所只推送当前正在走的那根柱子：我们「熄灯」期间
   * 收盘的每一根柱子，都是别的东西永远补不上的窟窿。
   */
  private recover(entry: CandleEntry) {
    if (entry.requestInFlight) {
      entry.pendingRecovery = true;
      return;
    }
    const current = entry.subject.value.candles;
    // 屏幕上没有可供合并的内容，所以欠下的是第一次加载。
    if (!current.length) {
      this.requestSnapshot(entry);
      return;
    }
    const { startTime, endTime, reloadAvailableDataset } = recoveryWindow(
      current,
      entry.interval,
      Date.now()
    );
    this.beginRequest(entry);
    this.source
      .getCandleRange(entry.coin, entry.interval, startTime, endTime)
      .subscribe({
        next: (res) => {
          const buffered = this.finishRequest(entry);
          if (reloadAvailableDataset && !res?.length) {
            this.publish(entry, entry.subject.value.candles, 'gapped');
            this.afterRequest(entry);
            return;
          }
          const base = reloadAvailableDataset
            ? res || []
            : mergeCandles(entry.subject.value.candles, res || []);
          this.publish(entry, mergeCandles(base, buffered), 'live');
          this.afterRequest(entry);
        },
        error: () => {
          this.finishRequest(entry);
          // 价格帧可能已经恢复实时，而收盘的柱子仍然残缺。
          // 保留已知的部分，但要把这次中断暴露出来。
          this.publish(entry, entry.subject.value.candles, 'gapped');
          this.afterRequest(entry);
        },
      });
  }

  private beginRequest(entry: CandleEntry) {
    entry.requestInFlight = true;
    entry.snapshotBuffer = [];
  }

  private finishRequest(entry: CandleEntry): PerpsCandle[] {
    const buffered = entry.snapshotBuffer;
    entry.snapshotBuffer = [];
    entry.requestInFlight = false;
    return buffered;
  }

  private afterRequest(entry: CandleEntry) {
    if (entry.pendingRecovery) {
      entry.pendingRecovery = false;
      this.recover(entry);
      return;
    }
    this.stopIfUnused(entry);
  }

  /** 把一帧实时数据折叠进数据集。 */
  private applyFrame(entry: CandleEntry, candle: PerpsCandle) {
    if (!candle) {
      return;
    }
    if (entry.requestInFlight) {
      entry.snapshotBuffer.push(candle);
    }
    const current = entry.subject.value;
    const candles = foldCandle(current.candles, candle);
    if (candles === current.candles) {
      return;
    }
    this.publish(entry, candles);
  }

  /**
   * 把一个数据集发到线上，并把它记住。
   *
   * 除非调用方明确给出新的可用性，否则可用性会沿用旧值，这样数据流补不回来的缺口就不会
   * 被下一帧悄悄清掉 —— 一根实时的尾部柱子，说明不了它背后仍然缺失的那些收盘柱子。
   */
  private publish(
    entry: CandleEntry,
    candles: PerpsCandle[],
    availability?: PerpsCandleDatasetState['availability']
  ) {
    const current = entry.subject.value;
    const next =
      availability ??
      (current.availability === 'loading' && candles.length
        ? 'live'
        : current.availability);
    this.remember(entry, candles);
    entry.subject.next({
      availability: next,
      candles,
      updatedAt: Date.now(),
    });
  }

  private remember(entry: CandleEntry, candles: PerpsCandle[]) {
    if (!entry.coin || !candles.length) {
      return;
    }
    // 重新插入会把这个键移到末尾，从而让这个 map 保持「最近最少使用」的顺序，
    // 首位的键就是该被淘汰的那个。
    this.remembered.delete(entry.key);
    this.remembered.set(entry.key, candles);
    while (this.remembered.size > REMEMBERED_DATASETS) {
      this.remembered.delete(this.remembered.keys().next().value);
    }
  }

  private stopIfUnused(entry: CandleEntry) {
    if (entry.observers > 0 || entry.requestInFlight || entry.historyLoading) {
      return;
    }
    entry.subscriptions.unsubscribe();
    entry.started = false;
    if (this.pendingSnapshot === entry) {
      this.pendingSnapshot = null;
    }
    if (this.entries.get(entry.key) === entry) {
      this.entries.delete(entry.key);
    }
  }
}
