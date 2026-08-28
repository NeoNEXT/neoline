import { Component, OnDestroy, OnInit } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { Store } from '@ngrx/store';
import { firstValueFrom, Observable, Unsubscribable } from 'rxjs';
import BigNumber from 'bignumber.js';

import { AppState } from '@/app/reduers';
import {
  ChromeService,
  EvmWalletService,
  GlobalService,
} from '@/app/core';
import {
  HyperliquidService,
} from '@/app/core/services/perps/hyperliquid.service';
import { PerpsExchangeWriteService, PerpsExecutionStatusUnknownError } from '@app/core/services/perps/perps-exchange-write.service';
import { PerpsDataChannel } from '@app/core/services/perps/perps-data-channel.service';
import { PerpsAccountStateService } from '@/app/core/services/perps/perps-account-state.service';
import {
  coversExact,
  PerpsDepositAuthorization,
  PerpsDepositChainService,
} from '@/app/core/services/perps/perps-deposit-chain.service';
import {
  PerpsFeeQuote,
  PerpsFeeQuoteService,
} from '@/app/core/services/perps/perps-fee-quote.service';
import { PerpsPendingDepositsService } from '@/app/core/services/perps/perps-pending-deposits.service';
import { EvmWalletJSON } from '@popup/_lib/evm';
import {
  PerpsAccount,
  PerpsConnectionState,
  PerpsDepositConfig,
  PERPS_MIN_DEPOSIT,
  PerpsPendingDeposit,
  PERPS_DEPOSIT_RECEIPT_TIMEOUT_MS,
  PERPS_PENDING_DEPOSIT_POLL_MS,
  PERPS_WALLET_BALANCE_POLL_MS,
} from '@popup/_lib/perps';
import { clampDecimals, formatBalance, formatUsd } from '../perps.util';

type FundingTab = 'deposit' | 'withdraw';

/**
 * 永续账户的入金 / 出金合并页面。
 *
 * 入金是一次 Arbitrum USDC 的 CCTP 销毁，入账到 HyperCore 永续账户；提现是一次已签名的
 * 交易场所操作，由 CCTP 投递到同一个地址。两条写入路径都随交易里程碑一起落地。
 */
@Component({
  templateUrl: 'perps-funding.component.html',
  styleUrls: ['perps-funding.component.scss'],
})
export class PerpsFundingComponent implements OnInit, OnDestroy {
  tab: FundingTab = 'deposit';
  /** 以人类单位表示的十进制文本。签名之前它绝不能经过 Number。 */
  amount: string = null;
  activePreset: number = null;

  account: PerpsAccount;
  /**
   * 入金侧的源代币余额，以链上报的精确十进制形式保存。`null` 表示未知 —— 这与零不是同一个
   * 事实，绝不能被渲染成零。
   */
  walletBalanceExact: string = null;
  submitting = false;
  accountLoadError = false;
  accountLoading = true;
  /** 账户数据源是否仍在投递，用于「非实时」标记。 */
  connectionState: PerpsConnectionState = 'connecting';
  /** 提交前的刷新没能完成，因此什么都没有签名。 */
  refreshFailed = false;
  /** 提交前的刷新把上限压到了用户已输入的金额之下。 */
  balanceMovedUnderInput = false;
  /** 入金链上的原生代币余额 —— 未知时为 `null`。 */
  nativeBalanceExact: string = null;
  /** 这笔入金的网络手续费估算，以链自身货币计。 */
  networkFeeExact: string = null;
  /** 入金确认步骤已打开。 */
  confirming = false;
  /** 仍在计算屏幕上这笔入金会花多少钱。 */
  preparingDeposit = false;
  preparingWithdraw = false;
  /**
   * 确认页当初据以绘制的那份报价。
   *
   * 刻意与实时的 `withdrawQuote` 分开：必须与签名所对应的那个数字相符的，是用户同意过的那个
   * 数字，而不是签名那一刻合约恰好在说的数字。
   */
  withdrawConfirmedQuote: PerpsFeeQuote | null = null;
  /**
   * 这笔入金将据以发送的那份已签名许可，以及展示给用户时所报的手续费。持有的是它而不是私钥
   * —— 私钥会在广播时重新取，而不是跨整个对话框一直留着。
   */
  private depositAuthorization: PerpsDepositAuthorization | null = null;
  depositQuote: PerpsFeeQuote | null = null;
  /** 已经离开钱包、但还不能动用的入金。 */
  pending: PerpsPendingDeposit[] = [];

  readonly minDeposit = PERPS_MIN_DEPOSIT;
  /**
   * 提现通道声称它会扣走多少，每次都重新读取而不是当作常量保存：转发费存放在一个 owner 可以
   * 修改的合约里。为 null 表示读不到，此时会挡下这笔提现，而不是退回到一个可能是错的数字。
   */
  withdrawQuote: PerpsFeeQuote | null = null;
  /**
   * 界面正在等待哪一次在途的提现报价。
   *
   * 每次读取都自增，这样上一次进入该标签页时较慢的答复就不会覆盖较新的那个。下限和按钮都
   * 依赖这份报价；显示错的那一份，比什么都不显示更糟。
   */
  private withdrawQuoteSeq = 0;
  /**
   * 用百分比而不是固定金额：在一个余额可能为零或未知的界面上，$50 按钮是一个只能以报错收场
   * 的提议。
   */
  readonly presetPercents = [25, 50];

