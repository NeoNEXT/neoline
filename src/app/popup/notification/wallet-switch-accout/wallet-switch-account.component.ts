import { Component, OnInit } from '@angular/core';
import { ChromeService } from '@/app/core';
import { ActivatedRoute } from '@angular/router';
import { ERRORS, requestTarget } from '@/models/dapi';
import { ChainType, UPDATE_WALLET } from '../../_lib';
import { requestTargetN3 } from '@/models/dapi_neo3';
import { AppState } from '@/app/reduers';
import { Store } from '@ngrx/store';
import { Unsubscribable } from 'rxjs';
import { Wallet as Wallet2 } from '@cityofzion/neon-core/lib/wallet';
import { Wallet as Wallet3 } from '@cityofzion/neon-core-neo3/lib/wallet';

@Component({
  templateUrl: './wallet-switch-account.component.html',
  styleUrls: ['./wallet-switch-account.component.scss'],
})
export class PopupWalletSwitchAccountComponent implements OnInit {
  iconSrc = '';
  hostname = '';
  invokeChainType: ChainType = 'Neo2';
  private messageID = '';
  selectedWallet: Wallet2 | Wallet3;

  private accountSub: Unsubscribable;
  currentWallet: Wallet2 | Wallet3;
  walletArr: Array<Wallet2 | Wallet3>;
  constructor(
    private chrome: ChromeService,
    private aRouter: ActivatedRoute,
    private store: Store<AppState>
  ) {
    const account$ = this.store.select('account');
    this.accountSub = account$.subscribe((state) => {
      this.currentWallet = state.currentWallet;
      const chainType = state.currentChainType;
      this.walletArr =
        chainType === 'Neo2' ? state.neo2WalletArr : state.neo3WalletArr;
    });
    this.aRouter.queryParams.subscribe((params: any) => {
      this.messageID = params.messageID;
      this.invokeChainType = params.chainType;
      this.hostname = params.hostname;
      this.iconSrc =
        this.hostname.indexOf('flamingo') >= 0
          ? '/assets/images/flamingo.ico'
          : params.icon;
    });
  }

  ngOnInit() {
    window.onbeforeunload = () => {
      this.chrome.windowCallback({
        error: ERRORS.CANCELLED,
        ID: this.messageID,
        return:
          this.invokeChainType === 'Neo2'
            ? requestTarget.WalletSwitchAccount
            : requestTargetN3.WalletSwitchAccount,
      });
    };
  }

  refuse() {
    this.chrome.windowCallback(
      {
        error: ERRORS.CANCELLED,
        ID: this.messageID,
        return:
          this.invokeChainType === 'Neo2'
            ? requestTarget.WalletSwitchAccount
            : requestTargetN3.WalletSwitchAccount,
      },
      true
    );
  }

  confirm() {
    if (
      this.selectedWallet.accounts[0].address ===
      this.currentWallet.accounts[0].address
    ) {
      this.chrome.windowCallback(
        {
          data: null,
          ID: this.messageID,
          return:
            this.invokeChainType === 'Neo2'
              ? requestTarget.WalletSwitchAccount
              : requestTargetN3.WalletSwitchAccount,
        },
        true
      );
      return;
    }
    this.store.dispatch({
      type: UPDATE_WALLET,
      data: this.selectedWallet,
    });
    this.chrome.accountChangeEvent(this.selectedWallet);
    this.chrome.windowCallback(
      {
        data: {
          address: this.selectedWallet.accounts[0].address,
          label: this.selectedWallet.name,
          isLedger: !!this.selectedWallet.accounts[0]?.extra?.ledgerSLIP44,
        },
        ID: this.messageID,
        return:
          this.invokeChainType === 'Neo2'
            ? requestTarget.WalletSwitchAccount
            : requestTargetN3.WalletSwitchAccount,
      },
      true
    );
  }
}
