import { Observable, Subject, of, throwError } from 'rxjs';

import { PerpsConnectionState } from '@popup/_lib/perps';
import {
  PerpsDataset,
  PerpsDatasetLoadReason,
  PerpsDatasetSpec,
} from './perps-dataset';

/**
 * 一个被削到只剩待测机制的数据集：一个由帧往上加的数字，外加一个说明值从哪来的标记。
 * 这里没有任何领域规则 —— 这些用例测的是核心**什么时候**取数、缓冲、回放和回收。
 */
interface TestState {
  value: number;
  tag: string;
}

type TestKey = { id: string };

const INITIAL: TestState = { value: 0, tag: 'initial' };

interface Harness {
  dataset: PerpsDataset<TestKey, TestState, number>;
  /** 某个键上的帧，保持频道会推送过来的样子。 */
  frame(id: string, value: number): void;
  /** 这个键的帧订阅当前是不是开着的。 */
  subscribed(id: string): boolean;
  connection(state: PerpsConnectionState): void;
  /** 被要求过的每一次取数，按顺序。 */
  loads: Array<{ id: string; reason: PerpsDatasetLoadReason }>;
  /** 回答最早那次还没被回答的取数。 */
  answer(state: TestState): void;
  failLoad(error: any): void;
}

function harness(
  overrides: Partial<PerpsDatasetSpec<TestKey, TestState, number>> = {}
): Harness {
  const channels = new Map<string, Subject<number>>();
  const open = new Set<string>();
  const connection = new Subject<PerpsConnectionState>();
  const loads: Harness['loads'] = [];
  const pending: Array<Subject<TestState>> = [];

  const spec: PerpsDatasetSpec<TestKey, TestState, number> = {
    initial: INITIAL,
    keyOf: (key) => key.id,
    frames: (key) =>
      new Observable<number>((observer) => {
        let channel = channels.get(key.id);
        if (!channel) {
          channel = new Subject<number>();
          channels.set(key.id, channel);
        }
        open.add(key.id);
        const subscription = channel.subscribe(observer);
        return () => {
          subscription.unsubscribe();
          open.delete(key.id);
        };
      }),
    load: (key, _current, reason) => {
      loads.push({ id: key.id, reason });
      const answer = new Subject<TestState>();
      pending.push(answer);
      return answer;
    },
    foldFrame: (state, frame) =>
      frame === 0 ? state : { value: state.value + frame, tag: 'frame' },
    onConnectionState: (state, current) =>
      state === 'stale' ? { ...current, tag: 'stale' } : current,
    ...overrides,
  };

  return {
    dataset: new PerpsDataset(
      { watchConnectionState: () => connection.asObservable() } as any,
      spec
    ),
    frame: (id, value) => channels.get(id)?.next(value),
    subscribed: (id) => open.has(id),
    connection: (state) => connection.next(state),
    loads,
    answer: (state) => pending.shift()?.next(state),
    failLoad: (error) => pending.shift()?.error(error),
  };
}

/** 观察一个键，并留下它发布过的每一个状态。 */
function watching(dataset: PerpsDataset<TestKey, TestState, number>, id: string) {
  const seen: TestState[] = [];
  const subscription = dataset.watch({ id }).subscribe((state) => seen.push(state));
  return { seen, stop: () => subscription.unsubscribe(), last: () => seen[seen.length - 1] };
}

describe('PerpsDataset entry lifecycle', () => {
  it('opens frames for the first observer and closes them for the last', () => {
    const h = harness();

    const first = watching(h.dataset, 'a');
    expect(h.subscribed('a')).toBe(true);

    const second = watching(h.dataset, 'a');
    first.stop();
    // 第二个观察者还在看着。
    expect(h.subscribed('a')).toBe(true);

    second.stop();
    expect(h.subscribed('a')).toBe(false);
  });

  it('watching does not fetch on its own', () => {
    const h = harness();

    watching(h.dataset, 'a');

    // 「刚订上来的观察者欠不欠一次取数」是各数据集自己的策略。
    expect(h.loads).toEqual([]);
  });

  it('keeps entries apart so a frame reaches only its own key', () => {
    const h = harness();
    const a = watching(h.dataset, 'a');
    const b = watching(h.dataset, 'b');

    h.frame('a', 5);

    expect(a.last()).toEqual({ value: 5, tag: 'frame' });
    expect(b.last()).toBe(INITIAL);
  });

  it('forgets an entry once nothing holds it', () => {
    const h = harness();

    const first = watching(h.dataset, 'a');
    h.frame('a', 5);
    first.stop();

    // 新的观察者从初始状态起步，而不是从被回收掉的那个。
    expect(h.dataset.peek({ id: 'a' })).toBe(INITIAL);
  });
});