  formatUsd = formatUsd;
  formatBalance = formatBalance;

  private address: string;
  private wallet: EvmWalletJSON;
  /** 当前账户/余额数据是按哪套配置加载出来的。 */
  private loadedConfig: PerpsDepositConfig;
  private accountSub: Unsubscribable;
  private connectionSub: Unsubscribable;
  private accountStateSub: Unsubscribable;
  private balanceTimer: ReturnType<typeof setInterval>;
  private pendingTimer: ReturnType<typeof setInterval>;

  constructor(
    private route: ActivatedRoute,
    private store: Store<AppState>,
    private global: GlobalService,
    private hyperliquid: HyperliquidService,
    private accountStates: PerpsAccountStateService,
    private chrome: ChromeService,
    private evmWallet: EvmWalletService,
    private depositChain: PerpsDepositChainService,
    private feeQuote: PerpsFeeQuoteService,
    private pendingDeposits: PerpsPendingDepositsService,
    private channel: PerpsDataChannel,
    private writes: PerpsExchangeWriteService
  ) {}

  ngOnInit() {
    const tab = this.route.snapshot.queryParams.tab;
    if (tab === 'withdraw') {
      this.tab = 'withdraw';
      void this.loadWithdrawQuote();
    }
    this.connectionSub = this.channel
      .watchConnectionState()
      .subscribe((state) => {
        this.connectionState = state;
      });
    this.accountSub = this.store.select('account').subscribe((state) => {
      const address = state.currentWallet?.accounts[0]?.address;
      this.wallet = state.currentWallet as EvmWalletJSON;
      if (
        address &&
        (address !== this.address || this.token !== this.loadedConfig)
      ) {
        this.address = address;
        this.loadedConfig = this.token;
        this.watchAccountState(address);
        this.startBalancePolling(address);
        this.startPendingTracking(address);
      }
    });
  }

  /** 通过账户的领域接缝来消费标准账户状态。 */
  private watchAccountState(address: string) {
    this.accountStateSub?.unsubscribe();
    this.accountLoadError = false;
    this.accountLoading = true;
    this.accountStateSub = this.accountStates
      .watchAccount(address)
      .subscribe((state) => {
        if (address !== this.address) {
          return;
        }
        this.account = state.account ?? undefined;
        this.accountLoading = state.availability === 'loading';
        this.accountLoadError = state.availability === 'unavailable';
      });
  }

  /** 源链在这里没有数据源，所以它的余额改用轮询。 */
  private startBalancePolling(address: string) {
    clearInterval(this.balanceTimer);
    this.loadWalletBalance(address);
    this.balanceTimer = setInterval(() => {
      if (this.address === address && !this.submitting) {
        this.loadWalletBalance(address);
      }
    }, PERPS_WALLET_BALANCE_POLL_MS);
  }

  /** 所配置的 Perps 网络对应的入金链/代币。 */
  get token(): PerpsDepositConfig {
    return this.hyperliquid.depositConfig;
  }

  /**
   * 入金的资金来自入金链，所以两个要紧的余额 —— 被发送的代币，以及付 gas 的那种货币 ——
   * 都从那条链上读，而不是从用户当前选中的网络上读。
   */
  private async loadWalletBalance(address: string) {
    const config = this.token;
    const superseded = () => config !== this.token || address !== this.address;
    try {
      const balance = await this.depositChain.tokenBalanceExact(
        config,
        address
      );
      if (superseded()) {
        return;
      }
      this.walletBalanceExact = balance;
    } catch (e) {
      // 读取失败不等于余额为零。让它保持未知，界面才诚实，MAX 也不会拿出
      // 我们其实看不见的钱。
      if (!superseded()) {
        this.walletBalanceExact = null;
      }
    }
    try {
      const native = await this.depositChain.nativeBalanceExact(
        config,
        address
      );
      if (!superseded()) {
        this.nativeBalanceExact = native;
      }
    } catch (e) {
      if (!superseded()) {
        this.nativeBalanceExact = null;
      }
    }
  }

