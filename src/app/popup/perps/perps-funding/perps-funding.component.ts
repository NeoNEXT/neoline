import { Component, OnDestroy, OnInit } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { Store } from '@ngrx/store';
import { firstValueFrom, Observable, Unsubscribable } from 'rxjs';
import { ethers } from 'ethers';
import BigNumber from 'bignumber.js';

import { AppState } from '@/app/reduers';
import {
  ChromeService,
  EvmWalletService,
  GlobalService,
} from '@/app/core';
import { HyperliquidService } from '@/app/core/services/perps/hyperliquid.service';
import {
  coversExact,
  PerpsDepositChainService,
} from '@/app/core/services/perps/perps-deposit-chain.service';
import { PerpsPendingDepositsService } from '@/app/core/services/perps/perps-pending-deposits.service';
import { EvmWalletJSON } from '@popup/_lib/evm';
import {
  PerpsAccount,
  PerpsConnectionState,
  PerpsDepositConfig,
  PERPS_MIN_DEPOSIT,
  PERPS_MIN_WITHDRAW,
  PerpsPendingDeposit,
  PERPS_DEPOSIT_RECEIPT_TIMEOUT_MS,
  PERPS_PENDING_DEPOSIT_POLL_MS,
  PERPS_WALLET_BALANCE_POLL_MS,
  PERPS_WITHDRAW_FEE,
} from '@popup/_lib/perps';
import { formatBalance, formatUsd } from '../perps.util';

type FundingTab = 'deposit' | 'withdraw';

/**
 * Combined deposit / withdraw screen for the perps account.
 *
 * Deposits are an Arbitrum USDC transfer into Bridge2; withdrawals are a signed
 * exchange action. Both write paths land with the trading milestone.
 */
@Component({
  templateUrl: 'perps-funding.component.html',
  styleUrls: ['perps-funding.component.scss'],
})
export class PerpsFundingComponent implements OnInit, OnDestroy {
  tab: FundingTab = 'deposit';
  /** Human-unit decimal text. It must not pass through Number before signing. */
  amount: string = null;
  activePreset: number = null;

  account: PerpsAccount;
  /**
   * Source-token balance for the deposit side, as the exact decimal the chain
   * reported. `null` means not known — which is not the same fact as zero, and
   * must never be rendered as one.
   */
  walletBalanceExact: string = null;
  submitting = false;
  accountLoadError = false;
  accountLoading = true;
  /** Whether the account feed is still delivering, for the non-live marker. */
  connectionState: PerpsConnectionState = 'connecting';
  /** A pre-submit refresh could not be completed, so nothing was signed. */
  refreshFailed = false;
  /** A pre-submit refresh moved the ceiling below what the user had entered. */
  balanceMovedUnderInput = false;
  /** Native balance on the deposit chain — `null` while unknown. */
  nativeBalanceExact: string = null;
  /** Estimated network fee for this deposit, in the chain's own currency. */
  networkFeeExact: string = null;
  /** The deposit confirmation step is open. */
  confirming = false;
  /** Deposits that have left the wallet but are not yet spendable. */
  pending: PerpsPendingDeposit[] = [];

  readonly minDeposit = PERPS_MIN_DEPOSIT;
  readonly minWithdraw = PERPS_MIN_WITHDRAW;
  readonly withdrawFee = PERPS_WITHDRAW_FEE;
  /**
   * Percentages rather than fixed amounts: a $50 button on a screen whose
   * balance may be zero or unknown is an offer that can only end in an error.
   */
  readonly presetPercents = [25, 50];

  formatUsd = formatUsd;
  formatBalance = formatBalance;

  private address: string;
  private wallet: EvmWalletJSON;
  /** Config the current account/balance data was loaded with. */
  private loadedConfig: PerpsDepositConfig;
  private accountSub: Unsubscribable;
  private connectionSub: Unsubscribable;
  private spotStateSub: Unsubscribable;
  private clearinghouseSub: Unsubscribable;
  private balanceTimer: ReturnType<typeof setInterval>;
  private feeTimer: ReturnType<typeof setTimeout>;
  private pendingTimer: ReturnType<typeof setInterval>;

  constructor(
    private route: ActivatedRoute,
    private store: Store<AppState>,
    private global: GlobalService,
    private hyperliquid: HyperliquidService,
    private chrome: ChromeService,
    private evmWallet: EvmWalletService,
    private depositChain: PerpsDepositChainService,
    private pendingDeposits: PerpsPendingDepositsService
  ) {}