describe('PerpsDataset frames', () => {
  it('publishes a folded frame', () => {
    const h = harness();
    const a = watching(h.dataset, 'a');

    h.frame('a', 3);
    h.frame('a', 4);

    expect(a.last()).toEqual({ value: 7, tag: 'frame' });
  });

  it('publishes nothing when the fold changed nothing', () => {
    const h = harness();
    const a = watching(h.dataset, 'a');
    const before = a.seen.length;

    // 这个测试用的折叠函数对零帧返回同一个状态。
    h.frame('a', 0);

    expect(a.seen.length).toBe(before);
  });
});

describe('PerpsDataset loads', () => {
  it('replays frames that arrived during a load onto its result', () => {
    const h = harness();
    const a = watching(h.dataset, 'a');
    h.dataset.refresh({ id: 'a' }).subscribe();

    // 在取数还开着的时候到达：此刻先应用一次，同时还欠取数结果一次回放。
    h.frame('a', 5);
    h.answer({ value: 100, tag: 'loaded' });

    // 取数答的是 100，而那一帧被回放到它上面 ——
    // 于是一个慢回来的响应无法覆盖掉已经到达的更新的东西。
    expect(a.last()).toEqual({ value: 105, tag: 'frame' });
  });

  it('replays with the same fold that applies a live frame', () => {
    const folded: number[] = [];
    const h = harness({
      foldFrame: (state, frame) => {
        folded.push(frame);
        return { value: state.value + frame, tag: 'frame' };
      },
    });
    watching(h.dataset, 'a');
    h.dataset.refresh({ id: 'a' }).subscribe();

    h.frame('a', 5);
    h.answer({ value: 100, tag: 'loaded' });

    // 一次实时、一次回放 —— 同一个函数，所以「帧」只有一种含义。
    expect(folded).toEqual([5, 5]);
  });

  it('drops the buffer once it has been replayed', () => {
    const h = harness();
    const a = watching(h.dataset, 'a');

    h.dataset.refresh({ id: 'a' }).subscribe();
    h.frame('a', 5);
    h.answer({ value: 100, tag: 'loaded' });

    h.dataset.refresh({ id: 'a' }).subscribe();
    h.answer({ value: 200, tag: 'loaded' });

    // 先前那一帧只属于先前那次取数。
    expect(a.last()).toEqual({ value: 200, tag: 'loaded' });
  });

  it('shares one in-flight load across concurrent callers', () => {
    const h = harness();
    const seen: TestState[] = [];

    h.dataset.refresh({ id: 'a' }).subscribe((state) => seen.push(state));
    h.dataset.refresh({ id: 'a' }).subscribe((state) => seen.push(state));

    expect(h.loads.length).toBe(1);

    h.answer({ value: 100, tag: 'loaded' });
    expect(seen.length).toBe(2);
  });

  it('does not open frames for a refresh nobody is watching', () => {
    const h = harness();

    h.dataset.refresh({ id: 'a' }).subscribe();

    // 缓冲保护的是有人在看的状态；没人看的键根本没有这种状态。
    expect(h.subscribed('a')).toBe(false);
  });

  it('can load again after one failed', () => {
    const h = harness();
    watching(h.dataset, 'a');

    h.dataset.refresh({ id: 'a' }).subscribe({ error: () => undefined });
    h.failLoad(new Error('unreachable'));

    h.dataset.refresh({ id: 'a' }).subscribe();

    // 一次违反契约的行为，不能让这个条目从此再也取不了数。
    expect(h.loads.length).toBe(2);
  });
});