  /**
   * 一次性算清屏幕上这笔入金实际要花多少钱。
   *
   * 这里的每一项都需要用户最终确定的金额：CCTP 手续费是按次报价的，而 gas 在授权存在之前
   * 根本估不出来 —— 没有有效授权，这次调用会 revert。这也是它在确认页打开时才运行、而不是
   * 每次按键都跑的原因，同样是私钥在这里取用、用完即弃、而不是在整个对话框生命周期内一直
   * 留着的原因。
   */
  private async prepareDeposit() {
    const config = this.token;
    const amount = this.submissionAmount;
    const address = this.address;
    const superseded = () =>
      config !== this.token || address !== this.address || !this.confirming;

    this.preparingDeposit = true;
    this.networkFeeExact = null;
    this.depositAuthorization = null;
    this.depositQuote = null;
    try {
      const quote = await this.feeQuote.depositQuote(amount, address);
      const password = await this.chrome.getPassword();
      const privateKey = await this.evmWallet.getPrivateKey(
        this.wallet,
        password
      );
      const authorization = await this.depositChain.authorizeDeposit(
        config,
        privateKey,
        amount
      );
      const fee = await this.depositChain.depositFeeExact(
        config,
        authorization,
        quote.maxFeeExact
      );
      if (superseded()) {
        return;
      }
      this.depositQuote = quote;
      this.depositAuthorization = authorization;
      this.networkFeeExact = fee;
      if (this.gasShortfall) {
        // 手续费是表单必须显示的那条原因；这份授权不会被用到，
        // 也不该活得比一个用户从未确认过的确认面板更久。
        this.depositAuthorization = null;
        this.depositQuote = null;
        this.confirming = false;
      }
    } catch (error) {
      if (!superseded()) {
        this.confirming = false;
        this.global.snackBarTip('txFailed', (error as Error)?.message || error);
      }
    } finally {
      this.preparingDeposit = false;
    }
  }

  /**
   * 入金链自身的货币不够付这笔手续费。
   *
   * 它值得拥有自己的状态而不是归入一个笼统的失败：用户手上有他们正想入金的 USDC，却完全
   * 不知道自己还需要一条他们没选过的链上的 gas。
   */
  get gasShortfall(): boolean {
    return (
      this.isDeposit &&
      this.networkFeeExact !== null &&
      this.nativeBalanceExact !== null &&
      !coversExact(this.nativeBalanceExact, this.networkFeeExact)
    );
  }

  ngOnDestroy() {
    this.accountSub?.unsubscribe();
    this.connectionSub?.unsubscribe();
    this.accountStateSub?.unsubscribe();
    clearInterval(this.balanceTimer);
    clearInterval(this.pendingTimer);
    this.discardDepositPreparation();
  }

  /**
   * 接上仍在途中的入金，包括在更早一次弹窗会话里发起的那些。已经离开钱包的钱，绝不能仅仅
   * 因为窗口在入账途中被关掉就变得无影无踪。
   */
  private async startPendingTracking(address: string) {
    clearInterval(this.pendingTimer);
    await this.reloadPending(address);
    this.pendingTimer = setInterval(
      () => this.pollPending(address),
      PERPS_PENDING_DEPOSIT_POLL_MS
    );
  }

  private async reloadPending(address: string) {
    const list = await this.pendingDeposits.listFor(
      address,
      this.token.chainId
    );
    if (address === this.address) {
      this.pending = list;
    }
  }

  private async pollPending(address: string) {
    if (address !== this.address || !this.pending.length) {
      return;
    }
    const config = this.token;
    for (const deposit of [...this.pending]) {
      if (this.pendingDeposits.isCredited(deposit, this.withdrawableExact)) {
        await this.pendingDeposits.remove(deposit.hash);
        continue;
      }
      if (!deposit.chainConfirmed && !deposit.reverted) {
        const outcome = await this.depositChain.depositOutcome(
          config,
          deposit.hash,
          PERPS_PENDING_DEPOSIT_POLL_MS
        );
        if (outcome === 'confirmed') {
          await this.pendingDeposits.update(deposit.hash, {
            chainConfirmed: true,
          });
        } else if (outcome === 'reverted') {
          // 停止跟踪：销毁根本没有发生，所以等待入账，
          // 等的是一件早已被判定不会发生的事。
          await this.pendingDeposits.update(deposit.hash, { reverted: true });
        }
      }
    }
    await this.reloadPending(address);
  }

  /** 已经跟踪得够久了；转账在链上，但尚未入账。 */
  isStalled(deposit: PerpsPendingDeposit): boolean {
    return this.pendingDeposits.isStalled(deposit);
  }

  /** 删掉一条用户已知悉的记录；交易本身不受影响。 */
  async dismissPending(deposit: PerpsPendingDeposit) {
    await this.pendingDeposits.remove(deposit.hash);
    await this.reloadPending(this.address);
  }

  /**
   * 这个账户实际能提出多少 —— 在两种账户形态下它并不是同一个字段。
   *
   * 标准账户就取永续侧的 `withdrawable`。统一账户把 USDC 放在现货清算所里，交易场所把它的
   * 永续数字标记为「无意义」—— 无论账户有多少资金，那里的 `withdrawable` 都是 0 —— 所以读
   * 那个字段会把一个有资金的账户显示成 $0，并拒绝它本来做得到的每一笔提现。要减去它的 hold，
   * 理由和标准账户要减去保证金一样：被占用的抵押品不可提取。
   */
  get withdrawableExact(): string {
    const account = this.account;
    if (!account) {
      return null;
    }
    if (!account.unified) {
      return account.withdrawableExact ?? null;
    }
    const free = new BigNumber(account.spotUsdcExact ?? 0).minus(
      account.spotUsdcHoldExact ?? 0
    );
    if (!free.isFinite()) {
      return null;
    }
    return BigNumber.maximum(free, 0).toFixed();
  }

