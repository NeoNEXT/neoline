import { Component, OnDestroy, OnInit } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { Store } from '@ngrx/store';
import { Observable, Unsubscribable } from 'rxjs';
import { ethers } from 'ethers';
import BigNumber from 'bignumber.js';

import { AppState } from '@/app/reduers';
import {
  ChromeService,
  EvmWalletService,
  GlobalService,
} from '@/app/core';
import { HyperliquidService } from '@/app/core/services/perps/hyperliquid.service';
import { abiERC20 } from '@popup/_lib';
import { EvmWalletJSON } from '@popup/_lib/evm';
import {
  PerpsAccount,
  PerpsDepositConfig,
  PERPS_MIN_DEPOSIT,
  PERPS_MIN_WITHDRAW,
  PERPS_WITHDRAW_FEE,
} from '@popup/_lib/perps';
import { formatUsd } from '../perps.util';

type FundingTab = 'deposit' | 'withdraw' | 'transfer';

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
  /** Balance of the source token in the wallet, for the deposit side. */
  walletBalance = 0;
  /** Exact decimal balance used by MAX so ERC-20 base units never pass through Number. */
  private walletBalanceExact = '0';
  submitting = false;
  accountLoadError = false;
  accountLoading = true;

  readonly minDeposit = PERPS_MIN_DEPOSIT;
  readonly minWithdraw = PERPS_MIN_WITHDRAW;
  readonly withdrawFee = PERPS_WITHDRAW_FEE;
  readonly depositPresets = [50, 100, 200];
  readonly withdrawPercents = [10, 25, 50];

  formatUsd = formatUsd;

  private address: string;
  private wallet: EvmWalletJSON;
  /** Config the current account/balance data was loaded with. */
  private loadedConfig: PerpsDepositConfig;
  private accountSub: Unsubscribable;

  constructor(
    private route: ActivatedRoute,
    private store: Store<AppState>,
    private global: GlobalService,
    private hyperliquid: HyperliquidService,
    private chrome: ChromeService,
    private evmWallet: EvmWalletService
  ) {}

  ngOnInit() {
    const tab = this.route.snapshot.queryParams.tab;
    if (tab === 'withdraw') {
      this.tab = 'withdraw';
    } else if (tab === 'transfer') {
      this.tab = 'transfer';
    }
    this.accountSub = this.store.select('account').subscribe((state) => {
      const address = state.currentWallet?.accounts[0]?.address;
      this.wallet = state.currentWallet as EvmWalletJSON;
      if (
        address &&
        (address !== this.address || this.token !== this.loadedConfig)
      ) {
        this.address = address;
        this.loadedConfig = this.token;
        const config = this.token;
        this.accountLoadError = false;
        this.accountLoading = true;
        this.hyperliquid.getAccount(address).subscribe({
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
        this.loadWalletBalance(address);
      }
    });
  }

  /** Deposit chain/token for the configured Perps network. */
  get token(): PerpsDepositConfig {
    return this.hyperliquid.depositConfig;
  }

  /** Deposits come from the bridge's USDC on Arbitrum, so the balance is read there. */
  private async loadWalletBalance(address: string) {
    const config = this.token;
    this.walletBalance = 0;
    this.walletBalanceExact = '0';
    try {
      const provider = new ethers.JsonRpcProvider(config.rpc);
      const usdc = new ethers.Contract(config.address, abiERC20, provider);
      const balance = await usdc.balanceOf(address);
      // A wallet switch may have superseded this request.
      if (config !== this.token || address !== this.address) {
        return;
      }
      this.walletBalanceExact = ethers.formatUnits(balance, config.decimals);
      this.walletBalance = Number(this.walletBalanceExact);
    } catch (e) {
      this.walletBalance = 0;
      this.walletBalanceExact = '0';
    }
  }

  ngOnDestroy() {
    this.accountSub?.unsubscribe();
  }

  get isDeposit(): boolean {
    return this.tab === 'deposit';
  }

  get isWithdraw(): boolean {
    return this.tab === 'withdraw';
  }

  get isTransfer(): boolean {
    return this.tab === 'transfer';
  }

  get showTransfer(): boolean {
    return !!this.account && !this.account.unified && this.account.spotUsdc > 0;
  }

  get unsupportedAccountMode(): boolean {
    return this.account?.abstractionMode === 'portfolioMargin';
  }

  /** Exact source balance for MAX and balance checks. */
  private get maxAmountExact(): string {
    return this.isDeposit
      ? this.walletBalanceExact
      : this.isTransfer
      ? this.account?.spotUsdcExact ?? String(this.account?.spotUsdc || 0)
      : this.account?.availableBalanceExact ??
          String(this.account?.availableBalance || 0);
  }

  get amountNumber(): number {
    const amount = Number(this.amount);
    return Number.isFinite(amount) ? amount : 0;
  }

  get receiveAmount(): number {
    const net =
      this.amountNumber - (this.isWithdraw ? this.withdrawFee : 0);
    return net > 0 ? net : 0;
  }

  get minimumAmount(): number {
    return this.isDeposit ? this.minDeposit : this.minWithdraw;
  }

  get belowMinimum(): boolean {
    if (!this.hasPositiveAmount) {
      return false;
    }
    if (this.isTransfer) {
      return false;
    }
    return new BigNumber(this.amount).isLessThan(this.minimumAmount);
  }

  get exceedsBalance(): boolean {
    return (
      this.hasPositiveAmount &&
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
      (!this.isDeposit || this.walletBalance > 0)
    );
  }

  setTab(tab: FundingTab) {
    if (this.tab === tab) {
      return;
    }
    this.tab = tab;
    this.amount = null;
    this.activePreset = null;
  }

  setPreset(value: number) {
    this.activePreset = value;
    this.amount = String(value);
  }

  setPercent(percent: number) {
    this.activePreset = percent;
    this.amount = this.floorAmount(
      new BigNumber(this.maxAmountExact).times(percent).dividedBy(100)
    );
  }

  setMax() {
    this.activePreset = -1;
    this.amount = this.maxAmountExact;
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
  }

  async submit() {
    if (!this.canSubmit) {
      return;
    }
    const walletExtra = this.wallet?.accounts[0]?.extra;
    if (walletExtra?.ledgerSLIP44 || walletExtra?.qrBasedXFP) {
      this.global.snackBarTip('perpsSigningUnavailable');
      return;
    }
    this.submitting = true;
    try {
      const password = await this.chrome.getPassword();
      const privateKey = await this.evmWallet.getPrivateKey(
        this.wallet,
        password
      );
      const request: Observable<unknown> = this.isDeposit
        ? this.hyperliquid.deposit(privateKey, this.submissionAmount)
        : this.isTransfer
        ? this.hyperliquid.transferUsdClass(
            privateKey,
            this.submissionAmount,
            true
          )
        : this.hyperliquid.withdraw(
            privateKey,
            this.address,
            this.submissionAmount
          );
      request.subscribe({
        next: () => {
          this.submitting = false;
          this.global.snackBarTip(
            this.isDeposit
              ? 'perpsDepositSubmitted'
              : this.isTransfer
              ? 'perpsTransferSubmitted'
              : 'perpsWithdrawSuccess'
          );
          this.amount = null;
          this.activePreset = null;
          this.hyperliquid.getAccount(this.address).subscribe({
            next: (account) => (this.account = account),
            error: () => (this.accountLoadError = true),
          });
          if (this.isDeposit) {
            this.loadWalletBalance(this.address);
          }
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

  back() {
    history.go(-1);
  }
}
