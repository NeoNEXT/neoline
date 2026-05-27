import {
  Component,
  Input,
  OnChanges,
  OnInit,
  SimpleChanges,
} from '@angular/core';
import { Router } from '@angular/router';
import {
  ChainType,
  UPDATE_NEO3_WALLET_BACKUP_STATUS,
  UPDATE_NEOX_WALLET_BACKUP_STATUS,
  UPDATE_WALLET,
  Wallet3,
} from '../../_lib';
import { EvmWalletJSON } from '../../_lib/evm';
import { AppState } from '@/app/reduers';
import { Store } from '@ngrx/store';

@Component({
  selector: 'backup-mnemonic',
  templateUrl: 'backup-mnemonic.component.html',
  styleUrls: ['backup-mnemonic.component.scss'],
})
export class PopupBackupMnemonicComponent implements OnInit, OnChanges {
  @Input() mnemonic: string;
  @Input() currentWallet: Wallet3 | EvmWalletJSON;
  @Input() chainType: ChainType;

  wordList = [];
  hideMnemonic = false;

  isConfirmMnemonic = false;
  confirmWordList = new Array(12).fill('');
  confirmListStatus = new Array(12).fill(true);

  constructor(private router: Router, private store: Store<AppState>) {}

  ngOnInit(): void {
    this.setWordList();
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes.mnemonic) {
      this.setWordList();
    }
  }

  private setWordList() {
    if (this.mnemonic) {
      this.wordList = this.mnemonic.split(' ');
    } else {
      this.wordList = [];
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
      const data = {
        address: this.currentWallet.accounts[0].address,
        hdWalletId: this.currentWallet.accounts[0].extra?.hdWalletId,
      };
      if (this.chainType === 'Neo3') {
        this.store.dispatch({
          type: UPDATE_NEO3_WALLET_BACKUP_STATUS,
          data,
        });
      }
      if (this.chainType === 'NeoX') {
        this.store.dispatch({
          type: UPDATE_NEOX_WALLET_BACKUP_STATUS,
          data,
        });
      }
      this.router.navigateByUrl('/popup/home');
    }
  }
}
