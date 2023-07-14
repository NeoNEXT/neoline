import { Component, OnInit, OnDestroy } from '@angular/core';
import { GlobalService, ChromeService, UtilServiceState } from '@/app/core';
import { Store } from '@ngrx/store';
import { AppState } from '@/app/reduers';
import { Unsubscribable } from 'rxjs';

declare var QRCode: any;

@Component({
  templateUrl: 'backup-key.component.html',
  styleUrls: ['backup-key.component.scss'],
})
export class PopupBackupKeyComponent implements OnDestroy {
  WIF = '';
  private accountSub: Unsubscribable;
  private address: string;
  private qrcodeDom;
  constructor(
    private global: GlobalService,
    private chrome: ChromeService,
    private util: UtilServiceState,
    private store: Store<AppState>
  ) {
    const account$ = this.store.select('account');
    this.accountSub = account$.subscribe((state) => {
      this.address = state.currentWallet?.accounts[0]?.address;
      const chain = state.currentChainType;
      const currentWIFArr =
        chain === 'Neo2' ? state.neo2WIFArr : state.neo3WIFArr;
      const currentWalletArr =
        chain === 'Neo2' ? state.neo2WalletArr : state.neo3WalletArr;
      this.showKeyQrCode(currentWIFArr, currentWalletArr, state.currentWallet);
    });
  }

  ngOnDestroy(): void {
    this.accountSub?.unsubscribe();
  }

  private async showKeyQrCode(WIFArr: string[], walletArr, currentWallet) {
    this.WIF = await this.util.getWIF(WIFArr, walletArr, currentWallet);
    this.updateWalletStatus();
    if (QRCode) {
      setTimeout(() => {
        if (this.qrcodeDom) {
          this.qrcodeDom.clear();
          this.qrcodeDom.makeCode(this.WIF);
        } else {
          this.qrcodeDom = new QRCode('key-qrcode', {
            text: this.WIF,
            width: 170,
            height: 170,
            colorDark: '#000',
            colorLight: '#ffffff',
            correctLevel: QRCode.CorrectLevel.H,
          });
        }
      }, 0);
    }
  }

  private updateWalletStatus() {
    this.chrome.setHaveBackupTip(false);
    this.chrome.setWalletsStatus(this.address);
  }
}
