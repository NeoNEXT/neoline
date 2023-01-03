import { Component, OnInit, OnDestroy } from '@angular/core';
import { GlobalService, ChromeService } from '@/app/core';
import { Store } from '@ngrx/store';
import { AppState } from '@/app/reduers';
import { Unsubscribable } from 'rxjs';

declare var QRCode: any;

@Component({
  templateUrl: 'backup-key.component.html',
  styleUrls: ['backup-key.component.scss'],
})
export class PopupBackupKeyComponent implements OnInit, OnDestroy {
  WIF = '';
  private accountSub: Unsubscribable;
  private address: string;
  constructor(
    private global: GlobalService,
    private chrome: ChromeService,
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
      this.WIF =
        currentWIFArr[
          currentWalletArr.findIndex(
            (item) => item.accounts[0].address === this.address
          )
        ];
      this.showKeyQrCode();
    });
  }

  ngOnInit(): void {}

  ngOnDestroy(): void {
    this.accountSub?.unsubscribe();
  }

  private showKeyQrCode() {
    this.updateWalletStatus();
    if (QRCode) {
      setTimeout(() => {
        const qrcode = new QRCode('key-qrcode', {
          text: this.WIF,
          width: 170,
          height: 170,
          colorDark: '#000',
          colorLight: '#ffffff',
          correctLevel: QRCode.CorrectLevel.H,
        });
      }, 0);
    }
  }


  private updateWalletStatus() {
    this.chrome.setHaveBackupTip(false);
    this.chrome.setWalletsStatus(this.address);
  }
}
