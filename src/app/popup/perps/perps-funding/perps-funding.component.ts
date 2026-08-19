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
import {
  HyperliquidService,
  PerpsExecutionStatusUnknownError,
} from '@/app/core/services/perps/hyperliquid.service';
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
 * Combined deposit / withdraw screen for the perps account.
 *
 * Deposits are an Arbitrum USDC CCTP burn credited to the HyperCore perps
 * account; withdrawals are a signed exchange action that CCTP delivers to the
 * same address. Both write paths land with the trading milestone.
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
  /** Still working out what the deposit on screen will cost. */
  preparingDeposit = false;
  preparingWithdraw = false;
  /**
   * The quote the confirmation screen was drawn with.
   *
   * Kept apart from the live `withdrawQuote` on purpose: what has to match the
   * number signed against is the number the user agreed to, not whatever the
   * contract happened to be saying at the moment of signing.
   */
  withdrawConfirmedQuote: PerpsFeeQuote | null = null;
  /**
   * The signed permission this deposit will be sent with, and the fee quoted
   * when the user was shown it. Held instead of the private key, which is
   * fetched again at broadcast rather than kept alive across the dialog.
   */
  private depositAuthorization: PerpsDepositAuthorization | null = null;
  depositQuote: PerpsFeeQuote | null = null;
  /** Deposits that have left the wallet but are not yet spendable. */
  pending: PerpsPendingDeposit[] = [];

  readonly minDeposit = PERPS_MIN_DEPOSIT;
  /**
   * What the withdrawal route says it will take, read fresh rather than held
   * as a constant: the forwarding fee lives in a contract whose owner can
   * change it. Null means it could not be read, which blocks the withdrawal
   * instead of falling back to a number that may be wrong.
   */
  withdrawQuote: PerpsFeeQuote | null = null;
  /**
   * Which in-flight withdrawal quote the screen is waiting for.
   *
   * Incremented on every read so a slower answer from an earlier tab visit
   * cannot overwrite a newer one. The quote is what the floor and the button
   * depend on; showing the wrong one is worse than showing none.
   */
  private withdrawQuoteSeq = 0;
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
  private pendingTimer: ReturnType<typeof setInterval>;

  constructor(
    private route: ActivatedRoute,
    private store: Store<AppState>,
    private global: GlobalService,
    private hyperliquid: HyperliquidService,
    private chrome: ChromeService,
    private evmWallet: EvmWalletService,
    private depositChain: PerpsDepositChainService,
    private feeQuote: PerpsFeeQuoteService,
    private pendingDeposits: PerpsPendingDepositsService
  ) {}

  ngOnInit() {
    const tab = this.route.snapshot.queryParams.tab;
    if (tab === 'withdraw') {
      this.tab = 'withdraw';
      void this.loadWithdrawQuote();
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
   * Deposits are funded from the deposit chain, so both balances that matter —
   * the token being sent and the currency paying for the gas — are read there
   * rather than from the network the user has selected.
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
  }

  /**
   * Work out what the deposit on screen will actually cost, once.
   *
   * Everything here needs the amount the user settled on: the CCTP fee is
   * quoted per operation, and the gas cannot be estimated at all until the
   * authorisation exists, because the call reverts without a valid one. That
   * is why this runs when the confirmation opens rather than on every
   * keystroke — and why the key is fetched, used and dropped here instead of
   * being held for the life of the dialog.
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
        // The fee is the reason the form has to show; the authorisation is not
        // going to be used and must not outlive a sheet the user never confirmed.
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
    clearInterval(this.pendingTimer);
    this.discardDepositPreparation();
  }

  /**
   * Pick up deposits still in flight, including ones started in an earlier
   * popup session. Money that left the wallet must never be invisible just
   * because the window was closed while the credit was still in flight.
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
          // Stop watching: the burn never happened, so waiting for the credit
          // is waiting for something that was already decided against.
          await this.pendingDeposits.update(deposit.hash, { reverted: true });
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

  /**
   * What this account may actually withdraw, which is not the same field in
   * both account shapes.
   *
   * A standard account's perps `withdrawable` is the figure. A unified account
   * holds its USDC in the spot clearinghouse and the exchange reports its perps
   * figures as not meaningful — `withdrawable` is 0 there however funded the
   * account is — so reading that field would show a funded account $0 and
   * refuse every withdrawal it is capable of making. Its hold is subtracted for
   * the same reason a standard account's margin is: reserved collateral is not
   * withdrawable.
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

  /** The quoted fee, or null while it is unknown. */
  get withdrawFeeExact(): string | null {
    return this.withdrawQuote?.feeExact ?? null;
  }

  /** What the deposit route will take, known only once the deposit is prepared. */
  get depositFeeExact(): string | null {
    return this.depositQuote?.feeExact ?? null;
  }

  /**
   * What the perps account will be credited, as an estimate.
   *
   * The route fee comes out of the amount rather than being added to it, so a
   * deposit credits less than it sends. The quote is a ceiling, which makes
   * this a floor: the account can only be credited with more than this.
   */
  get depositReceiveExact(): string | null {
    if (!this.hasPositiveAmount || !this.depositFeeExact) {
      return null;
    }
    const net = new BigNumber(this.submissionAmount).minus(this.depositFeeExact);
    return net.isGreaterThan(0) ? net.toFixed() : '0';
  }

  /**
   * Where a withdrawal lands: the signer's own address on the deposit chain.
   *
   * Shown rather than assumed. It is never anything else — the route offers no
   * way to name another recipient — and a confirmation that omits it leaves the
   * user to take that on trust.
   */
  get withdrawRecipient(): string {
    return this.address;
  }

  /** The route fee the confirmation screen is agreeing to, whichever intent it is. */
  get confirmFeeExact(): string | null {
    return this.isDeposit
      ? this.depositFeeExact
      : this.withdrawConfirmedQuote?.feeExact ?? null;
  }

  /**
   * What that intent estimates will arrive, derived from the fee on the same
   * screen so the two lines can never describe different quotes.
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
   * Whether the confirmation screen has a complete answer to confirm.
   *
   * A screen still waiting on its quote has nothing for the user to agree to,
   * so the button stays down rather than sending against a blank.
   */
  get canConfirm(): boolean {
    if (this.submitting) {
      return false;
    }
    // Preparing is what the confirmation exists to do, and it can settle a
    // question the screen could not answer before it ran: the deposit's network
    // fee is only known here, and it decides whether the wallet can pay for the
    // send at all. `submit` refuses anything `canSubmit` refuses, silently, so
    // the sheet has to ask the same question rather than offer a button that
    // does nothing when pressed.
    if (!this.canSubmit) {
      return false;
    }
    return this.isDeposit
      ? !this.preparingDeposit && !!this.depositQuote
      : !this.preparingWithdraw && !!this.withdrawConfirmedQuote;
  }

  /**
   * Twice the quote for a withdrawal.
   *
   * One times the quote is where the destination chain refuses the transfer,
   * and it refuses after HyperCore has already been debited; the second
   * multiple is room for the fee to move between the quote and the transfer.
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
   * The precision both directions are held to: the token's own.
   *
   * Hyperliquid's signed wire format accepts eight decimals, but a withdrawal
   * is delivered as USDC on the destination chain, which carries six. A
   * seventh decimal is a figure the exchange would take and the delivery could
   * not pay out, so the field never offers one in either direction.
   */
  get amountDecimals(): number {
    return this.token?.decimals ?? 6;
  }

  private get hasPositiveAmount(): boolean {
    const amount = new BigNumber(this.amount ?? '');
    return amount.isFinite() && amount.isGreaterThan(0);
  }

  /**
   * What the blocked-state message is filled in with.
   *
   * `symbol` follows the reason rather than the tab. A gas shortfall is about
   * the chain's own currency and every other figure here is about the token
   * being moved; on this route those are never the same thing, so keying it to
   * deposit-versus-withdraw tells the user the wrong one in both directions.
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
   * Read what a withdrawal currently costs.
   *
   * Unknown is a state of its own: the amount that arrives, the floor the
   * amount has to clear and whether the button works at all are all derived
   * from this number, so a failed read stops the withdrawal rather than
   * letting a stale figure stand in for it.
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
      // Guarded like the success path: a read that fails after the user has
      // moved on must not blank out the quote the current tab is using.
      if (seq !== this.withdrawQuoteSeq || !this.isWithdraw) {
        return;
      }
      this.withdrawQuote = null;
    }
  }

  /**
   * Whether the form's retry control should show.
   *
   * Unknown balance and unknown quote are both dead ends without it: the copy
   * says "retry", and this is the only control that does.
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

  /**
   * Hold the field to the precision this route signs at.
   *
   * Both directions move the same token, so a digit past its decimals belongs
   * to no transfer this screen can make. The field drops it as it is typed,
   * which is how the transfer screen's amount field behaves;
   * `amountExceedsPrecision` stays as the submission guard, since the field is
   * not the only way a value reaches `amount`.
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
   * Both intents get one look before they go.
   *
   * A deposit is an irreversible transfer to a contract address the user cannot
   * read. A withdrawal goes to the user's own address, which was once taken as
   * a reason to skip this step — but the address was never the part in doubt.
   * What the user is agreeing to is a fee read from a contract whose owner can
   * change it, and the amount that survives it; a number nobody was asked about
   * is not a number anybody agreed to.
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
   * Price the withdrawal at the moment it goes up for confirmation.
   *
   * Read here and kept, rather than reused from the screen behind: `submit`
   * reads once more and refuses to sign if the two disagree.
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
   * Drop what was prepared for a deposit that is not going out — or has gone.
   *
   * The authorisation stays valid for its whole window whatever happens to the
   * attempt it was signed for, so it is dropped the moment that attempt ends:
   * the user backed out, switched tabs, left the screen, the send failed, or
   * the send succeeded and spent it. The one case that keeps it is the fee
   * quote moving, where the sheet reopens on the same deposit and re-signing
   * would only ask the user to agree to what they already agreed to.
   */
  private discardDepositPreparation() {
    this.depositAuthorization = null;
    this.depositQuote = null;
    this.networkFeeExact = null;
  }

  /** Retry after a failed read, so an unknown balance or quote is not a dead end. */
  reload() {
    if (this.address) {
      this.loadAccount(this.address, true);
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
      // The confirmed quote decided the arrival estimate and the floor this
      // amount had to clear; read it again rather than sign against a number
      // that may have moved since the user agreed to it.
      const shown = this.withdrawConfirmedQuote;
      const fresh = await this.feeQuote.withdrawQuote();
      this.withdrawQuote = fresh;
      if (!shown || fresh.feeExact !== shown.feeExact) {
        this.submitting = false;
        this.withdrawConfirmedQuote = fresh;
        this.confirming = true;
        this.global.snackBarTip('perpsFeeQuoteChangedReviewAgain');
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
          if (error instanceof PerpsExecutionStatusUnknownError) {
            // The exchange may have run this. Calling it a failure is how a
            // user withdraws the same balance twice, so the screen says what is
            // actually true and sends nothing again on its own.
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
   * Broadcast the deposit, then watch for its receipt.
   *
   * Two facts, reported separately: the transfer is on chain, and HyperCore
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
      const authorization = this.depositAuthorization;
      const confirmed = this.depositQuote;
      if (!authorization || !confirmed) {
        this.submitting = false;
        this.global.snackBarTip('perpsRefreshFailed');
        return;
      }
      // Read again rather than sign against the number the user was shown: the
      // forwarding fee is a contract variable, and the quote on the screen may
      // already be describing a different deposit than the one about to go.
      const fresh = await this.feeQuote.depositQuote(amount, address);
      if (fresh.feeExact !== confirmed.feeExact) {
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
      // Nothing was sent under this permission, and nothing will be: a retry
      // goes back through the confirmation and signs a new one. Holding on to
      // it here would keep a usable permission alive for its whole window over
      // an attempt that is already over.
      this.discardDepositPreparation();
      this.submitting = false;
      this.global.snackBarTip('txFailed', (error as Error)?.message || error);
      return;
    }
    // Spent. The nonce is consumed on chain, so what is being held from here is
    // a permission that can no longer authorise anything — and leaving it where
    // `sendDeposit` reads its authorisation is how a second send comes to pay
    // gas for a transaction that can only revert.
    this.discardDepositPreparation();
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
    // Not confirming inside our patience is not a failure — the transaction is
    // broadcast and may still land, so it stays pending rather than erroring.
    // A revert is the one ending that is final, and it is said plainly.
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
    this.hyperliquid.getAccount(this.address, true).subscribe({
      next: (account) => (this.account = account),
      error: () => (this.accountLoadError = true),
    });
  }

  back() {
    history.go(-1);
  }
}
