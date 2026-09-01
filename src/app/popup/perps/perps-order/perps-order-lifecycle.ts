import { PerpsReviewBaseline } from './perps-order-composition';

/**
 * 对于一笔读不到结果的订单，页面会有多努力去查清它的下落。
 *
 * 只要交易场所有答案，一个 cloid 一两秒内就能查到，所以短促的固定节奏能很快找到它；更要紧
 * 的是这些尝试要有个头。无限重试会让提交闸门在一笔交易场所可能永远不会上报的订单上被永久
 * 关着，而用户唯一的脱身办法是离开页面 —— 那样 cloid 就彻底丢了。
 */
const ORDER_RESOLUTION_ATTEMPTS = 4;
const ORDER_RESOLUTION_INTERVAL_MS = 1500;

/** 交易场所对一次 cloid 查询的回答；本模块只关心它是不是「有这笔单」。 */
export interface PerpsOrderStatusAnswer {
  status?: string;
}

/**
 * 这个模块自己够不着的两件事。
 *
 * 两个都恰好有两个实现 —— 生产一个、测试一个 —— 所以它们是真接缝，而不是绕个弯的间接层。
 * 都不经过 RxJS：这里只有一次取数和一个定时行为，配不上把整个 RxJS 拖进它的依赖里。
 */
export interface PerpsOrderLifecyclePorts {
  /** 排一个延时任务，返回取消它的办法。生产是 `setTimeout`，测试是手动推进的假件。 */
  schedule(run: () => void, ms: number): () => void;
  /** 按 cloid 问交易场所要这笔单的下落。地址在页面装配时就绑掉了。 */
  queryOrderStatus(cloid: string): Promise<PerpsOrderStatusAnswer | null>;
}

/**
 * 页面在一次提交上走到哪一步了。
 *
 * 过去这是五个各自独立的布尔加两个可空字段，其中 `reviewBaseline` 非空恒等于 `reviewing`、
 * `pendingCloid` 非空恒等于 `orderResolutionPending` —— 一个含义拆成两个字段，就有了两处
 * 可以各自说谎的地方。写成一个联合之后，那些非法组合从类型上就不存在了。
 */
export type PerpsOrderLifecycleState =
  | { kind: 'composing' }
  | { kind: 'reviewing'; baseline: PerpsReviewBaseline }
  | { kind: 'submitting'; baseline: PerpsReviewBaseline }
  | {
      kind: 'unknown';
      cloid: string;
      /** 有一次查询在途；此时「再查一次」只会再叠一个。 */
      resolving: boolean;
      attemptsLeft: number;
    };

/**
 * 一次下单提交从审核走到结局的那条路。
 *
 * 这是整个下单页里唯一持有状态的模块，它持有的正是页面过去散在 350 行、9 个方法和 11 个
 * `discardReview()` 调用点上的那些字段 —— 也就是决定「一个仓位会不会变成两个」的那些。
 *
 * 它**不是** ADR-0003 / ADR-0006 所禁止的那种东西：不持久化交易意图，不自动重签，不跨窗口
 * 仲裁，进程一结束就没了。它是一个进程内的提交闸门，把页面本来就有的那台状态机变成可寻址、
 * 因而可测的东西。
 *
 * 它也不认识 `PerpsOrderFacts` / `PerpsOrderInput` / 私钥 / 账户状态 —— 「这还是用户批准的那笔
 * 单吗」由页面用编排模块判定后，以一个布尔传进 {@link beginSubmit}。
 */
export class PerpsOrderLifecycle {
  private state: PerpsOrderLifecycleState = { kind: 'composing' };
  private cancelScheduled: (() => void) | null = null;
  private disposed = false;

  constructor(
    private ports: PerpsOrderLifecyclePorts,
    /**
     * 每次状态转移之后调用，带上转移前后的状态。
     *
     * 它不是 port —— 没有第二个实现，也不需要测试替身。页面用它决定什么时候刷新账户、
     * 什么时候说一句话：由「从哪来、到哪去」决定，而不是由本模块替页面决定。
     */
    private onChange: (
      from: PerpsOrderLifecycleState,
      to: PerpsOrderLifecycleState
    ) => void = () => {}
  ) {}

  //#region 读数 —— 模板绑的就是这几个，一行不用改
  get reviewing(): boolean {
    return this.state.kind === 'reviewing';
  }

  get submitting(): boolean {
    return this.state.kind === 'submitting';
  }

  /**
   * 订单已经签名并发出，而页面始终没弄清它的下落。这不是失败 —— 它可能已经成交 —— 所以
   * 页面就照实这么说，并提供再看一眼的入口，而不是道歉或重试。
   */
  get executionStatusUnknown(): boolean {
    return this.state.kind === 'unknown' && !this.state.resolving;
  }

  get resolvingOrderStatus(): boolean {
    return this.state.kind === 'unknown' && this.state.resolving;
  }

  /** 用户审核时确认过的那份意图；不在审核或提交中时为 null。 */
  get baseline(): PerpsReviewBaseline | null {
    return this.state.kind === 'reviewing' || this.state.kind === 'submitting'
      ? this.state.baseline
      : null;
  }

