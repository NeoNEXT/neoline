import { Component, OnInit, OnDestroy } from '@angular/core';
import { Router } from '@angular/router';
import { MatDialog } from '@angular/material/dialog';

import { PopupQRCodeDialogComponent } from '@popup/_dialogs';
import { PopupNameDialogComponent } from '@popup/_dialogs';

import { GlobalService } from '@app/core';
import { wallet } from '@cityofzion/neon-core';
import { wallet as wallet3 } from '@cityofzion/neon-core-neo3';
import { Store } from '@ngrx/store';
import { AppState } from '@/app/reduers';
import { Unsubscribable } from 'rxjs';
import { ChainType, RpcNetwork } from '../_lib';
import { Wallet as Wallet2 } from '@cityofzion/neon-core/lib/wallet';
import { Wallet as Wallet3 } from '@cityofzion/neon-core-neo3/lib/wallet';

@Component({
  templateUrl: 'account.component.html',
  styleUrls: ['account.component.scss'],
})
export class PopupAccountComponent implements OnInit, OnDestroy {
  publicKey: string;
  isLedger = false;

  private accountSub: Unsubscribable;
  public address: string;
  currentWallet: Wallet2 | Wallet3;
  private chainType: ChainType;
  private currentWIFArr: string[];
  private currentWalletArr: Array<Wallet2 | Wallet3>;
  private n2Network: RpcNetwork;
  private n3Network: RpcNetwork;
  constructor(
    private router: Router,
    private global: GlobalService,
    private dialog: MatDialog,
    private store: Store<AppState>
  ) {
    const account$ = this.store.select('account');
    this.accountSub = account$.subscribe((state) => {
      this.chainType = state.currentChainType;
      this.currentWallet = state.currentWallet;
      this.address = state.currentWallet.accounts[0].address;
      this.n2Network = state.n2Networks[state.n2NetworkIndex];
      this.n3Network = state.n3Networks[state.n3NetworkIndex];
      this.isLedger = !!this.currentWallet.accounts[0]?.extra?.ledgerSLIP44;
      this.currentWIFArr =
        this.chainType === 'Neo2' ? state.neo2WIFArr : state.neo3WIFArr;
      this.currentWalletArr =
        this.chainType === 'Neo2' ? state.neo2WalletArr : state.neo3WalletArr;
      this.getPublicKey();
    });
  }

  ngOnInit(): void {}

  ngOnDestroy(): void {
    this.accountSub?.unsubscribe();
  }

  getPublicKey() {
    const wif =
      this.currentWIFArr[
        this.currentWalletArr.findIndex(
          (item) => item.accounts[0].address === this.address
        )
      ];
    const walletThis = this.chainType === 'Neo2' ? wallet : wallet3;
    if (this.isLedger) {
      this.publicKey = this.currentWallet.accounts[0]?.extra?.publicKey;
    } else {
      const privateKey = walletThis.getPrivateKeyFromWIF(wif);
      this.publicKey = walletThis.getPublicKeyFromPrivateKey(privateKey);
    }
  }

  public wif() {
    this.router.navigate([
      {
        outlets: {
          transfer: ['transfer', 'export'],
        },
      },
    ]);
  }

  public qrcode() {
    return this.dialog.open(PopupQRCodeDialogComponent, {
      data: this.address,
    });
  }

  public updateName() {
    return this.dialog.open(PopupNameDialogComponent, {
      panelClass: 'custom-dialog-panel',
    });
  }

  toWeb() {
    switch (this.chainType) {
      case 'Neo2':
        if (this.n2Network.explorer) {
          window.open(
            `${this.n2Network.explorer}address/${this.address}/page/1`
          );
        }
        break;
      case 'Neo3':
        if (this.n3Network.explorer) {
          window.open(`${this.n3Network.explorer}address/${this.address}`);
        }
        break;
    }
  }

  copy(message: string) {
    const input = document.createElement('input');
    input.setAttribute('readonly', 'readonly');
    input.setAttribute('value', message);
    document.body.appendChild(input);
    input.select();
    if (document.execCommand('copy')) {
      document.execCommand('copy');
      this.global.snackBarTip('copied');
    }
    document.body.removeChild(input);
  }
}
