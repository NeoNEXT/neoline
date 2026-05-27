import { Component, OnDestroy } from '@angular/core';
import { MatDialog } from '@angular/material/dialog';
import { PopupBackupTipDialogComponent } from '../_dialogs';
import { AppState } from '@/app/reduers';
import { Store } from '@ngrx/store';
import { ChainType } from '../_lib';
import { EvmWalletJSON } from '../_lib/evm';
import { Unsubscribable } from 'rxjs';
import { ethers } from 'ethers';
import { ChromeService, EvmWalletService, GlobalService } from '@/app/core';
import { Wallet as Wallet2 } from '@cityofzion/neon-core/lib/wallet';
import { Wallet3 } from '@popup/_lib';

@Component({
  templateUrl: 'backup.component.html',
  styleUrls: ['backup.component.scss'],
})
export class PopupBackupComponent implements OnDestroy {
  private accountSub: Unsubscribable;
  chainType: ChainType;
  mnemonic: string;
  WIF = '';
  currentWallet: Wallet2 | Wallet3 | EvmWalletJSON;
  pageState: 'tip' | 'privateKey' | 'mnemonic' = 'tip';

  constructor(
    private store: Store<AppState>,
    private dialog: MatDialog,
    private chrome: ChromeService,
    private evmWalletService: EvmWalletService,
    private global: GlobalService
  ) {
    const account$ = this.store.select('account');
    this.accountSub = account$.subscribe((state) => {
      this.chainType = state.currentChainType;
      this.currentWallet = state.currentWallet;
      if (this.isMnemonicWallet(this.currentWallet)) {
        this.getMnemonic(this.currentWallet);
        return;
      }
      if (this.chainType === 'Neo2') {
        this.global
          .getWIF(state.neo2WIFArr, state.neo2WalletArr, state.currentWallet)
          .then((wif) => {
            this.WIF = wif;
          });
      }
      if (this.chainType === 'Neo3') {
        this.global
          .getWIF(state.neo3WIFArr, state.neo3WalletArr, state.currentWallet)
          .then((wif) => {
            this.WIF = wif;
          });
      }
    });
  }

  ngOnDestroy(): void {
    this.accountSub?.unsubscribe();
  }

  backup() {
    this.dialog
      .open(PopupBackupTipDialogComponent, {
        panelClass: 'custom-dialog-panel',
        backdropClass: 'custom-dialog-backdrop',
        disableClose: true,
      })
      .afterClosed()
      .subscribe((confirm) => {
        if (confirm) {
          if (this.isMnemonicWallet(this.currentWallet)) {
            this.pageState = 'mnemonic';
          } else {
            this.pageState = 'privateKey';
          }
        }
      });
  }

  private getMnemonic(currentWallet: Wallet2 | Wallet3 | EvmWalletJSON) {
    if (this.chainType === 'NeoX') {
      this.chrome.getPassword().then((pwd) => {
        this.evmWalletService
          .getMnemonicPhrase(currentWallet as EvmWalletJSON, pwd)
          .then((mnemonic) => {
            this.mnemonic = mnemonic;
          })
          .catch((err) => {
            this.global.log('get mnemonic failed', err);
            this.mnemonic = '';
          });
      });
      return;
    }
    const encryptedJson =
      currentWallet.accounts[0]?.extra?.encryptedJson || '';
    if (!encryptedJson) {
      this.mnemonic = '';
      return;
    }
    this.chrome.getPassword().then((pwd) => {
      ethers.Wallet.fromEncryptedJson(encryptedJson, pwd)
        .then((res: ethers.HDNodeWallet) => {
          this.mnemonic = res.mnemonic?.phrase || '';
        })
        .catch((err) => {
          this.global.log('get mnemonic failed', err);
          this.mnemonic = '';
        });
    });
  }

  private isMnemonicWallet(wallet: Wallet2 | Wallet3 | EvmWalletJSON): boolean {
    return wallet?.accounts[0]?.extra?.isHDWallet === true;
  }
}
