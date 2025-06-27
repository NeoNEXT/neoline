import {
  Component,
  OnInit,
  Input,
  OnDestroy,
  OnChanges,
  SimpleChanges,
} from '@angular/core';
import { Wallet as Wallet2 } from '@cityofzion/neon-core/lib/wallet';
import { Wallet3 } from '@popup/_lib';
import { ChromeService, SettingState } from '@/app/core';
import { STORAGE_NAME } from '../../_lib';
import { Unsubscribable } from 'rxjs';

@Component({
  selector: 'app-home-backup',
  templateUrl: 'backup.component.html',
  styleUrls: ['./backup.component.scss'],
})
export class PopupHomeBackupComponent implements OnInit, OnDestroy, OnChanges {
  @Input() currentWallet: Wallet2 | Wallet3;
  currentHasBackup: boolean = null;
  isBackupLater = false;

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
    this.chrome.getIsBackupLater().then((res) => {
      this.isBackupLater = res;
    });
    this.currentHasBackup =
      this.currentWallet?.accounts[0].extra?.hasBackup === false ? false : true;
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (
      changes.currentWallet.currentValue !== changes.currentWallet.previousValue
    ) {
      this.currentHasBackup =
        this.currentWallet?.accounts[0].extra?.hasBackup === false
          ? false
          : true;
    }
  }

  backupLater() {
    this.chrome.setIsBackupLater(true);
    this.isBackupLater = true;
  }

  getShowBackup() {
    if (!this.isBackupLater && !this.currentHasBackup) {
      return true;
    }
    return false;
  }

  switchOneLater() {
    this.chrome.setStorage(STORAGE_NAME.onePassword, false);
    this.showOnePassword = false;
  }

  toOnePwd() {
    this.settingStateSub = this.settingState.langSub.subscribe((lang) => {
      if (lang === 'zh_CN') {
        window.open(
          'https://tutorial.neoline.io/v/cn/xin-shou-zhi-nan/neoline-cha-jian-qian-bao-tong-yong-mi-ma-she-zhi'
        );
      } else {
        window.open(
          'https://tutorial.neoline.io/getting-started/one-pass-setting-for-neoline-extension-wallet'
        );
      }
    });
  }
}
