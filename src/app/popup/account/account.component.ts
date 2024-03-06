import {
  Component,
  OnInit,
  OnDestroy,
  ViewChild,
  ElementRef,
} from '@angular/core';
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
  UPDATE_NEO2_WALLET_NAME,
  UPDATE_NEO3_WALLET_NAME,
  STORAGE_NAME,
} from '../_lib';
import { Wallet as Wallet2 } from '@cityofzion/neon-core/lib/wallet';
import { Wallet as Wallet3 } from '@cityofzion/neon-core-neo3/lib/wallet';

@Component({
  templateUrl: 'account.component.html',
  styleUrls: ['account.component.scss'],
})
export class PopupAccountComponent implements OnDestroy {
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
  private network: RpcNetwork;
  constructor(
    private global: GlobalService,
    private dialog: MatDialog,
    private chrome: ChromeService,
    private store: Store<AppState>
  ) {
    const account$ = this.store.select('account');
    this.accountSub = account$.subscribe((state) => {
      this.chainType = state.currentChainType;
      this.currentWallet = state.currentWallet;
      this.network =
        state.currentChainType === 'Neo2'
          ? state.n2Networks[state.n2NetworkIndex]
          : state.n3Networks[state.n3NetworkIndex];
      this.currentWIFArr =
        state.currentChainType === 'Neo2' ? state.neo2WIFArr : state.neo3WIFArr;
      this.currentWalletArr =
        state.currentChainType === 'Neo2'
          ? state.neo2WalletArr
          : state.neo3WalletArr;
      this.initData();
    });
  }

  ngOnDestroy(): void {
    this.accountSub?.unsubscribe();
  }

  async initData() {
    this.address = this.currentWallet.accounts[0].address;
    this.inputName = this.currentWallet.name;
    this.isLedger = !!this.currentWallet.accounts[0]?.extra?.ledgerSLIP44;
    if (this.isLedger || this.chainType === 'NeoX') {
      this.publicKey = this.currentWallet.accounts[0]?.extra?.publicKey;
    } else {
      this.publicKey = await this.getPublicKey();
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
      width: 'auto',
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
    const data = {
      address: this.currentWallet.accounts[0].address,
      name: this.inputName,
    };
    if (this.chainType === 'Neo2') {
      this.store.dispatch({
        type: UPDATE_NEO2_WALLET_NAME,
        data,
      });
    } else {
      this.store.dispatch({
        type: UPDATE_NEO3_WALLET_NAME,
        data,
      });
    }
    this.chrome.accountChangeEvent(this.currentWallet.export());
    this.showEditName = false;
    this.global.snackBarTip('nameModifySucc');
  }

  toWeb() {
    switch (this.chainType) {
      case 'Neo2':
        if (this.network.explorer) {
          window.open(`${this.network.explorer}address/${this.address}/page/1`);
        }
        break;
      case 'Neo3':
        if (this.network.explorer) {
          window.open(`${this.network.explorer}address/${this.address}`);
        }
        break;
    }
  }

  private async getPublicKey() {
    const index = this.currentWalletArr.findIndex(
      (item) => item.accounts[0].address === this.address
    );
    const wif = this.currentWIFArr[index];
    if (wif) {
      const walletThis = this.chainType === 'Neo2' ? wallet : wallet3;
      const privateKey = walletThis.getPrivateKeyFromWIF(wif);
      return walletThis.getPublicKeyFromPrivateKey(privateKey);
    }
    const pwd = await this.chrome.getPassword();
    return (this.currentWallet.accounts[0] as any).decrypt(pwd).then((res) => {
      return res.publicKey;
    });
  }
}
