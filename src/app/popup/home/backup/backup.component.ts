import { Component, OnInit, Input } from '@angular/core';
import { Wallet as Wallet2 } from '@cityofzion/neon-core/lib/wallet';
import { Wallet as Wallet3 } from '@cityofzion/neon-core-neo3/lib/wallet';
import { ChromeService } from '@/app/core';
import { STORAGE_NAME } from '../../_lib';

@Component({
  selector: 'app-home-backup',
  templateUrl: 'backup.component.html',
  styleUrls: ['./backup.component.scss'],
})
export class PopupHomeBackupComponent implements OnInit {
  @Input() currentWallet: Wallet2 | Wallet3;
  showBackup: boolean = null;

  showOnePassword: boolean = null;

  constructor(private chrome: ChromeService) {}

  ngOnInit(): void {
    this.chrome.getStorage(STORAGE_NAME.onePassword).subscribe((res) => {
      if (res !== true) {
        this.showOnePassword = true;
      }
    });
    this.chrome.getHaveBackupTip().subscribe((res) => {
      this.showBackup = res;
      if (this.currentWallet?.accounts[0]?.extra?.ledgerSLIP44) {
        this.showBackup = false;
      }
      if (this.showBackup === null) {
        this.chrome
          .getWalletStatus(this.currentWallet?.accounts[0]?.address)
          .subscribe((res) => {
            this.showBackup = !res;
          });
      }
    });
  }

  backupLater() {
    this.chrome.setHaveBackupTip(false);
    this.showBackup = false;
  }

  switchOneLater() {
    this.chrome.setStorage(STORAGE_NAME.onePassword, false);
    this.showOnePassword = false;
  }
}
