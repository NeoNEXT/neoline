import { Component, OnDestroy, OnInit } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { Store } from '@ngrx/store';
import { Observable, Unsubscribable } from 'rxjs';
import { ethers } from 'ethers';

import { AppState } from '@/app/reduers';
import {
  ChromeService,
  EvmWalletService,
  GlobalService,
  HyperliquidService,
} from '@/app/core';
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
  amount: number = null;
  activePreset: number = null;

  account: PerpsAccount;
  /** Balance of the source token in the wallet, for the deposit side. */
  walletBalance = 0;
  submitting = false;

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
        this.hyperliquid.getAccount(address).subscribe((account) => {
          if (config === this.token && address === this.address) {
            this.account = account;
          }
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
    try {
      const provider = new ethers.JsonRpcProvider(config.rpc);
      const usdc = new ethers.Contract(config.address, abiERC20, provider);
      const balance = await usdc.balanceOf(address);
      // A wallet switch may have superseded this request.
      if (config !== this.token || address !== this.address) {
        return;
      }
      this.walletBalance = Number(
        ethers.formatUnits(balance, config.decimals)
      );
    } catch (e) {
      this.walletBalance = 0;
    }
  }

  ngOnDestroy() {
    this.accountSub?.unsubscribe();
  }

  get isDeposit(): boolean {
    return this.tab === 'deposit';
  }

  /** Ceiling for the current direction: wallet balance in, free collateral out. */
  get maxAmount(): number {
    return this.isDeposit
      ? this.walletBalance
      : this.account?.availableBalance || 0;
  }

  get receiveAmount(): number {
    const net = (this.amount || 0) - this.withdrawFee;
    return net > 0 ? net : 0;
  }

  get belowMinimum(): boolean {
    if (!this.amount) {
      return false;
    }
    return this.amount < (this.isDeposit ? this.minDeposit : this.minWithdraw);
  }

  get exceedsBalance(): boolean {
    return !!this.amount && this.amount > this.maxAmount;
  }

  get canSubmit(): boolean {
    return (
      this.amount > 0 &&
      !this.submitting &&
      !this.belowMinimum &&
      !this.exceedsBalance &&
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
    this.amount = value;
  }

  setPercent(percent: number) {
    this.activePreset = percent;
    this.amount = Number(((this.maxAmount * percent) / 100).toFixed(2));
  }

  setMax() {
    this.activePreset = -1;
    this.amount = Number(this.maxAmount.toFixed(2));
  }

  onAmountChange() {
    this.activePreset = null;
  }

  async submit() {
    if (!this.canSubmit) {
      return;
    }
    if (this.wallet?.accounts[0]?.extra?.ledgerSLIP44) {
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
        ? this.hyperliquid.deposit(privateKey, this.amount)
        : this.hyperliquid.withdraw(privateKey, this.address, this.amount);
      request.subscribe({
        next: () => {
          this.submitting = false;
          this.global.snackBarTip(
            this.isDeposit
              ? 'perpsDepositSubmitted'
              : 'perpsWithdrawSubmitted'
          );
          this.amount = null;
          this.activePreset = null;
          this.hyperliquid.getAccount(this.address).subscribe((account) => {
            this.account = account;
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
