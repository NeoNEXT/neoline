import { Component, OnDestroy, OnInit } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { Store } from '@ngrx/store';
import { firstValueFrom, Unsubscribable } from 'rxjs';
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
  PerpsDepositChainService,
} from '@/app/core/services/perps/perps-deposit-chain.service';
import {
  PerpsDepositFeeRate,
  PerpsFeeQuote,
  PerpsFeeQuoteService,
} from '@/app/core/services/perps/perps-fee-quote.service';
import { PerpsBroadcastStatusUnknownError } from '@/app/core/services/perps/perps-rpc';
import { EvmWalletJSON } from '@popup/_lib/evm';
import {
  PerpsAccount,
  PerpsConnectionState,
  PerpsDepositConfig,
  PERPS_MIN_DEPOSIT,
  PERPS_DEPOSIT_RECEIPT_TIMEOUT_MS,
  PERPS_WALLET_BALANCE_POLL_MS,
} from '@popup/_lib/perps';
import { clampDecimals, formatBalance, formatUsd, MISSING_DISPLAY } from '../perps.util';

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
  preparingDeposit = false;
  private depositConfirmedFeeExact: string | null = null;
  private submissionSeq = 0;
  private destroyed = false;
  /** 进入本页时读到的入金费率。改金额只在本地计算，不再请求。 */
  private depositFee: PerpsDepositFeeRate | null = null;
  private feesLoading = false;

  readonly minDeposit = PERPS_MIN_DEPOSIT;
  /**
   * 进入本页时读到的提现手续费。为 null 表示读不到，此时会挡下这笔提现，而不是退回到一个
   * 可能是错的数字。
   */
  withdrawQuote: PerpsFeeQuote | null = null;
  /**
   * 用百分比而不是固定金额：在一个余额可能为零或未知的界面上，$50 按钮是一个只能以报错收场
   * 的提议。
   */
  readonly presetPercents = [25, 50];

  formatUsd = formatUsd;
  formatBalance = formatBalance;
  readonly missingDisplay = MISSING_DISPLAY;

  private address: string;
  private wallet: EvmWalletJSON;
  /** 当前账户/余额数据是按哪套配置加载出来的。 */
  private loadedConfig: PerpsDepositConfig;
  private accountSub: Unsubscribable;
  private connectionSub: Unsubscribable;
  private accountStateSub: Unsubscribable;
  private balanceTimer: ReturnType<typeof setInterval>;
  private depositGasTimer: ReturnType<typeof setInterval>;

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
    private channel: PerpsDataChannel,
    private writes: PerpsExchangeWriteService
  ) {}

  ngOnInit() {
    const tab = this.route.snapshot.queryParams.tab;
    if (tab === 'withdraw') {
      this.tab = 'withdraw';
    }
    void this.loadFees();
    this.connectionSub = this.channel
      .watchConnectionState()
      .subscribe((state) => {
        this.connectionState = state;
      });
    this.accountSub = this.store.select('account').subscribe((state) => {
      const address = state.currentWallet?.accounts[0]?.address;
      if (this.wallet && this.wallet !== state.currentWallet) { this.invalidateSubmission(); }
      this.wallet = state.currentWallet as EvmWalletJSON;
      if (
        address &&
        (address !== this.address || this.token !== this.loadedConfig)
      ) {
        this.invalidateSubmission();
        this.address = address;
        this.loadedConfig = this.token;
        this.watchAccountState(address);
        this.startBalancePolling(address);
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

  /** 授权后估算的真实交易预算用于准备和最终发送前的余额校验。 */
  get gasShortfall(): boolean {
    return this.isDeposit && this.networkFeeExact !== null &&
      this.nativeBalanceExact !== null &&
      !coversExact(this.nativeBalanceExact, this.networkFeeExact);
  }

  ngOnDestroy() {
    this.destroyed = true;
    this.accountSub?.unsubscribe();
    this.connectionSub?.unsubscribe();
    this.accountStateSub?.unsubscribe();
    clearInterval(this.balanceTimer);
    this.invalidateSubmission();
  }

  /**
   * 提现表单当前使用的本地上限：标准账户取永续 withdrawable，统一/组合账户取现货 USDC total-hold。
   * 后者尚未证明等于所有持仓、冻结和借款场景下的最大可提额，不能把 hold 等同于完整保证金要求。
   * 待核对的真实账户边界见本页 README 第 3.1 节和 F17。
   */
  get withdrawableExact(): string {
    const account = this.account;
    if (!account || account.abstractionMode === 'unknown') {
      return null;
    }
    if (!account.unified) {
      return account.withdrawableExact ?? null;
    }
    if (account.spotUsdcExact == null || account.spotUsdcHoldExact == null) {
      return null;
    }
    const free = new BigNumber(account.spotUsdcExact).minus(
      account.spotUsdcHoldExact
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

  /** 硬件或二维码钱包无法导出这两条资金路径所需的私钥。 */
  get signingUnavailable(): boolean {
    const extra = this.wallet?.accounts[0]?.extra;
    return !!(extra?.ledgerSLIP44 || extra?.qrBasedXFP);
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

  /** 入金用本页费率按当前金额计算；提现用进入页面时读到的报价。 */
  get confirmFeeExact(): string | null {
    return this.isDeposit
      ? this.depositConfirmedFeeExact ?? this.currentDepositFee
      : this.withdrawFeeExact;
  }

  private get currentDepositFee(): string | null {
    if (!this.depositFee) {
      return null;
    }
    const protocolFee = new BigNumber(this.hasPositiveAmount ? this.submissionAmount : '0')
      .times(this.depositFee.protocolFeeBps)
      .div(10000)
      .decimalPlaces(this.amountDecimals, BigNumber.ROUND_CEIL);
    return protocolFee.plus(this.depositFee.forwardFeeExact).toFixed();
  }

  /** 进入资金页或重试时各读一次入金费率和提现手续费。 */
  private async loadFees() {
    if (this.feesLoading || (this.depositFee && this.withdrawQuote)) {
      return;
    }
    const config = this.token;
    this.feesLoading = true;
    const [depositFee, withdrawQuote] = await Promise.all([
      this.depositFee ?? this.feeQuote.depositFeeRate().catch(() => null),
      this.withdrawQuote ?? this.feeQuote.withdrawQuote().catch(() => null),
    ]);
    if (!this.destroyed && config === this.token) {
      this.depositFee = depositFee;
      this.withdrawQuote = withdrawQuote;
    }
    this.feesLoading = false;
  }

  /**
   * 该意图估算会到账多少，由同一屏上的手续费推导而来，这样两行绝不可能描述不同的报价。
   */
  get confirmReceiveExact(): string | null {
    const fee = this.confirmFeeExact;
    if (!this.hasPositiveAmount || fee === null) {
      return null;
    }
    const net = new BigNumber(this.submissionAmount).minus(fee);
    return net.isGreaterThan(0) ? net.toFixed() : '0';
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
    // 排在最前：别的每一条都能靠重试、改金额或换账户解决，这一条不能，所以它先说。
    if (this.signingUnavailable) {
      return 'perpsSigningUnavailable';
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
    if (this.isDeposit ? !this.depositFee : !this.withdrawQuote) {
      return this.feesLoading ? '' : 'perpsFeeQuoteUnknown';
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
      !this.fundingBusy &&
      !this.belowMinimum &&
      !this.exceedsBalance &&
      !this.amountExceedsPrecision &&
      !this.signingUnavailable &&
      !this.gasShortfall &&
      this.maxAmountKnown &&
      (this.isDeposit ? !!this.depositFee : !!this.withdrawQuote)
    );
  }

  get fundingBusy(): boolean {
    return this.submitting || this.preparingDeposit || this.confirming;
  }

  get confirming(): boolean {
    return this.depositConfirmedFeeExact !== null;
  }

  get canConfirm(): boolean {
    return this.confirming && !this.submitting && !this.preparingDeposit && !this.gasShortfall && !this.exceedsBalance &&
      !this.signingUnavailable && !this.accountLoadError && this.isDeposit;
  }

  cancelConfirm() {
    if (!this.submitting) { this.invalidateSubmission(); }
  }

  /**
   * 表单的重试控件该不该显示。
   *
   * 没有它，余额未知和报价未知都是死胡同：文案写着「重试」，而这是唯一真的能重试的控件。
   */
  get showRetry(): boolean {
    return !this.maxAmountKnown || (!this.feesLoading && (
      (this.isDeposit && !this.depositFee) ||
      (this.isWithdraw && !this.withdrawQuote)
    ));
  }

  setTab(tab: FundingTab) {
    if (this.submitting || this.tab === tab) {
      return;
    }
    this.tab = tab;
    this.invalidateSubmission();
    this.amount = null;
    this.activePreset = null;
    this.clearRefreshWarnings();
  }

  setPercent(percent: number) {
    if (this.fundingBusy || !this.maxAmountKnown) {
      return;
    }
    this.activePreset = percent;
    this.amount = this.floorAmount(
      new BigNumber(this.maxAmountExact).times(percent).dividedBy(100)
    );
    this.networkFeeExact = null;
  }

  setMax() {
    if (this.fundingBusy || !this.maxAmountKnown) {
      return;
    }
    this.activePreset = -1;
    // 交易场所报出的可提余额，其小数位数多于它自己在链上愿意接受的位数，所以一个原封不动的
    // MAX 会落在一个被它自己的精度校验拒绝的值上。向下取整也是唯一安全的方向：向上取整等于
    // 去要并不存在的钱。
    this.amount = this.floorAmount(this.maxAmountExact);
    this.networkFeeExact = null;
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
    this.invalidateSubmission();
    this.activePreset = null;
    this.clearRefreshWarnings();
  }

  private clearRefreshWarnings() {
    this.refreshFailed = false;
    this.balanceMovedUnderInput = false;
  }

  private invalidateSubmission() {
    clearInterval(this.depositGasTimer);
    ++this.submissionSeq;
    this.submitting = false;
    this.preparingDeposit = false;
    this.depositConfirmedFeeExact = null;
    this.networkFeeExact = null;
  }

  reload() {
    if (this.address) {
      const address = this.address;
      this.accountStates.refreshAccount(address).subscribe();
      this.loadWalletBalance(address);
    }
    void this.loadFees();
  }

  submitFunding() {
    return this.isDeposit ? this.prepareDeposit() : this.submit();
  }

  /** 点击继续后签授权、估算费用；确认期间复用授权，每 30 秒刷新 gas 预算。 */
  private async prepareDeposit() {
    if (!this.canSubmit || this.destroyed) { return; }
    const seq = ++this.submissionSeq;
    const address = this.address;
    const wallet = this.wallet;
    const config = this.token;
    const amount = this.submissionAmount;
    const wasMax = this.activePreset === -1;
    this.preparingDeposit = true;
    this.clearRefreshWarnings();
    try {
      await this.loadWalletBalance(address);
      if (seq !== this.submissionSeq) { return; }
      if (this.walletBalanceExact === null || this.nativeBalanceExact === null) {
        this.refreshFailed = true;
        return;
      }
      if (this.exceedsBalance) {
        this.balanceMovedUnderInput = true;
        if (wasMax) { this.amount = this.floorAmount(this.maxAmountExact); }
        return;
      }
      const password = await this.chrome.getPassword();
      if (seq !== this.submissionSeq) { return; }
      const privateKey = await this.evmWallet.getPrivateKey(wallet, password);
      if (seq !== this.submissionSeq) { return; }
      const feeExact = this.currentDepositFee;
      const authorization = await this.depositChain.authorizeDeposit(config, privateKey, amount);
      if (seq !== this.submissionSeq) { return; }
      const networkFeeExact = await this.depositChain.depositFeeExact(config, authorization, feeExact);
      if (seq !== this.submissionSeq) { return; }
      this.networkFeeExact = networkFeeExact;
      if (this.gasShortfall) { return; }
      this.depositConfirmedFeeExact = feeExact;
      this.depositGasTimer = setInterval(async () => {
        if (this.preparingDeposit || this.submitting) { return; }
        this.preparingDeposit = true;
        try {
          const refreshed = await this.depositChain.depositFeeExact(config, authorization, feeExact);
          if (seq !== this.submissionSeq) { return; }
          this.networkFeeExact = refreshed;
        } catch (error) {
          if (seq === this.submissionSeq) {
            this.invalidateSubmission();
            this.global.snackBarTip('txFailed', error?.message || error);
          }
        } finally {
          if (seq === this.submissionSeq) { this.preparingDeposit = false; }
        }
      }, 30000);
    } catch (error) {
      if (seq === this.submissionSeq) { this.global.snackBarTip('txFailed', error?.message || error); }
    } finally {
      if (seq === this.submissionSeq) { this.preparingDeposit = false; }
    }
  }

  /** 先刷新并复核源余额，再解锁一次；两个方向共用同一个提交闸门。 */
  async submit() {
    if (this.destroyed || (this.isDeposit ? !this.canConfirm : !this.canSubmit)) { return; }
    clearInterval(this.depositGasTimer);
    const feeExact = this.depositConfirmedFeeExact;
    const seq = ++this.submissionSeq;
    const address = this.address;
    const wallet = this.wallet;
    const config = this.token;
    const tab = this.tab;
    const amount = this.submissionAmount;
    const wasMax = this.activePreset === -1;
    this.submitting = true;
    this.clearRefreshWarnings();
    let fromSpot = false;
    try {
      try {
        if (tab === 'deposit') {
          await this.loadWalletBalance(address);
          if (seq !== this.submissionSeq) { return; }
          if (this.walletBalanceExact === null || this.nativeBalanceExact === null) {
            this.depositConfirmedFeeExact = null;
            throw new Error('Source balance unavailable');
          }
        } else {
          const state = await firstValueFrom(this.accountStates.refreshAccount(address));
          if (seq !== this.submissionSeq) { return; }
          if (!state.account) {
            throw new Error('Account refresh failed');
          }
          this.account = state.account;
          if (!this.maxAmountKnown) { throw new Error('Withdrawal source unavailable'); }
          fromSpot = !!state.account.unified;
        }
      } catch (error) {
        if (seq === this.submissionSeq) { this.refreshFailed = true; }
        return;
      }
      if (this.exceedsBalance) {
        this.depositConfirmedFeeExact = null;
        this.balanceMovedUnderInput = true;
        if (wasMax && this.maxAmountKnown) {
          this.amount = this.floorAmount(this.maxAmountExact);
          this.activePreset = -1;
        }
        return;
      }
      if (tab === 'deposit' && this.gasShortfall) {
        this.depositConfirmedFeeExact = null;
        return;
      }
      const password = await this.chrome.getPassword();
      if (seq !== this.submissionSeq) { return; }
      const privateKey = await this.evmWallet.getPrivateKey(wallet, password);
      if (seq !== this.submissionSeq) { return; }
      if (tab === 'deposit') {
        const authorization = await this.depositChain.authorizeDeposit(config, privateKey, amount);
        if (seq !== this.submissionSeq) { return; }
        let hash: string;
        let statusUnknown = false;
        try {
          hash = await this.depositChain.sendDeposit(config, privateKey, authorization, feeExact);
        } catch (error) {
          if (!(error instanceof PerpsBroadcastStatusUnknownError)) { throw error; }
          hash = error.hash;
          statusUnknown = true;
        }
        if (seq === this.submissionSeq) {
          this.depositConfirmedFeeExact = null;
          this.networkFeeExact = null;
          this.amount = null;
          this.activePreset = null;
          this.global.snackBarTip(statusUnknown ? 'perpsDepositStatusUnknown' : 'perpsDepositSubmitted');
        }
        if (seq === this.submissionSeq) { this.submitting = false; }
        await this.trackDeposit(config, hash, address);
      } else {
        try {
          await firstValueFrom(this.writes.withdraw(privateKey, address, amount, { fromSpot }));
        } catch (error) {
          if (!(error instanceof PerpsExecutionStatusUnknownError)) { throw error; }
          if (seq === this.submissionSeq) {
            this.global.snackBarTip('perpsWithdrawStatusUnknown');
            this.refreshAfterWrite();
          }
          return;
        }
        if (seq === this.submissionSeq) {
          this.global.snackBarTip('perpsWithdrawSubmitted');
          this.amount = null;
          this.activePreset = null;
          this.refreshAfterWrite();
        }
      }
    } catch (error) {
      if (seq === this.submissionSeq) {
        this.depositConfirmedFeeExact = null;
        this.global.snackBarTip('txFailed', error?.message || error);
      }
    } finally {
      if (seq === this.submissionSeq) { this.submitting = false; }
    }
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
    // 没有在我们愿意等待的时间内确认，这不算失败 —— 交易已经广播，仍有可能落块，所以它保持
    // 待处理而不是报错。revert 才是唯一终局，而它会被明明白白地说出来。
    // 正常确认后只刷新余额，避免与广播后的发起提示重复。
    if (outcome !== 'confirmed') {
      this.global.snackBarTip(
        outcome === 'reverted'
          ? 'perpsDepositReverted'
          : 'perpsDepositStillPending'
      );
    }
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