  /** 屏幕上的数字是最后已知值，而不是实时值。 */
  get feedStale(): boolean {
    return this.connectionState === 'stale';
  }

  get isDeposit(): boolean {
    return this.tab === 'deposit';
  }

  get isWithdraw(): boolean {
    return this.tab === 'withdraw';
  }

  /**
   * 组合保证金是一种本产品无法正确呈现其抵押品与风险的账户形态，所以它不能再往里进钱。往外
   * 取钱是另一回事：拒绝那个，会把资金困在一个唯一过错只是「我们看不懂它」的账户里。
   */
  get unsupportedAccountMode(): boolean {
    return this.isDeposit && this.account?.abstractionMode === 'portfolioMargin';
  }

  /** 供 MAX 和余额校验使用的精确源余额。 */
  private get maxAmountExact(): string {
    const source = this.isDeposit
      ? this.walletBalanceExact
      : this.withdrawableExact;
    return source ?? null;
  }

  /** 当前标签页的源余额究竟是否已知。 */
  get maxAmountKnown(): boolean {
    const source = this.maxAmountExact;
    return source !== null && new BigNumber(source).isFinite();
  }

  /**
   * 到达目的地的金额，以精确十进制表示。提现手续费是从金额里扣的而不是外加的，所以这才是
   * 用户实际收到的数额 —— 在交易场所账本记下它真正收取的手续费之前，它是一个估算。
   */
  get withdrawReceiveExact(): string | null {
    if (!this.hasPositiveAmount) {
      return '0';
    }
    if (!this.withdrawFeeExact) {
      return null;
    }
    const net = new BigNumber(this.amount).minus(this.withdrawFeeExact);
    return net.isGreaterThan(0) ? net.toFixed() : '0';
  }

  /** 报出的手续费；未知时为 null。 */
  get withdrawFeeExact(): string | null {
    return this.withdrawQuote?.feeExact ?? null;
  }

  /** 入金通道会扣走多少 —— 只有在入金准备好之后才知道。 */
  get depositFeeExact(): string | null {
    return this.depositQuote?.feeExact ?? null;
  }

  /**
   * 永续账户将被入账多少，作为估算值。
   *
   * 通道费是从金额里扣的而不是外加的，所以一笔入金入账的金额少于它发出的。报价是上限，
   * 因此这个数是下限：账户只可能被入账得比它更多。
   */
  get depositReceiveExact(): string | null {
    if (!this.hasPositiveAmount || !this.depositFeeExact) {
      return null;
    }
    const net = new BigNumber(this.submissionAmount).minus(this.depositFeeExact);
    return net.isGreaterThan(0) ? net.toFixed() : '0';
  }

  /**
   * 提现的落点：签名者本人在入金链上的地址。
   *
   * 显示出来而不是让用户假定。它永远不会是别的地址 —— 这条通道也没有指定其他收款方的办法
   * —— 而一个省略它的确认页，等于让用户凭信任接受这一点。
   */
  get withdrawRecipient(): string {
    return this.address;
  }

  /** 确认页正在同意的那笔通道费，无论它对应的是哪种意图。 */
  get confirmFeeExact(): string | null {
    return this.isDeposit
      ? this.depositFeeExact
      : this.withdrawConfirmedQuote?.feeExact ?? null;
  }

  /**
   * 该意图估算会到账多少，由同一屏上的手续费推导而来，这样两行绝不可能描述不同的报价。
   */
  get confirmReceiveExact(): string | null {
    if (this.isDeposit) {
      return this.depositReceiveExact;
    }
    const fee = this.confirmFeeExact;
    if (!this.hasPositiveAmount || fee === null) {
      return null;
    }
    const net = new BigNumber(this.submissionAmount).minus(fee);
    return net.isGreaterThan(0) ? net.toFixed() : '0';
  }

  /**
   * 确认页是否已经有一个完整的答案可供确认。
   *
   * 一个还在等报价的界面没有任何东西可供用户同意，所以按钮保持按不下去，而不是对着一片空白
   * 发出去。
   */
  get canConfirm(): boolean {
    if (this.submitting) {
      return false;
    }
    // 「准备」正是确认页存在的意义，而且它能敲定一个在它运行之前界面回答不了的问题：入金的
    // 网络手续费只有在这里才知道，而它决定钱包究竟付不付得起这次发送。`submit` 会一声不吭地
    // 拒绝 `canSubmit` 拒绝的一切，所以确认面板必须问同样的问题，而不是给出一个按了没反应的
    // 按钮。
    if (!this.canSubmit) {
      return false;
    }
    return this.isDeposit
      ? !this.preparingDeposit && !!this.depositQuote
      : !this.preparingWithdraw && !!this.withdrawConfirmedQuote;
  }

