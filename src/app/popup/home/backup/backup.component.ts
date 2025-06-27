import {
  Component,
  OnInit,
  Input,
  OnChanges,
  SimpleChanges,
} from '@angular/core';
import { Wallet as Wallet2 } from '@cityofzion/neon-core/lib/wallet';
import { Wallet3 } from '@popup/_lib';
import { ChromeService, SettingState } from '@/app/core';
import { STORAGE_NAME } from '../../_lib';

@Component({
  selector: 'app-home-backup',
  templateUrl: 'backup.component.html',
  styleUrls: ['./backup.component.scss'],
})
export class PopupHomeBackupComponent implements OnInit, OnChanges {
  @Input() currentWallet: Wallet2 | Wallet3;
  currentHasBackup: boolean = null;
  isBackupLater = false;

  showOnePassword: boolean = null;

  constructor(
    private chrome: ChromeService,
    private settingState: SettingState
  ) {}

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
    this.settingState.toWeb('onePasswordTutorial');
  }
}
