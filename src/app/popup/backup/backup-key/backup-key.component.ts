import { Component, Input, SimpleChanges } from '@angular/core';
import { ChromeService } from '@/app/core';
import { Router } from '@angular/router';

declare var QRCode: any;

@Component({
  selector: 'backup-key',
  templateUrl: 'backup-key.component.html',
  styleUrls: ['backup-key.component.scss'],
})
export class PopupBackupKeyComponent {
  @Input() WIF: string;
  @Input() currentAddress: string;
  private qrcodeDom;

  constructor(private chrome: ChromeService, private router: Router) {
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
    this.chrome.setHaveBackupTip(false);
    this.chrome.setWalletsStatus(this.currentAddress);
    this.router.navigateByUrl('/popup/home');
  }
}
