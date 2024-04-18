import { Component, OnDestroy } from '@angular/core';
import { MatDialog } from '@angular/material/dialog';
import { PopupBackupTipDialogComponent } from '../_dialogs';
import { AppState } from '@/app/reduers';
import { Store } from '@ngrx/store';
import { ChainType } from '../_lib';
import { EvmWalletJSON } from '../_lib/evm';
import { Unsubscribable } from 'rxjs';
import { ethers, HDNodeWallet } from 'ethers';
import { ChromeService, UtilServiceState } from '@/app/core';

@Component({
  templateUrl: 'backup.component.html',
  styleUrls: ['backup.component.scss'],
})
export class PopupBackupComponent implements OnDestroy {
  private accountSub: Unsubscribable;
  private chainType: ChainType;
  mnemonic: string;
  WIF = '';
  currentAddress: string;
  pageState: 'tip' | 'privateKey' | 'mnemonic' = 'tip';

  constructor(
    private store: Store<AppState>,
    private dialog: MatDialog,
    private chrome: ChromeService,
    private util: UtilServiceState
  ) {
    const account$ = this.store.select('account');
    this.accountSub = account$.subscribe((state) => {
      this.chainType = state.currentChainType;
      this.currentAddress = state.currentWallet?.accounts[0]?.address;
      if (this.chainType === 'Neo2') {
        this.util
          .getWIF(state.neo2WIFArr, state.neo2WalletArr, state.currentWallet)
          .then((wif) => {
            this.WIF = wif;
          });
      }
      if (this.chainType === 'Neo3') {
        this.util
          .getWIF(state.neo3WIFArr, state.neo3WalletArr, state.currentWallet)
          .then((wif) => {
            this.WIF = wif;
          });
      }
      if (this.chainType === 'NeoX') {
        this.getMnemonic(state.neoXWalletArr);
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
        disableClose: true,
      })
      .afterClosed()
      .subscribe((confirm) => {
        if (confirm) {
          if (this.chainType === 'NeoX') {
            this.pageState = 'mnemonic';
          } else {
            this.pageState = 'privateKey';
          }
        }
      });
  }

  private getMnemonic(neoXWalletArr: EvmWalletJSON[]) {
    const createWallet = neoXWalletArr.find(
      (item) => item.accounts[0].extra.isHDWallet
    );
    this.chrome.getPassword().then((pwd) => {
      ethers.Wallet.fromEncryptedJson(JSON.stringify(createWallet), pwd).then(
        (res: HDNodeWallet) => {
          this.mnemonic = res.mnemonic.phrase;
        }
      );
    });
  }
}
