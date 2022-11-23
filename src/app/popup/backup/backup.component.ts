import { Component, OnInit, OnDestroy } from '@angular/core';
import { MatDialog } from '@angular/material/dialog';
import { PopupBackupTipDialogComponent } from '../_dialogs';
import { GlobalService, ChromeService } from '@/app/core';
import { Store } from '@ngrx/store';
import { AppState } from '@/app/reduers';
import { Unsubscribable } from 'rxjs';

declare var QRCode: any;

@Component({
  templateUrl: 'backup.component.html',
  styleUrls: ['backup.component.scss'],
})
export class PopupBackupComponent implements OnInit, OnDestroy {
  showKey = false;
  WIF = '';
  private accountSub: Unsubscribable;
  private address: string;
  constructor(
    private global: GlobalService,
    private dialog: MatDialog,
    private chrome: ChromeService,
    private store: Store<AppState>
  ) {
    const account$ = this.store.select('account');
    this.accountSub = account$.subscribe((state) => {
      this.address = state.currentWallet.accounts[0].address;
      const chain = state.currentChainType;
      const currentWIFArr =
        chain === 'Neo2' ? state.neo2WIFArr : state.neo3WIFArr;
      const currentWalletArr =
        chain === 'Neo2' ? state.neo2WalletArr : state.neo3WalletArr;
      this.WIF =
        currentWIFArr[
          currentWalletArr.findIndex(
            (item) => item.accounts[0].address === this.address
          )
        ];
    });
  }

  ngOnInit(): void {}

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
          this.showKey = true;
          this.showKeyQrCode();
        }
      });
  }

  showKeyQrCode() {
    this.updateWalletStatus();
    if (QRCode) {
      setTimeout(() => {
        const qrcode = new QRCode('key-qrcode', {
          text: this.WIF,
          width: 140,
          height: 140,
          colorDark: '#333333',
          colorLight: '#ffffff',
          correctLevel: QRCode.CorrectLevel.H,
        });
      }, 0);
    }
  }

  copy() {
    const input = document.createElement('input');
    input.setAttribute('readonly', 'readonly');
    input.setAttribute('value', this.WIF);
    document.body.appendChild(input);
    input.select();
    if (document.execCommand('copy')) {
      document.execCommand('copy');
      this.global.snackBarTip('copied');
    }
    document.body.removeChild(input);
  }

  updateWalletStatus() {
    this.chrome.setHaveBackupTip(false);
    this.chrome.setWalletsStatus(this.address);
  }
}
