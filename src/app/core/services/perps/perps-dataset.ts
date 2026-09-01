import { BehaviorSubject, Observable, ReplaySubject, Subscription } from 'rxjs';

import { PerpsConnectionState } from '@popup/_lib/perps';
import { PerpsDataChannel } from './perps-data-channel.service';

/**
 * 这次取数是为什么发生的。
 *
 * 两种情况取同样东西的数据集直接忽略它；重连时欠的东西比首次加载更窄的数据集则要分支 ——
 * K 线要补的是数据源断开期间收盘的那些柱子，不是从头再来一遍。
 */
export type PerpsDatasetLoadReason = 'snapshot' | 'reconnect';

/**
 * 一个**数据集**交给核心的全部东西，不多不少。
 *
 * 这里每一项都是声明：**什么时候**取数、订阅、缓冲、回放和发布由核心决定，
 * 这些钩子只说这些动作对某一个数据集**意味着什么**。
 */
export interface PerpsDatasetSpec<TKey, TState, TFrame> {
  /** 一个条目在取到任何东西之前所持有的状态。 */
  readonly initial: TState;

  /**
   * 条目的身份。只有一个条目的数据集返回一个常量 ——
   * 单例是「条目数恒为一」，不是第二种形状。
   */
  keyOf(key: TKey): string;

  /**
   * 这个条目的帧从哪来。核心在条目启动时订阅、被回收时退订，所以这里不必操心拆卸。
   * 多条频道合并成一个带标记的帧类型。
   */
  frames(key: TKey): Observable<TFrame>;

  /**
   * 一次取数。
   *
   * **不得抛错**：失败是这个数据集自己的答案 —— 一次退避、一个缺口，或者保留屏幕上已有的
   * 东西 —— 它属于返回的状态。万一还是漏出来一个错误，它会传给发起请求的那一方而不是被吞掉，
   * 并且绝不会把条目卡死。
   */
  load(
    key: TKey,
    current: TState,
    reason: PerpsDatasetLoadReason
  ): Observable<TState>;

  /**
   * 把一帧折叠进状态。
   *
   * 实时帧和取数期间缓冲帧的回放走的是同一个函数 —— 这正是「帧」只有一种含义的前提。
   * 原样返回 `state` 就什么都不发布。
   */
  foldFrame(state: TState, frame: TFrame): TState;

  /**
   * 一次连接态变化意味着什么状态。返回 `current` 就表示这次变化对本数据集没有意义。
   */
  onConnectionState(
    state: PerpsConnectionState,
    current: TState
  ): TState;
}

interface DatasetEntry<TKey, TState, TFrame> {
  id: string;
  key: TKey;
  subject: BehaviorSubject<TState>;
  observers: number;
  /** 数据集自己要求为之保活的、尚未结束的工作。 */
  holds: number;
  started: boolean;
  connectionState: PerpsConnectionState;
  subscriptions: Subscription;
  /** 一次取数在飞期间看到的帧。 */
  buffer: TFrame[];
  /** 在飞的那次取数，所有来要的人共用它。 */
  load$: Observable<TState> | null;
  /** 在一次取数还开着的时候到达的重连信号。 */
  pendingReconnect: boolean;
}

/**
 * **数据集** —— 「快照 + 帧」这条契约，只实现一次。
 *
 * 事实集合来自取数，数值来自**数据通道**的帧，两者在这里仲裁：取数在飞期间到达的帧先被
 * 缓冲，随后用同一个折叠函数回放到取数结果上 —— 于是一个慢回来的响应不会覆盖掉已经收到的
 * 更新的东西。帧不能新增也不能移除事实，所以断线重连欠的是一次取数，而不是指望流自己追上来。
 *
 * 留在外面的：退避、请求配给、缓存和聚合都是各数据集自己的策略。把它们参数化进来，
 * 等于用一个深模块换一个配置对象。
 *
 * 见 [ADR-0008](../../../../../docs/adr/0008-shared-dataset-snapshot-frame-arbiter.md)。
 */
export class PerpsDataset<TKey, TState, TFrame> {
  private readonly entries = new Map<
    string,
    DatasetEntry<TKey, TState, TFrame>
  >();

  constructor(
    private readonly channel: PerpsDataChannel,
    private readonly spec: PerpsDatasetSpec<TKey, TState, TFrame>
  ) {}

  /**
   * 一个条目的状态，由所有观察同一个键的调用方共享。
   *
   * 第一个订阅者打开帧订阅；最后一个离开时关掉它们，条目随之被忘掉。「刚订上来要不要
   * 先取一次数」是各数据集自己的策略，所以 `watch` 本身不取数。
   */
  watch(key: TKey): Observable<TState> {
    return new Observable<TState>((observer) => {
      const entry = this.entry(key);
      entry.observers += 1;
      const subscription = entry.subject.subscribe(observer);
      this.start(entry);
      return () => {
        subscription.unsubscribe();
        entry.observers = Math.max(0, entry.observers - 1);
        this.stopIfUnused(entry);
      };
    });
  }

  /**
   * 重新取一次数，折叠进同一份状态。
   *
   * 同一个键上的并发调用共用已经在飞的那次取数。这里不打开帧订阅：缓冲的意义是保护
   * 有人正在看的状态，而没人看的键根本没有帧需要防。
   */
  refresh(key: TKey): Observable<TState> {
    return this.load(this.entry(key), 'snapshot');
  }

