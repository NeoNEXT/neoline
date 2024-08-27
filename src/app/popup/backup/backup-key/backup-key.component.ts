import { Component, Input } from '@angular/core';
import { Router } from '@angular/router';
import { Wallet as Wallet2 } from '@cityofzion/neon-core/lib/wallet';
import { Wallet as Wallet3 } from '@cityofzion/neon-core-neo3/lib/wallet';
import {
  ChainType,
  UPDATE_NEO2_WALLET_BACKUP_STATUS,
  UPDATE_NEO3_WALLET_BACKUP_STATUS,
  UPDATE_WALLET,
} from '../../_lib';
import { AppState } from '@/app/reduers';
import { Store } from '@ngrx/store';

declare var QRCode: any;

@Component({
  selector: 'backup-key',
  templateUrl: 'backup-key.component.html',
  styleUrls: ['backup-key.component.scss'],
})
export class PopupBackupKeyComponent {
  @Input() WIF: string;
  @Input() chainType: ChainType;
  @Input() currentWallet: Wallet2 | Wallet3;
  private qrcodeDom;

  constructor(private router: Router, private store: Store<AppState>) {
    this.showKeyQrCode();
  }

  private async showKeyQrCode() {
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

  complete() {
    this.currentWallet.accounts[0].extra.hasBackup = true;
    this.store.dispatch({ type: UPDATE_WALLET, data: this.currentWallet });
    const data = { address: this.currentWallet.accounts[0].address };
    switch (this.chainType) {
      case 'Neo2':
        this.store.dispatch({ type: UPDATE_NEO2_WALLET_BACKUP_STATUS, data });
        break;
      case 'Neo3':
        this.store.dispatch({ type: UPDATE_NEO3_WALLET_BACKUP_STATUS, data });
        break;
    }
    this.router.navigateByUrl('/popup/home');
  }
}