  ngOnInit() {
    const tab = this.route.snapshot.queryParams.tab;
    if (tab === 'withdraw') {
      this.tab = 'withdraw';
    }
    this.connectionSub = this.hyperliquid
      .watchConnectionState()
      .subscribe((state) => {
        const recovered = this.connectionState === 'stale' && state === 'live';
        this.connectionState = state;
        // A reconnected feed replays subscriptions, but the account snapshot it
        // replays may predate what happened while we were dark, so the REST
        // snapshot is taken again rather than trusted from the replay.
        if (recovered && this.address) {
          this.loadAccount(this.address, true);
        }
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
        this.loadAccount(address);
        this.watchAccountState(address);
        this.startBalancePolling(address);
        this.startPendingTracking(address);
      }
    });
  }

  /** The REST snapshot the websocket updates are then applied on top of. */
  private loadAccount(address: string, force = false) {
    const config = this.token;
    this.accountLoadError = false;
    this.accountLoading = true;
    this.hyperliquid.getAccount(address, force).subscribe({
      next: (account) => {
        if (config === this.token && address === this.address) {
          this.account = account;
          this.accountLoading = false;
        }
      },
      error: () => {
        if (config === this.token && address === this.address) {
          this.accountLoadError = true;
          this.accountLoading = false;
        }
      },
    });
  }

  /**
   * Keep the account figures live for as long as the screen is open.
   *
   * A funding screen is somewhere users sit and think, and a withdrawable
   * balance read once on entry is wrong by the time they act on it. The home
   * tab already runs these two subscriptions; this is the same pair scoped to
   * the canonical clearinghouse, which is the only pool a withdrawal touches.
   */
  private watchAccountState(address: string) {
    const user = address.toLowerCase();
    this.unwatchAccountState();
    this.spotStateSub = this.hyperliquid
      .subscribe({ type: 'spotState', user })
      .subscribe((update) => {
        if (this.account && user === this.address?.toLowerCase()) {
          this.account = this.hyperliquid.updateAccountFromSpotState(
            this.account,
            update
          );
        }
      });
    this.clearinghouseSub = this.hyperliquid
      .subscribe({ type: 'clearinghouseState', user, dex: '' })
      .subscribe((update) => {
        if (this.account && user === this.address?.toLowerCase()) {
          this.account = this.hyperliquid.updateAccountFromClearinghouseState(
            this.account,
            update
          );
        }
      });
  }

  private unwatchAccountState() {
    this.spotStateSub?.unsubscribe();
    this.spotStateSub = undefined;
    this.clearinghouseSub?.unsubscribe();
    this.clearinghouseSub = undefined;
  }

  /** The source chain has no feed here, so its balance is polled instead. */
  private startBalancePolling(address: string) {
    clearInterval(this.balanceTimer);
    this.loadWalletBalance(address);
    this.balanceTimer = setInterval(() => {
      if (this.address === address && !this.submitting) {
        this.loadWalletBalance(address);
      }
    }, PERPS_WALLET_BALANCE_POLL_MS);
  }

  /** Deposit chain/token for the configured Perps network. */
  get token(): PerpsDepositConfig {
    return this.hyperliquid.depositConfig;
  }

  /**
   * Deposits are funded from the bridge's own chain, so both balances that
   * matter — the token being sent and the currency paying for the gas — are
   * read there rather than from the network the user has selected.
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
      // A read that failed is not a balance of zero. Leaving it unknown keeps
      // the screen honest and keeps MAX from offering money we cannot see.
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
    if (!superseded()) {
      this.scheduleFeeEstimate();
    }
  }

  /**
   * What this deposit will cost to send, estimated against the real call.
   *
   * Estimating with the amount capped at the balance keeps the estimate from
   * reverting for insufficient funds while the user is still typing — the gas
   * an ERC-20 transfer uses barely moves with the amount anyway, so the capped
   * figure is the same fee the real send will pay.
   */
  private scheduleFeeEstimate() {
    clearTimeout(this.feeTimer);
    this.feeTimer = setTimeout(() => this.estimateNetworkFee(), 400);
  }

  private async estimateNetworkFee() {
    const config = this.token;
    const address = this.address;
    const balance = this.walletBalanceExact;
    if (
      !this.isDeposit ||
      !address ||
      balance === null ||
      !new BigNumber(balance).isGreaterThan(0)
    ) {
      this.networkFeeExact = null;
      return;
    }
    const requested = this.hasPositiveAmount
      ? BigNumber.minimum(new BigNumber(this.amount), new BigNumber(balance))
      : new BigNumber(balance);
    try {
      const fee = await this.depositChain.transferFeeExact(
        config,
        address,
        requested
          .decimalPlaces(config.decimals, BigNumber.ROUND_FLOOR)
          .toFixed()
      );
      if (config === this.token && address === this.address) {
        this.networkFeeExact = fee;
      }
    } catch (e) {
      if (config === this.token && address === this.address) {
        this.networkFeeExact = null;
      }
    }
  }

  /**
   * The deposit chain's own currency will not cover the fee.
   *
   * Worth its own state rather than a generic failure: the user has the USDC
   * they are trying to deposit and no idea they also need gas on a chain they
   * did not choose.
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
    this.unwatchAccountState();
    clearInterval(this.balanceTimer);
    clearTimeout(this.feeTimer);
    clearInterval(this.pendingTimer);
  }

  /**
   * Pick up deposits still in flight, including ones started in an earlier
   * popup session. Money that left the wallet must never be invisible just
   * because the window was closed while the bridge was working.
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
      if (!deposit.chainConfirmed) {
        const confirmed = await this.depositChain.isConfirmed(
          config,
          deposit.hash,
          PERPS_PENDING_DEPOSIT_POLL_MS
        );
        if (confirmed) {
          await this.pendingDeposits.update(deposit.hash, {
            chainConfirmed: true,
          });
        }
      }
    }
    await this.reloadPending(address);
  }

  /** Followed long enough; the transfer is on chain but not yet credited. */
  isStalled(deposit: PerpsPendingDeposit): boolean {
    return this.pendingDeposits.isStalled(deposit);
  }

  /** Drop a record the user has acknowledged; the transaction is unaffected. */
  async dismissPending(deposit: PerpsPendingDeposit) {
    await this.pendingDeposits.remove(deposit.hash);
    await this.reloadPending(this.address);
  }

  get withdrawableExact(): string {
    return this.account?.withdrawableExact ?? null;
  }

  /** Figures on screen are last-known rather than live. */
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
   * Portfolio margin is an account shape whose collateral and risk this product
   * cannot present correctly, so it must not take more money in. Getting money
   * out is a different matter: refusing that would strand funds in an account
   * whose only fault is that we do not understand it.
   */
  get unsupportedAccountMode(): boolean {
    return this.isDeposit && this.account?.abstractionMode === 'portfolioMargin';
  }

  /** Exact source balance for MAX and balance checks. */
  private get maxAmountExact(): string {
    const source = this.isDeposit
      ? this.walletBalanceExact
      : this.withdrawableExact;
    return source ?? null;
  }

  /** Whether the source balance for the current tab is known at all. */
  get maxAmountKnown(): boolean {
    const source = this.maxAmountExact;
    return source !== null && new BigNumber(source).isFinite();
  }

  /**
   * What lands at the destination, as an exact decimal. The withdrawal fee is
   * taken out of the amount rather than added to it, so this is what the user
   * actually receives — an estimate until the exchange ledger records the fee
   * it really charged.
   */
  get receiveAmountExact(): string {
    if (!this.hasPositiveAmount) {
      return '0';
    }
    const net = new BigNumber(this.amount).minus(
      this.isWithdraw ? this.withdrawFee : 0
    );
    return net.isGreaterThan(0) ? net.toFixed() : '0';
  }

  get minimumAmount(): number {
    return this.isDeposit ? this.minDeposit : this.minWithdraw;
  }

  get belowMinimum(): boolean {
    if (!this.hasPositiveAmount) {
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

  /** Deposit uses ERC-20 decimals; Hyperliquid's signed wire amounts allow 8. */
  get amountDecimals(): number {
    return this.isDeposit ? this.token?.decimals ?? 6 : 8;
  }

  private get hasPositiveAmount(): boolean {
    const amount = new BigNumber(this.amount ?? '');
    return amount.isFinite() && amount.isGreaterThan(0);
  }

  /**
   * Why the submit control is disabled, as a message key — or empty when it is
   * not. Ordered by what has to be dealt with first, so the screen never shows
   * a dead button with no explanation.
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
      this.maxAmountKnown
    );
  }

  setTab(tab: FundingTab) {
    if (this.tab === tab) {
      return;
    }
    this.tab = tab;
    this.amount = null;
    this.activePreset = null;
    this.confirming = false;
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
    // The exchange reports withdrawable with more decimals than it will accept
    // on the wire, so an untouched MAX lands on a value its own precision check
    // rejects. Flooring is also the only safe direction: rounding up asks for
    // money that is not there.
    this.amount = this.floorAmount(this.maxAmountExact);
  }

  /** Never round a MAX value above the spendable USDC balance. */
  private floorAmount(value: BigNumber.Value): string {
    return new BigNumber(value)
      .decimalPlaces(this.amountDecimals, BigNumber.ROUND_FLOOR)
      .toFixed();
  }

  /** Normalize signed/submitted values without converting through Number. */
  private get submissionAmount(): string {
    return new BigNumber(this.amount).toFixed();
  }

  onAmountChange() {
    this.activePreset = null;
    this.clearRefreshWarnings();
    if (this.isDeposit) {
      this.scheduleFeeEstimate();
    }
  }

  private clearRefreshWarnings() {
    this.refreshFailed = false;
    this.balanceMovedUnderInput = false;
  }

  /**
   * Take a fresh account snapshot, and a fresh source balance when depositing.
   *
   * The screen is live, but "live" is a property of the feed, not a guarantee
   * about this instant. Nothing is signed until one round-trip has succeeded
   * against the exchange within this submission.
   */
  private async refreshBeforeSubmit(): Promise<void> {
    const address = this.address;
    const account = await firstValueFrom(
      this.hyperliquid.getAccount(address, true)
    );
    if (address !== this.address) {
      throw new Error('Account changed during refresh');
    }
    this.account = account;
    if (this.isDeposit) {
      await this.loadWalletBalance(address);
      if (this.walletBalanceExact === null) {
        throw new Error('Source balance unavailable');
      }
    }
  }

  /**
   * A deposit is an irreversible transfer to a contract address the user cannot
   * read, so it gets one look before it goes. A withdrawal does not: the money
   * goes to the user's own address, and the amount is already on screen.
   */
  requestSubmit() {
    if (!this.canSubmit) {
      return;
    }
    if (this.isDeposit) {
      this.confirming = true;
      return;
    }
    this.submit();
  }

  cancelConfirm() {
    this.confirming = false;
  }

  /** Retry after a failed read, so an unknown balance is not a dead end. */
  reload() {
    if (!this.address) {
      return;
    }
    this.loadAccount(this.address, true);
    this.loadWalletBalance(this.address);
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
    // Whether the amount means "this number" or "all of it" decides what may be
    // done with it below, and the refresh is about to overwrite the balance the
    // preset was derived from.
    const wasMax = this.activePreset === -1;
    try {
      await this.refreshBeforeSubmit();
    } catch (error) {
      this.submitting = false;
      this.refreshFailed = true;
      return;
    }
    if (this.exceedsBalance) {
      // A MAX request means "all of it", so it may follow the balance down —
      // but the user still confirms the new number. A typed amount means that
      // number, and silently sending less would be inventing an intent.
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
      const request: Observable<unknown> = this.hyperliquid.withdraw(
        privateKey,
        this.address,
        this.submissionAmount
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
          this.global.snackBarTip('txFailed', error?.message || error);
        },
      });
    } catch (error) {
      this.submitting = false;
      this.global.snackBarTip('verifyFailed', error?.message || error);
    }
  }

  /**
   * Broadcast the deposit, then watch for its receipt.
   *
   * Two facts, reported separately: the transfer is on chain, and the bridge
   * has credited it. Collapsing them into one "submitted" is why a user who
   * returns to the account and sees the old balance thinks something broke.
   */
  private async sendDeposit(privateKey: string) {
    const config = this.token;
    const amount = this.submissionAmount;
    const address = this.address;
    // Captured before the send: the balance this deposit is expected to lift.
    const withdrawableBeforeExact = this.withdrawableExact ?? '0';
    let hash: string;
    try {
      hash = await this.depositChain.sendDeposit(config, privateKey, amount);
    } catch (error) {
      this.submitting = false;
      this.global.snackBarTip('txFailed', (error as Error)?.message || error);
      return;
    }
    this.submitting = false;
    this.amount = null;
    this.activePreset = null;
    // Recorded before anything else can go wrong: from here the money has left
    // the wallet, and losing track of it is the one outcome we cannot allow.
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
    const confirmed = await this.depositChain.isConfirmed(
      config,
      hash,
      PERPS_DEPOSIT_RECEIPT_TIMEOUT_MS
    );
    if (config !== this.token || address !== this.address) {
      return;
    }
    if (confirmed) {
      await this.pendingDeposits.update(hash, { chainConfirmed: true });
      await this.reloadPending(address);
    }
    // Not confirming inside our patience is not a failure — the transaction is
    // broadcast and may still land, so it stays pending rather than erroring.
    this.global.snackBarTip(
      confirmed ? 'perpsDepositConfirmed' : 'perpsDepositStillPending'
    );
    this.refreshAfterWrite();
    this.loadWalletBalance(address);
  }

  private refreshAfterWrite() {
    if (!this.address) {
      return;
    }
    this.hyperliquid.getAccount(this.address, true).subscribe({
      next: (account) => (this.account = account),
      error: () => (this.accountLoadError = true),
    });
  }

  back() {
    history.go(-1);
  }
}