  /**
   * 提现取报价的两倍。
   *
   * 一倍报价正是目的链拒绝这笔转账的临界点，而且它是在 HyperCore 已经扣款之后才拒绝的；
   * 第二倍留出的是手续费在报价与转账之间变动的余地。
   */
  get minWithdrawExact(): string | null {
    return this.withdrawQuote
      ? this.feeQuote.minWithdrawExact(this.withdrawQuote)
      : null;
  }

  get minimumAmount(): string | null {
    return this.isDeposit ? String(this.minDeposit) : this.minWithdrawExact;
  }

  get belowMinimum(): boolean {
    if (!this.hasPositiveAmount || this.minimumAmount === null) {
      return false;
    }
    return new BigNumber(this.amount).isLessThan(this.minimumAmount);
  }

  get exceedsBalance(): boolean {
    return (
      this.hasPositiveAmount &&
      this.maxAmountKnown &&
      new BigNumber(this.amount).isGreaterThan(this.maxAmountExact)
    );
  }

  get amountExceedsPrecision(): boolean {
    if (!this.amount) {
      return false;
    }
    const amount = new BigNumber(this.amount);
    return (
      !amount.isFinite() ||
      (amount.decimalPlaces() || 0) > this.amountDecimals
    );
  }

  /**
   * 两个方向共同遵守的精度：代币自己的精度。
   *
   * Hyperliquid 的签名上链格式接受八位小数，但提现是以目的链上的 USDC 交付的，而那边只有
   * 六位。第七位小数是一个交易场所会收下、交付端却付不出去的数字，所以这个输入框在两个方向
   * 上都不提供它。
   */
  get amountDecimals(): number {
    return this.token?.decimals ?? 6;
  }

  private get hasPositiveAmount(): boolean {
    const amount = new BigNumber(this.amount ?? '');
    return amount.isFinite() && amount.isGreaterThan(0);
  }

  /**
   * 被阻断状态的文案用什么来填。
   *
   * `symbol` 跟随的是原因而不是标签页。gas 不足说的是链自身的货币，而这里其他每个数字说的
   * 都是被转移的那个代币；在这条通道上两者从来不是同一个东西，所以按「入金还是提现」来取值，
   * 在两个方向上都会告诉用户错的那一个。
   */
  get disabledReasonParams(): Record<string, unknown> {
    return {
      amount: this.minimumAmount,
      symbol:
        this.disabledReason === 'perpsGasShortfall'
          ? this.token.nativeSymbol
          : this.token.symbol,
      fee: this.withdrawFeeExact,
      decimals: this.amountDecimals,
      chain: this.token.chainName,
    };
  }

  /**
   * 提交控件为什么被禁用，以文案 key 的形式给出 —— 没有被禁用时为空。按「必须先解决哪个」
   * 排序，这样界面绝不会出现一个没有任何解释的死按钮。
   */
  get disabledReason(): string {
    if (this.unsupportedAccountMode) {
      return 'perpsPortfolioMarginNoDeposit';
    }
    if (this.accountLoading) {
      return '';
    }
    if (this.accountLoadError) {
      return 'perpsLoadFailed';
    }
    if (!this.maxAmountKnown) {
      return this.isDeposit ? 'perpsBalanceUnknown' : 'perpsWithdrawableUnknown';
    }
    if (this.isWithdraw && !this.withdrawQuote) {
      return 'perpsFeeQuoteUnknown';
    }
    if (this.refreshFailed) {
      return 'perpsRefreshFailed';
    }
    if (this.balanceMovedUnderInput) {
      return 'perpsBalanceMoved';
    }
    if (!this.hasPositiveAmount) {
      return 'perpsEnterAmount';
    }
    if (this.amountExceedsPrecision) {
      return 'perpsAmountPrecision';
    }
    if (this.exceedsBalance) {
      return 'perpsExceedsBalance';
    }
    if (this.belowMinimum) {
      return this.isDeposit ? 'perpsBelowMinDeposit' : 'perpsBelowMinWithdraw';
    }
    if (this.gasShortfall) {
      return 'perpsGasShortfall';
    }
    return '';
  }

  get canSubmit(): boolean {
    return (
      this.hasPositiveAmount &&
      !!this.account &&
      !this.accountLoading &&
      !this.accountLoadError &&
      !this.submitting &&
      !this.belowMinimum &&
      !this.exceedsBalance &&
      !this.amountExceedsPrecision &&
      !this.unsupportedAccountMode &&
      !this.gasShortfall &&
      this.maxAmountKnown &&
      (this.isDeposit || !!this.withdrawQuote)
    );
  }