describe('PerpsDataset connection state', () => {
  it('publishes what a connection change means to the dataset', () => {
    const h = harness();
    const a = watching(h.dataset, 'a');

    h.connection('stale');

    expect(a.last().tag).toBe('stale');
  });

  it('publishes nothing when a connection change means nothing', () => {
    const h = harness({ onConnectionState: (_state, current) => current });
    const a = watching(h.dataset, 'a');
    const before = a.seen.length;

    h.connection('stale');
    h.connection('live');

    expect(a.seen.length).toBe(before);
  });

  it('loads after a reconnect, because frames cannot restore the set', () => {
    const h = harness();
    watching(h.dataset, 'a');

    h.connection('stale');
    h.connection('live');

    expect(h.loads).toEqual([{ id: 'a', reason: 'reconnect' }]);
  });

  it('does not load for a connection that was never stale', () => {
    const h = harness();
    watching(h.dataset, 'a');

    h.connection('live');

    expect(h.loads).toEqual([]);
  });

  it('holds a reconnect that arrives during a load until that load ends', () => {
    const h = harness();
    watching(h.dataset, 'a');
    h.dataset.refresh({ id: 'a' }).subscribe();

    h.connection('stale');
    h.connection('live');
    // 开着的那次取数还没回答，所以这次重连不构成第二个请求。
    expect(h.loads.length).toBe(1);

    h.answer({ value: 100, tag: 'loaded' });

    expect(h.loads.length).toBe(2);
    expect(h.loads[1].reason).toBe('reconnect');
  });
});

describe('PerpsDataset keepAlive', () => {
  it('pins an entry through the last observer leaving', () => {
    const h = harness();
    const a = watching(h.dataset, 'a');
    const release = h.dataset.keepAlive({ id: 'a' });

    h.frame('a', 5);
    a.stop();

    expect(h.dataset.peek({ id: 'a' })).toEqual({ value: 5, tag: 'frame' });

    release();
    expect(h.dataset.peek({ id: 'a' })).toBe(INITIAL);
  });

  it('releases once however often it is called', () => {
    const h = harness();
    const release = h.dataset.keepAlive({ id: 'a' });
    const second = h.dataset.keepAlive({ id: 'a' });

    release();
    release();

    // 第二个保活还没释放，所以条目继续站着。
    h.dataset.refresh({ id: 'a' }).subscribe();
    h.answer({ value: 100, tag: 'loaded' });
    expect(h.dataset.peek({ id: 'a' })).toEqual({ value: 100, tag: 'loaded' });

    second();
    expect(h.dataset.peek({ id: 'a' })).toBe(INITIAL);
  });
});

describe('PerpsDataset peek', () => {
  it('reads the initial state for a key nothing holds', () => {
    const h = harness();

    expect(h.dataset.peek({ id: 'nobody' })).toBe(INITIAL);
    // 读取不能创建出一个条目。
    expect(h.subscribed('nobody')).toBe(false);
  });

  it('reads the current state without subscribing', () => {
    const h = harness();
    watching(h.dataset, 'a');

    h.frame('a', 5);

    expect(h.dataset.peek({ id: 'a' })).toEqual({ value: 5, tag: 'frame' });
  });
});

describe('PerpsDataset load contract', () => {
  it('passes the current state to the load', () => {
    const seen: TestState[] = [];
    const h = harness({
      load: (_key, current) => {
        seen.push(current);
        return of({ value: current.value + 1, tag: 'loaded' });
      },
    });
    watching(h.dataset, 'a');
    h.frame('a', 5);

    h.dataset.refresh({ id: 'a' }).subscribe();

    expect(seen).toEqual([{ value: 5, tag: 'frame' }]);
  });

  it('surfaces an error the load contract says must not happen', () => {
    const h = harness({ load: () => throwError(() => new Error('boom')) });
    let caught: any = null;

    h.dataset
      .refresh({ id: 'a' })
      .subscribe({ error: (error) => (caught = error) });

    expect(caught?.message).toBe('boom');
  });
});
