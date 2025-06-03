import { Component } from '@angular/core';
import { MatDialogRef } from '@angular/material/dialog';
import { Router } from '@angular/router';

declare var chrome: any;

@Component({
  templateUrl: 'add-wallet.dialog.html',
  styleUrls: ['add-wallet.dialog.scss'],
})
export class PopupAddWalletDialogComponent {
  constructor(
    private dialogRef: MatDialogRef<PopupAddWalletDialogComponent>,
    private router: Router
  ) {}

  importLedger() {
    this.dialogRef.close();
    if (
      typeof chrome !== 'undefined' &&
      chrome.runtime &&
      typeof chrome.runtime.id === 'string'
    ) {
      const extensionUrl = chrome.runtime.getURL('/index.html');
      const ledgerUrl = extensionUrl + '#/ledger';
      chrome.tabs.create({ url: ledgerUrl });
    } else {
      this.router.navigateByUrl('/ledger');
    }
  }
  to(type: 'create' | 'import') {
    this.dialogRef.close(type);
  }
}
