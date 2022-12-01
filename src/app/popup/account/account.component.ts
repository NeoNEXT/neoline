import {
  Component,
  OnInit,
  OnDestroy,
  ViewChild,
  ElementRef,
} from '@angular/core';
import { Router } from '@angular/router';
import { MatDialog } from '@angular/material/dialog';

import {
  PopupQRCodeDialogComponent,
  PopupPrivateKeyComponent,
} from '@popup/_dialogs';

import { GlobalService, ChromeService } from '@app/core';
import { wallet } from '@cityofzion/neon-core';
import { wallet as wallet3 } from '@cityofzion/neon-core-neo3';
import { Store } from '@ngrx/store';
import { AppState } from '@/app/reduers';
import { Unsubscribable } from 'rxjs';
import {
  ChainType,
  RpcNetwork,
  UPDATE_WALLET,
  UPDATE_NEO2_WALLETS,
  UPDATE_NEO3_WALLETS,
} from '../_lib';
import { Wallet as Wallet2 } from '@cityofzion/neon-core/lib/wallet';
import { Wallet as Wallet3 } from '@cityofzion/neon-core-neo3/lib/wallet';

@Component({
  templateUrl: 'account.component.html',
  styleUrls: ['account.component.scss'],
})
export class PopupAccountComponent implements OnInit, OnDestroy {
  @ViewChild('inputDom') inputDom: ElementRef;
  publicKey: string;
  isLedger = false;
  showEditName = false;
  inputName = '';

  private accountSub: Unsubscribable;
  public address: string;
  currentWallet: Wallet2 | Wallet3;
  private chainType: ChainType;
  private currentWIFArr: string[];
  private currentWalletArr: Array<Wallet2 | Wallet3>;
  private n2Network: RpcNetwork;
  private n3Network: RpcNetwork;
  private neo2WalletArr: Wallet2[];
  private neo3WalletArr: Wallet3[];
  constructor(
    private router: Router,
    private global: GlobalService,
    private dialog: MatDialog,
    private chrome: ChromeService,
    private store: Store<AppState>
  ) {
    const account$ = this.store.select('account');
    this.accountSub = account$.subscribe((state) => {
      this.chainType = state.currentChainType;
      this.currentWallet = state.currentWallet;
      this.inputName = this.currentWallet.name;
      this.address = state.currentWallet.accounts[0].address;
      this.n2Network = state.n2Networks[state.n2NetworkIndex];
      this.n3Network = state.n3Networks[state.n3NetworkIndex];
      this.isLedger = !!this.currentWallet.accounts[0]?.extra?.ledgerSLIP44;
      this.currentWIFArr =
        this.chainType === 'Neo2' ? state.neo2WIFArr : state.neo3WIFArr;
      this.currentWalletArr =
        this.chainType === 'Neo2' ? state.neo2WalletArr : state.neo3WalletArr;
      this.neo2WalletArr = state.neo2WalletArr;
      this.neo3WalletArr = state.neo3WalletArr;
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
    return this.dialog.open(PopupPrivateKeyComponent, {
      panelClass: 'custom-dialog-panel',
      data: { currentWallet: this.currentWallet, chainType: this.chainType },
    });
  }

  public qrcode() {
    return this.dialog.open(PopupQRCodeDialogComponent, {
      panelClass: 'custom-dialog-panel',
      data: this.address,
    });
  }

  editName() {
    this.showEditName = true;
    setTimeout(() => {
      this.inputDom.nativeElement.focus();
    }, 100);
  }

  updateName() {
    if (
      this.inputName.trim() === '' ||
      this.currentWallet.name === this.inputName
    ) {
      this.showEditName = false;
      return;
    }
    this.currentWallet.name = this.inputName;
    this.store.dispatch({ type: UPDATE_WALLET, data: this.currentWallet });
    if (this.chainType === 'Neo2') {
      this.neo2WalletArr.find(
        (item) =>
          item.accounts[0].address === this.currentWallet.accounts[0].address
      ).name = this.inputName;
      this.store.dispatch({
        type: UPDATE_NEO2_WALLETS,
        data: this.neo2WalletArr,
      });
    } else {
      this.neo3WalletArr.find(
        (item) =>
          item.accounts[0].address === this.currentWallet.accounts[0].address
      ).name = this.inputName;
      this.store.dispatch({
        type: UPDATE_NEO3_WALLETS,
        data: this.neo3WalletArr,
      });
    }
    this.chrome.setWallet(this.currentWallet.export());
    this.showEditName = false;
    this.global.snackBarTip('nameModifySucc');
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
