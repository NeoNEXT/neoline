import {
  PerpsOrderLifecycle,
  PerpsOrderLifecycleState,
  PerpsOrderStatusAnswer,
} from './perps-order-lifecycle';
import { PerpsReviewBaseline } from './perps-order-composition';

/**
 * 一个手动推进的时钟。
 *
 * 这台状态机的主要行为就是「等一会儿再问一次，问四次为止」，所以时钟必须是可推进的 ——
 * 这也正是它当初被注入而不是直接调 `setTimeout` 的理由：那 4 次尝试的预算，只有把时间
 * 攥在手里才测得完。
 */
class FakeClock {
  private tasks: Array<{ run: () => void; cancelled: boolean }> = [];

  schedule = (run: () => void, _ms: number) => {
    const task = { run, cancelled: false };
    this.tasks.push(task);
    return () => {
      task.cancelled = true;
    };
  };

  get pending(): number {
    return this.tasks.filter((task) => !task.cancelled).length;
  }

  /** 跑掉当前排着的那一个，并把它引发的 promise 全部排干。 */
  async fire(): Promise<void> {
    const task = this.tasks.find((item) => !item.cancelled);
    if (task) {
      task.cancelled = true;
      task.run();
    }
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
}

const baseline = (): PerpsReviewBaseline => ({
  priceExact: '2000',
  amount: '100',
  limitPrice: '',
  side: 'long',
  orderType: 'market',
  leverage: 10,
  slippagePercent: 3,
  mode: 'open',
});

const CLOID = '0x00000000000000000000000000000001';

interface Harness {
  lifecycle: PerpsOrderLifecycle;
  clock: FakeClock;
  answers: Array<PerpsOrderStatusAnswer | null>;
  asked: string[];
  changes: Array<[string, string]>;
}

/** `answers` 按顺序消费；用完之后一律答「还没有可上报的内容」。 */
function harness(answers: Array<PerpsOrderStatusAnswer | null> = []): Harness {
  const clock = new FakeClock();
  const asked: string[] = [];
  const changes: Array<[string, string]> = [];
  const queue = [...answers];
  const lifecycle = new PerpsOrderLifecycle(
    {
      schedule: clock.schedule,
      queryOrderStatus: (cloid) => {
        asked.push(cloid);
        return Promise.resolve(queue.length ? queue.shift() : null);
      },
    },
    (from: PerpsOrderLifecycleState, to: PerpsOrderLifecycleState) =>
      changes.push([from.kind, to.kind])
  );
  return { lifecycle, clock, answers: queue, asked, changes };
}

/** 走到「已提交、结果未知、正在按 cloid 查」那一步。 */
function resolving(answers: Array<PerpsOrderStatusAnswer | null> = []): Harness {
  const h = harness(answers);
  h.lifecycle.review(baseline());
  h.lifecycle.beginSubmit(true);
  h.lifecycle.unresolved(CLOID);
  return h;
}

describe('PerpsOrderLifecycle 审核', () => {
  it('starts open, with nothing approved', () => {
    const { lifecycle } = harness();

    expect(lifecycle.gateOpen).toBeTrue();
    expect(lifecycle.reviewing).toBeFalse();
    expect(lifecycle.baseline).toBeNull();
  });

  it('holds the baseline the user approved', () => {
    const { lifecycle } = harness();

    lifecycle.review(baseline());

    expect(lifecycle.reviewing).toBeTrue();
    expect(lifecycle.baseline.amount).toBe('100');
    // 闸门仍开着：审核态下用户还能按提交。
    expect(lifecycle.gateOpen).toBeTrue();
  });

  it('drops the baseline the moment the intent is edited', () => {
    const { lifecycle } = harness();
    lifecycle.review(baseline());

    lifecycle.edited();

    expect(lifecycle.reviewing).toBeFalse();
    expect(lifecycle.baseline).toBeNull();
  });

  it('refuses to review while a submission is in flight', () => {
    const { lifecycle } = harness();
    lifecycle.review(baseline());
    lifecycle.beginSubmit(true);

    lifecycle.review({ ...baseline(), amount: '999' });

    // 还是当初提交的那一份，不是后来这一份。
    expect(lifecycle.baseline.amount).toBe('100');
  });
});

describe('PerpsOrderLifecycle 提交', () => {
  it('closes the gate once a submission starts', () => {
    const { lifecycle } = harness();
    lifecycle.review(baseline());

    expect(lifecycle.beginSubmit(true)).toBeTrue();

    expect(lifecycle.submitting).toBeTrue();
    // 第二次按下正是一个仓位变成两个的方式。
    expect(lifecycle.gateOpen).toBeFalse();
  });

  it('sends the user back to compose when the order is no longer the approved one', () => {
    const { lifecycle } = harness();
    lifecycle.review(baseline());

    expect(lifecycle.beginSubmit(false)).toBeFalse();

    expect(lifecycle.submitting).toBeFalse();
    expect(lifecycle.reviewing).toBeFalse();
    expect(lifecycle.gateOpen).toBeTrue();
  });

  it('reopens the gate on any settled outcome', () => {
    const { lifecycle } = harness();
    lifecycle.review(baseline());
    lifecycle.beginSubmit(true);

    lifecycle.settled();

    expect(lifecycle.gateOpen).toBeTrue();
    expect(lifecycle.baseline).toBeNull();
  });

  it('cannot begin a submission that was never reviewed', () => {
    const { lifecycle } = harness();

    expect(lifecycle.beginSubmit(true)).toBeFalse();
    expect(lifecycle.submitting).toBeFalse();
  });
});

describe('PerpsOrderLifecycle 下落未明', () => {
  it('keeps the gate shut while it asks the exchange', () => {
    const { lifecycle } = resolving();

    expect(lifecycle.resolvingOrderStatus).toBeTrue();
    // 还在查的时候不说「未知」—— 页面上那条出路要等尝试用尽才出现。
    expect(lifecycle.executionStatusUnknown).toBeFalse();
    expect(lifecycle.gateOpen).toBeFalse();
  });

  it('reopens the gate when the exchange finally reports the order', async () => {
    const h = resolving([{ status: 'order' }]);

    await h.clock.fire();

    expect(h.lifecycle.gateOpen).toBeTrue();
    expect(h.lifecycle.executionStatusUnknown).toBeFalse();
    expect(h.asked).toEqual([CLOID]);
    // 页面靠这一跳决定说哪句话、刷不刷账户。
    expect(h.changes).toContain(['unknown', 'composing']);
  });

  it('spends exactly four attempts before giving the user a way out', async () => {
    const h = resolving();

    for (let i = 0; i < 4; i++) {
      await h.clock.fire();
    }

    expect(h.asked.length).toBe(4);
    expect(h.lifecycle.resolvingOrderStatus).toBeFalse();
    expect(h.lifecycle.executionStatusUnknown).toBeTrue();
    // 说出来了，但闸门仍然关着：这不是失败，订单可能已经成交。
    expect(h.lifecycle.gateOpen).toBeFalse();
    expect(h.clock.pending).toBe(0);
  });

  it('counts a failed query as an attempt rather than an answer', async () => {
    const clock = new FakeClock();
    let asked = 0;
    const lifecycle = new PerpsOrderLifecycle({
      schedule: clock.schedule,
      queryOrderStatus: () => {
        asked++;
        return Promise.reject(new Error('offline'));
      },
    });
    lifecycle.review(baseline());
    lifecycle.beginSubmit(true);
    lifecycle.unresolved(CLOID);

    for (let i = 0; i < 4; i++) {
      await clock.fire();
    }

    expect(asked).toBe(4);
    expect(lifecycle.executionStatusUnknown).toBeTrue();
  });

  it('lets the user ask again once the attempts are spent', async () => {
    const h = resolving();
    for (let i = 0; i < 4; i++) {
      await h.clock.fire();
    }

    h.lifecycle.retryResolution();

    expect(h.lifecycle.resolvingOrderStatus).toBeTrue();
    expect(h.clock.pending).toBe(1);
  });

  it('ignores a second ask while one is already in flight', () => {
    const h = resolving();

    h.lifecycle.retryResolution();

    // 再叠一个查询只会让同一个 cloid 被问两遍。
    expect(h.clock.pending).toBe(1);
  });

  /**
   * 用户在一笔下落未明的订单期间改动表单，跟那笔订单没有关系。
   *
   * 过去 `discardReview()` 会把 `pendingCloid` 一起清掉，于是「再查一次」变成哑的，
   * 而闸门仍然关着 —— 用户被永久卡在一个没有出路的按钮上。
   */
  it('keeps the outstanding order when the user edits the form', async () => {
    const h = resolving();
    for (let i = 0; i < 4; i++) {
      await h.clock.fire();
    }

    h.lifecycle.edited();

    expect(h.lifecycle.executionStatusUnknown).toBeTrue();
    h.lifecycle.retryResolution();
    expect(h.lifecycle.resolvingOrderStatus).toBeTrue();
  });
});

describe('PerpsOrderLifecycle 销毁', () => {
  it('cancels the scheduled query', () => {
    const h = resolving();

    h.lifecycle.dispose();

    expect(h.clock.pending).toBe(0);
  });

  it('does not write back after an answer arrives late', async () => {
    let settle: (answer: PerpsOrderStatusAnswer) => void;
    const clock = new FakeClock();
    const changes: string[] = [];
    const lifecycle = new PerpsOrderLifecycle(
      {
        schedule: clock.schedule,
        queryOrderStatus: () =>
          new Promise<PerpsOrderStatusAnswer>((resolve) => (settle = resolve)),
      },
      (_from, to) => changes.push(to.kind)
    );
    lifecycle.review(baseline());
    lifecycle.beginSubmit(true);
    lifecycle.unresolved(CLOID);
    await clock.fire();
    const before = changes.length;

    lifecycle.dispose();
    settle({ status: 'order' });
    await new Promise((resolve) => setTimeout(resolve, 0));

    // 页面已经走了；一次迟到的答复不该再去动一个没人读的状态。
    expect(changes.length).toBe(before);
  });
});
