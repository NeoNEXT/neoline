import { Component, Input, OnInit } from '@angular/core';
import { Router } from '@angular/router';

@Component({
  selector: 'backup-mnemonic',
  templateUrl: 'backup-mnemonic.component.html',
  styleUrls: ['backup-mnemonic.component.scss'],
})
export class PopupBackupMnemonicComponent implements OnInit {
  @Input() mnemonic: string;

  wordList = [];
  hideMnemonic = false;

  isConfirmMnemonic = false;
  confirmWordList = new Array(12).fill('');
  confirmListStatus = new Array(12).fill(true);

  constructor(private router: Router) {}

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
      this.router.navigateByUrl('/popup/home');
    }
  }
}
