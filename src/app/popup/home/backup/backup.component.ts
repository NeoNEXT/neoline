import { Component, OnInit, Input, OnDestroy } from '@angular/core';
import { Wallet as Wallet2 } from '@cityofzion/neon-core/lib/wallet';
import { Wallet as Wallet3 } from '@cityofzion/neon-core-neo3/lib/wallet';
import { ChromeService, SettingState } from '@/app/core';
import { STORAGE_NAME } from '../../_lib';
import { Unsubscribable } from 'rxjs';

@Component({
  selector: 'app-home-backup',
  templateUrl: 'backup.component.html',
  styleUrls: ['./backup.component.scss'],
})
export class PopupHomeBackupComponent implements OnInit, OnDestroy {
  @Input() currentWallet: Wallet2 | Wallet3;
  showBackup: boolean = null;

  showOnePassword: boolean = null;
  settingStateSub: Unsubscribable;

  constructor(
    private chrome: ChromeService,
    private settingState: SettingState
  ) {}

  ngOnDestroy(): void {
    this.settingStateSub?.unsubscribe();
  }

  ngOnInit(): void {
    this.chrome.getStorage(STORAGE_NAME.onePassword).subscribe((res) => {
      if (res !== true) {
        this.showOnePassword = true;
      }
    });
    this.chrome.getHaveBackupTip().then((res) => {
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

  toOnePwd() {
    this.settingStateSub = this.settingState.langSub.subscribe((lang) => {
      if (lang !== 'en') {
        window.open(
          'https://tutorial.neoline.io/neoline-cha-jian-qian-bao-tong-yong-mi-ma-she-zhi'
        );
      } else {
        window.open(
          'https://tutorial.neoline.io/v/1/one-pass-setting-for-neoline-extension-wallet'
        );
      }
    });
  }
}