  /**
   * 读取一笔提现当前要花多少钱。
   *
   * 「未知」是一个独立的状态：到账金额、金额必须跨过的下限，以及按钮是否可用，全都由这个
   * 数字推导而来，所以读取失败会中止提现，而不是让一个陈旧的数字顶上去。
   */
  private async loadWithdrawQuote() {
    const seq = ++this.withdrawQuoteSeq;
    try {
      const quote = await this.feeQuote.withdrawQuote();
      if (seq !== this.withdrawQuoteSeq || !this.isWithdraw) {
        return;
      }
      this.withdrawQuote = quote;
    } catch (error) {
      // 与成功路径一样加了保护：在用户已经走开之后才失败的读取，
      // 不能把当前标签页正在用的那份报价抹掉。
      if (seq !== this.withdrawQuoteSeq || !this.isWithdraw) {
        return;
      }
      this.withdrawQuote = null;
    }
  }

  /**
   * 表单的重试控件该不该显示。
   *
   * 没有它，余额未知和报价未知都是死胡同：文案写着「重试」，而这是唯一真的能重试的控件。
   */
  get showRetry(): boolean {
    return !this.maxAmountKnown || (this.isWithdraw && !this.withdrawQuote);
  }

  setTab(tab: FundingTab) {
    if (this.tab === tab) {
      return;
    }
    this.tab = tab;
    this.discardDepositPreparation();
    if (tab === 'withdraw') {
      void this.loadWithdrawQuote();
    }
    this.amount = null;
    this.activePreset = null;
    this.confirming = false;
    this.withdrawConfirmedQuote = null;
    this.clearRefreshWarnings();
  }

  setPercent(percent: number) {
    if (!this.maxAmountKnown) {
      return;
    }
    this.activePreset = percent;
    this.amount = this.floorAmount(
      new BigNumber(this.maxAmountExact).times(percent).dividedBy(100)
    );
  }

  setMax() {
    if (!this.maxAmountKnown) {
      return;
    }
    this.activePreset = -1;
    // 交易场所报出的可提余额，其小数位数多于它自己在链上愿意接受的位数，所以一个原封不动的
    // MAX 会落在一个被它自己的精度校验拒绝的值上。向下取整也是唯一安全的方向：向上取整等于
    // 去要并不存在的钱。
    this.amount = this.floorAmount(this.maxAmountExact);
  }

  /** 绝不把 MAX 的值向上舍入到超过可动用的 USDC 余额。 */
  private floorAmount(value: BigNumber.Value): string {
    return new BigNumber(value)
      .decimalPlaces(this.amountDecimals, BigNumber.ROUND_FLOOR)
      .toFixed();
  }

  /** 规范化被签名/被提交的数值，全程不经过 Number 转换。 */
  private get submissionAmount(): string {
    return new BigNumber(this.amount).toFixed();
  }

  /**
   * 把输入框限制在这条通道签名所用的精度上。
   *
   * 两个方向转移的是同一个代币，所以超出它小数位数的数字，不属于这个界面能做的任何一笔转账。
   * 输入框在输入的当下就把它丢掉，与转账页面的金额输入框行为一致；`amountExceedsPrecision`
   * 仍然作为提交时的守卫，因为输入框并不是数值到达 `amount` 的唯一途径。
   */
  onAmountInput(event: Event) {
    const input = event.target as HTMLInputElement;
    const clamped = clampDecimals(input.value, this.amountDecimals);
    if (clamped !== input.value) {
      input.value = clamped;
    }
    this.amount = clamped;
    this.onAmountChange();
  }

  onAmountChange() {
    this.activePreset = null;
    this.clearRefreshWarnings();
  }

  private clearRefreshWarnings() {
    this.refreshFailed = false;
    this.balanceMovedUnderInput = false;
  }

  /**
   * 取一份新的账户快照；入金时再取一份新的源余额。
   *
   * 界面是实时的，但「实时」是数据源的属性，不是对此时此刻的保证。在本次提交内至少成功往返
   * 交易场所一次之前，什么都不会被签名。
   */
  private async refreshBeforeSubmit(): Promise<void> {
    const address = this.address;
    const state = await firstValueFrom(
      this.accountStates.refreshAccount(address)
    );
    if (address !== this.address || !state.account) {
      throw new Error('Account changed during refresh');
    }
    this.account = state.account;
    if (this.isDeposit) {
      await this.loadWalletBalance(address);
      if (this.walletBalanceExact === null) {
        throw new Error('Source balance unavailable');
      }
    }
  }

  /**
   * 两种意图在发出之前都要过一遍确认。
   *
   * 入金是一笔不可逆的、发往用户读不懂的合约地址的转账。提现发往用户自己的地址，这曾被当作
   * 跳过这一步的理由 —— 但地址从来不是有疑问的那一部分。用户要同意的，是一笔从合约里读来的、
   * 而其 owner 可以修改的手续费，以及扣完之后剩下的金额；一个没人被问过的数字，不是任何人
   * 同意过的数字。
   */
  requestSubmit() {
    if (!this.canSubmit) {
      return;
    }
    this.confirming = true;
    if (this.isDeposit) {
      void this.prepareDeposit();
      return;
    }
    void this.prepareWithdraw();
  }