  /**
   * 不订阅地读一眼当前状态，供各数据集判断自己的新鲜度。
   * 没有任何人持有的键读到的是初始状态，而不是就地造一个出来。
   */
  peek(key: TKey): TState {
    const entry = this.entries.get(this.spec.keyOf(key));
    return entry ? entry.subject.value : this.spec.initial;
  }

  /**
   * 在数据集自己对某个条目做事期间把它钉住 —— 比如往历史更深处翻页，那是本核心
   * 一无所知的一次取数。释放是幂等的。
   */
  keepAlive(key: TKey): () => void {
    const entry = this.entry(key);
    entry.holds += 1;
    let released = false;
    return () => {
      if (released) {
        return;
      }
      released = true;
      entry.holds = Math.max(0, entry.holds - 1);
      this.stopIfUnused(entry);
    };
  }

  private entry(key: TKey): DatasetEntry<TKey, TState, TFrame> {
    const id = this.spec.keyOf(key);
    let entry = this.entries.get(id);
    if (!entry) {
      entry = {
        id,
        key,
        subject: new BehaviorSubject<TState>(this.spec.initial),
        observers: 0,
        holds: 0,
        started: false,
        connectionState: 'connecting',
        subscriptions: new Subscription(),
        buffer: [],
        load$: null,
        pendingReconnect: false,
      };
      this.entries.set(id, entry);
    }
    return entry;
  }

  private start(entry: DatasetEntry<TKey, TState, TFrame>) {
    if (entry.started) {
      return;
    }
    entry.started = true;
    entry.subscriptions = new Subscription();
    entry.subscriptions.add(
      this.channel.watchConnectionState().subscribe((state) => {
        const recovered =
          entry.connectionState === 'stale' && state === 'live';
        entry.connectionState = state;
        this.publish(
          entry,
          this.spec.onConnectionState(state, entry.subject.value)
        );
        if (recovered) {
          this.reconnect(entry);
        }
      })
    );
    // 从条目打开的那一刻起就收帧，而不是从取数返回的那一刻起：
    // 这中间到达的东西，正是缓冲区存在的理由。
    entry.subscriptions.add(
      this.spec
        .frames(entry.key)
        .subscribe((frame) => this.applyFrame(entry, frame))
    );
  }

  private load(
    entry: DatasetEntry<TKey, TState, TFrame>,
    reason: PerpsDatasetLoadReason
  ): Observable<TState> {
    if (entry.load$) {
      return entry.load$;
    }
    entry.buffer = [];
    const result = new ReplaySubject<TState>(1);
    const loading = result.asObservable();
    entry.load$ = loading;
    this.spec.load(entry.key, entry.subject.value, reason).subscribe({
      next: (loaded) => {
        const replayed = this.finishLoad(entry).reduce(
          (state, frame) => this.spec.foldFrame(state, frame),
          loaded
        );
        this.publish(entry, replayed);
        result.next(replayed);
        result.complete();
        this.afterLoad(entry);
      },
      // 契约上 `load` 不该抛错；真抛了也不能让这个条目从此再也取不了数，
      // 所以无论哪条路都要清掉在飞标记。
      error: (error) => {
        this.finishLoad(entry);
        result.error(error);
        this.afterLoad(entry);
      },
    });
    return loading;
  }

  private finishLoad(
    entry: DatasetEntry<TKey, TState, TFrame>
  ): TFrame[] {
    const buffered = entry.buffer;
    entry.buffer = [];
    entry.load$ = null;
    return buffered;
  }

  private afterLoad(entry: DatasetEntry<TKey, TState, TFrame>) {
    if (entry.pendingReconnect) {
      entry.pendingReconnect = false;
      this.reconnect(entry);
      return;
    }
    this.stopIfUnused(entry);
  }

  /**
   * 重连欠一次取数，但一次只能有一个：在一次取数还开着的时候再要一次，要么和它抢，
   * 要么被静默丢掉 —— 所以它排队等前一次结束。
   */
  private reconnect(entry: DatasetEntry<TKey, TState, TFrame>) {
    if (entry.load$) {
      entry.pendingReconnect = true;
      return;
    }
    this.load(entry, 'reconnect').subscribe({ error: () => undefined });
  }

  private applyFrame(
    entry: DatasetEntry<TKey, TState, TFrame>,
    frame: TFrame
  ) {
    if (entry.load$) {
      entry.buffer.push(frame);
    }
    this.publish(entry, this.spec.foldFrame(entry.subject.value, frame));
  }

  /** 状态抵达订阅者的唯一出口。没有变化的状态不算消息。 */
  private publish(
    entry: DatasetEntry<TKey, TState, TFrame>,
    state: TState
  ) {
    if (state === entry.subject.value) {
      return;
    }
    entry.subject.next(state);
  }

  private stopIfUnused(entry: DatasetEntry<TKey, TState, TFrame>) {
    if (entry.observers > 0 || entry.holds > 0 || entry.load$) {
      return;
    }
    entry.subscriptions.unsubscribe();
    entry.started = false;
    if (this.entries.get(entry.id) === entry) {
      this.entries.delete(entry.id);
    }
  }
}
