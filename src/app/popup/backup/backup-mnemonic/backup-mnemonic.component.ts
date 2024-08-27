import { Component, Input, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { UPDATE_NEOX_WALLET_BACKUP_STATUS, UPDATE_WALLET } from '../../_lib';
import { EvmWalletJSON } from '../../_lib/evm';
import { AppState } from '@/app/reduers';
import { Store } from '@ngrx/store';

@Component({
  selector: 'backup-mnemonic',
  templateUrl: 'backup-mnemonic.component.html',
  styleUrls: ['backup-mnemonic.component.scss'],
})
export class PopupBackupMnemonicComponent implements OnInit {
  @Input() mnemonic: string;
  @Input() currentWallet: EvmWalletJSON;

  wordList = [];
  hideMnemonic = false;

  isConfirmMnemonic = false;
  confirmWordList = new Array(12).fill('');
  confirmListStatus = new Array(12).fill(true);

  constructor(private router: Router, private store: Store<AppState>) {}

  ngOnInit(): void {
    if (this.mnemonic) {
      this.wordList = this.mnemonic.split(' ');
    }
  }

  onPaste(event: ClipboardEvent) {
    let clipboardData = event.clipboardData;
    let pastedText = clipboardData.getData('text');
    if (pastedText.split(' ').length === 12) {
      this.confirmWordList = pastedText.split(' ');
      this.confirmListStatus = new Array(12).fill(true);
      event.preventDefault();
    }
  }

  trackByFn(index) {
    return index;
  }

  checkMnemonic() {
    let flag = true;
    this.wordList.forEach((item, index) => {
      if (item !== this.confirmWordList[index]) {
        this.confirmListStatus[index] = false;
        flag = false;
      }
    });
    if (flag) {
      this.currentWallet.accounts[0].extra.hasBackup = true;
      this.store.dispatch({ type: UPDATE_WALLET, data: this.currentWallet });
      this.store.dispatch({
        type: UPDATE_NEOX_WALLET_BACKUP_STATUS,
        data: { address: this.currentWallet.accounts[0].address },
      });
      this.router.navigateByUrl('/popup/home');
    }
  }
}