  /**
   * 在提现被提交确认的那一刻为它定价。
   *
   * 在这里读取并保存下来，而不是复用背后界面上的那一份：`submit` 会再读一次，两者不一致就
   * 拒绝签名。
   */
  private async prepareWithdraw() {
    this.preparingWithdraw = true;
    this.withdrawConfirmedQuote = null;
    try {
      const quote = await this.feeQuote.withdrawQuote();
      if (!this.confirming || !this.isWithdraw) {
        return;
      }
      this.withdrawQuote = quote;
      this.withdrawConfirmedQuote = quote;
    } catch (error) {
      if (this.isWithdraw) {
        this.withdrawQuote = null;
      }
      this.withdrawConfirmedQuote = null;
      this.confirming = false;
    } finally {
      this.preparingWithdraw = false;
    }
  }

  cancelConfirm() {
    this.confirming = false;
    this.discardDepositPreparation();
    this.withdrawConfirmedQuote = null;
  }

  /**
   * 丢弃为一笔不会发出、或者已经发出的入金所准备的东西。
   *
   * 无论它所对应的那次尝试发生了什么，这份授权在自己的整个有效窗口内都保持有效，所以那次
   * 尝试一结束就把它丢掉：用户退出了、切了标签页、离开了界面、发送失败了，或者发送成功并把
   * 它用掉了。唯一保留它的情形是手续费报价发生变动 —— 那时确认面板会就着同一笔入金重新打开，
   * 重新签名只会请用户去同意他们已经同意过的东西。
   */
  private discardDepositPreparation() {
    this.depositAuthorization = null;
    this.depositQuote = null;
    this.networkFeeExact = null;
  }

  /** 读取失败之后重试，好让未知的余额或报价不至于变成死胡同。 */
  reload() {
    if (this.address) {
      this.accountStates.refreshAccount(this.address).subscribe();
      this.loadWalletBalance(this.address);
    }
    if (this.isWithdraw) {
      void this.loadWithdrawQuote();
    }
  }

  async submit() {
    if (!this.canSubmit) {
      return;
    }
    this.confirming = false;
    const walletExtra = this.wallet?.accounts[0]?.extra;
    if (walletExtra?.ledgerSLIP44 || walletExtra?.qrBasedXFP) {
      this.global.snackBarTip('perpsSigningUnavailable');
      return;
    }
    this.submitting = true;
    this.clearRefreshWarnings();
    // 这个金额意味着「就是这个数」还是「全部」，决定了下面能对它做什么；
    // 而这次刷新马上就要覆盖掉那个预设值所依据的余额。
    const wasMax = this.activePreset === -1;
    try {
      await this.refreshBeforeSubmit();
    } catch (error) {
      this.submitting = false;
      this.refreshFailed = true;
      return;
    }
    if (this.exceedsBalance) {
      // MAX 请求意味着「全部」，所以它可以跟着余额一起往下走 —— 但用户仍要确认新的数字。
      // 手动输入的金额意味着就是那个数，悄悄少发一点等于替用户杜撰意图。
      this.submitting = false;
      this.balanceMovedUnderInput = true;
      if (wasMax && this.maxAmountKnown) {
        this.amount = this.floorAmount(this.maxAmountExact);
        this.activePreset = -1;
      }
      return;
    }
    try {
      const password = await this.chrome.getPassword();
      const privateKey = await this.evmWallet.getPrivateKey(
        this.wallet,
        password
      );
      if (this.isDeposit) {
        await this.sendDeposit(privateKey);
        return;
      }
      // 已确认的那份报价决定了到账估算，以及这笔金额必须跨过的下限；这里再读一次，而不是
      // 对着一个可能在用户同意之后已经变动的数字签名。只有手续费变高才会把用户送回去：
      // 变低意味着付出去的比估算承诺的更多，而请他们重新批准一个更好的数字，是没有任何问题
      // 作为依据的摩擦。
      const shown = this.withdrawConfirmedQuote;
      const fresh = await this.feeQuote.withdrawQuote();
      this.withdrawQuote = fresh;
      if (
        !shown ||
        new BigNumber(fresh.feeExact).isGreaterThan(shown.feeExact)
      ) {
        this.submitting = false;
        this.withdrawConfirmedQuote = fresh;
        this.confirming = true;
        this.global.snackBarTip('perpsFeeQuoteChangedReviewAgain');
        return;
      }
      const request: Observable<unknown> = this.writes.withdraw(
        privateKey,
        this.address,
        this.submissionAmount,
        // 统一账户把 USDC 放在现货里。本页面读不到的账户按标准账户处理：交易场所会拒绝余额
        // 不足以覆盖的扣款，所以猜错的代价只是一次拒绝，而不是从用户没打算动的地方扣走一笔
        // 提现。
        { fromSpot: !!this.account?.unified }
      );
      request.subscribe({
        next: () => {
          this.submitting = false;
          this.global.snackBarTip('perpsWithdrawSuccess');
          this.amount = null;
          this.activePreset = null;
          this.refreshAfterWrite();
        },
        error: (error) => {
          this.submitting = false;
          if (error instanceof PerpsExecutionStatusUnknownError) {
            // 交易场所可能已经执行了它。把这称作失败，正是用户把同一笔余额提两次的方式，
            // 所以界面照实说，并且不会自作主张再发一次。
            this.global.snackBarTip('perpsWithdrawStatusUnknown');
            this.refreshAfterWrite();
            return;
          }
          this.global.snackBarTip('txFailed', error?.message || error);
        },
      });
    } catch (error) {
      this.submitting = false;
      this.global.snackBarTip('verifyFailed', error?.message || error);
    }
  }