  /**
   * 页面这一侧允不允许提交。
   *
   * 它只回答页面的事 —— 一次已经在途的提交不是订单的属性，一笔下落仍然未知的早前订单也
   * 不是。订单自己那一半由编排模块的 `submittable` 回答，页面把两者相与。
   */
  get gateOpen(): boolean {
    return this.state.kind === 'composing' || this.state.kind === 'reviewing';
  }

  get current(): PerpsOrderLifecycleState {
    return this.state;
  }
  //#endregion

  //#region 转移
  /** 用户批准了屏幕上这笔意图。 */
  review(baseline: PerpsReviewBaseline) {
    if (this.state.kind !== 'composing') {
      return;
    }
    this.moveTo({ kind: 'reviewing', baseline });
  }

  /**
   * 意图变了，这次审核作废。
   *
   * 过去散在 11 个调用点上的 `discardReview()` 收成这一个。基线存在的意义是回答「这还是
   * 当初批准的那个吗」，所以一次编辑让它作废，而不是拿它去比对 —— 用户会被送回去，重新
   * 审核他刚刚改动的东西。
   *
   * 只在审核态下有效。用户在一笔下落未明的订单期间改动表单，跟那笔订单没有关系：过去
   * `discardReview()` 会把 `pendingCloid` 一起清掉，于是「再查一次」按钮变成哑的，而闸门
   * 仍然关着 —— 用户被永久卡在一个没有出路的按钮上。
   */
  edited() {
    if (this.state.kind !== 'reviewing') {
      return;
    }
    this.moveTo({ kind: 'composing' });
  }

  /**
   * 用户按下了提交。
   *
   * `approved` 是页面用编排模块判出的「这还是他批准的那笔单吗」—— 意图未被改动，且行情
   * 仍在他同意的窗口之内。不成立就退回编辑态，让他重新审核已经变过的东西。
   *
   * 返回是否真的进入了提交中。
   */
  beginSubmit(approved: boolean): boolean {
    if (this.state.kind !== 'reviewing') {
      return false;
    }
    if (!approved) {
      this.moveTo({ kind: 'composing' });
      return false;
    }
    this.moveTo({ kind: 'submitting', baseline: this.state.baseline });
    return true;
  }

  /**
   * 这次提交有了确定的结局 —— 成交、被拒，或者根本没发出去（比如杠杆写入被拒）。
   *
   * 三者对本模块是同一件事：闸门重新打开。它们对用户不是同一件事，但那是措辞，归页面。
   */
  settled() {
    if (this.state.kind !== 'submitting') {
      return;
    }
    this.moveTo({ kind: 'composing' });
  }

  /**
   * 订单已经签名发出，但客户端还没取得可判定的结果。这不等于失败。
   *
   * 按 ADR-0006，恢复只是按 cloid 查询加一次账户刷新：不持久化意图，不重新签名，也没有
   * 会失步的本地订单状态机。
   */
  unresolved(cloid: string) {
    if (this.state.kind !== 'submitting') {
      return;
    }
    this.beginResolution(cloid);
  }

  /** 「再查一次」—— 页面用完自己的尝试次数之后出现的那个按钮。 */
  retryResolution() {
    if (this.state.kind !== 'unknown' || this.state.resolving) {
      return;
    }
    this.beginResolution(this.state.cloid);
  }

  /** 页面走了。取消在途的定时任务，并让已经发出的查询不再回写。 */
  dispose() {
    this.disposed = true;
    this.cancelPending();
  }
  //#endregion

  private beginResolution(cloid: string) {
    this.moveTo({
      kind: 'unknown',
      cloid,
      resolving: true,
      attemptsLeft: ORDER_RESOLUTION_ATTEMPTS,
    });
    this.scheduleQuery();
  }

  private scheduleQuery() {
    const pending = this.state;
    if (pending.kind !== 'unknown' || this.disposed) {
      return;
    }
    this.cancelPending();
    this.cancelScheduled = this.ports.schedule(() => {
      this.cancelScheduled = null;
      this.ports.queryOrderStatus(pending.cloid).then(
        (answer) => this.receive(answer),
        () => this.receive(null)
      );
    }, ORDER_RESOLUTION_INTERVAL_MS);
  }

  private receive(answer: PerpsOrderStatusAnswer | null) {
    if (this.disposed || this.state.kind !== 'unknown') {
      return;
    }
    if (answer?.status === 'order') {
      this.moveTo({ kind: 'composing' });
      return;
    }
    // 其他任何答复都意味着交易场所暂时还没有可上报的内容，
    // 而这与「什么都没发生」不是一回事。
    const attemptsLeft = this.state.attemptsLeft - 1;
    if (attemptsLeft > 0) {
      this.state = { ...this.state, attemptsLeft };
      this.scheduleQuery();
      return;
    }
    // 尝试次数用尽。闸门仍然关着 —— 第二笔订单正是一个仓位变成两个的方式 —— 但页面现在
    // 会把这件事说出来，并给出一条出路，而不是干坐在一个永久禁用的按钮上。
    this.moveTo({ ...this.state, resolving: false });
  }

  private cancelPending() {
    this.cancelScheduled?.();
    this.cancelScheduled = null;
  }

  private moveTo(next: PerpsOrderLifecycleState) {
    const from = this.state;
    this.state = next;
    this.onChange(from, next);
  }
}