  /**
   * 广播这笔入金，然后守候它的回执。
   *
   * 两个事实分别上报：转账已上链，以及 HyperCore 已经入账。把它们压成一句「已提交」，正是
   * 用户回到账户看到旧余额时会以为出了故障的原因。
   */
  private async sendDeposit(privateKey: string) {
    const config = this.token;
    const amount = this.submissionAmount;
    const address = this.address;
    // 在发送之前记下：这笔入金预期要抬高的那个余额。
    const withdrawableBeforeExact = this.withdrawableExact ?? '0';
    let hash: string;
    try {
      const authorization = this.depositAuthorization;
      const confirmed = this.depositQuote;
      if (!authorization || !confirmed) {
        this.submitting = false;
        this.global.snackBarTip('perpsRefreshFailed');
        return;
      }
      // 再读一次，而不是对着展示给用户的那个数字签名：转发费是一个合约变量，而屏幕上的报价
      // 可能已经在描述另一笔入金，而不是即将发出的这一笔。只有手续费变高才会退回确认 ——
      // 变低意味着入账得比界面承诺的更多，那不是需要用户同意的变化。
      const fresh = await this.feeQuote.depositQuote(amount, address);
      if (new BigNumber(fresh.feeExact).isGreaterThan(confirmed.feeExact)) {
        this.submitting = false;
        this.depositQuote = fresh;
        this.confirming = true;
        this.global.snackBarTip('perpsFeeQuoteChangedReviewAgain');
        return;
      }
      hash = await this.depositChain.sendDeposit(
        config,
        privateKey,
        authorization,
        fresh.maxFeeExact
      );
    } catch (error) {
      // 这份许可下什么都没发出去，将来也不会：重试会重新走一遍确认并签一份新的。在这里把它
      // 留着，等于为一次已经结束的尝试，让一份仍然可用的许可存活它的整个有效窗口。
      this.discardDepositPreparation();
      this.submitting = false;
      this.global.snackBarTip('txFailed', (error as Error)?.message || error);
      return;
    }
    // 已用掉。nonce 已经在链上被消耗，所以从这里起留着的是一份再也授权不了任何东西的许可 ——
    // 而把它留在 `sendDeposit` 读取授权的地方，正是第二次发送为一笔只可能 revert 的交易付
    // gas 的原因。
    this.discardDepositPreparation();
    this.submitting = false;
    this.amount = null;
    this.activePreset = null;
    // 在别的地方还来不及出错之前先记下来：从这一刻起钱已经离开钱包，
    // 而把它跟丢是我们唯一不能允许的结局。
    await this.pendingDeposits.add({
      chainId: config.chainId,
      address,
      amountExact: amount,
      hash,
      startedAt: Date.now(),
      chainConfirmed: false,
      withdrawableBeforeExact,
    });
    await this.reloadPending(address);
    this.global.snackBarTip('perpsDepositSubmitted');
    await this.trackDeposit(config, hash, address);
  }

  private async trackDeposit(
    config: PerpsDepositConfig,
    hash: string,
    address: string
  ) {
    const outcome = await this.depositChain.depositOutcome(
      config,
      hash,
      PERPS_DEPOSIT_RECEIPT_TIMEOUT_MS
    );
    if (config !== this.token || address !== this.address) {
      return;
    }
    if (outcome !== 'pending') {
      await this.pendingDeposits.update(hash, {
        chainConfirmed: outcome === 'confirmed',
        reverted: outcome === 'reverted',
      });
      await this.reloadPending(address);
    }
    // 没有在我们愿意等待的时间内确认，这不算失败 —— 交易已经广播，仍有可能落块，所以它保持
    // 待处理而不是报错。revert 才是唯一终局，而它会被明明白白地说出来。
    this.global.snackBarTip(
      outcome === 'confirmed'
        ? 'perpsDepositConfirmed'
        : outcome === 'reverted'
        ? 'perpsDepositReverted'
        : 'perpsDepositStillPending'
    );
    this.refreshAfterWrite();
    this.loadWalletBalance(address);
  }

  private refreshAfterWrite() {
    if (!this.address) {
      return;
    }
    this.accountStates.refreshAccount(this.address).subscribe();
  }

  back() {
    history.go(-1);
  }
}
