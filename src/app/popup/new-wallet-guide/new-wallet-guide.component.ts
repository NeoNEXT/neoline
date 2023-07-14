import { Component, OnInit } from '@angular/core';
import { MatDialog } from '@angular/material/dialog';
import { PopupSelectDialogComponent } from '@popup/_dialogs';
import { Router } from '@angular/router';
import { ChainTypeGroups } from '@popup/_lib';

@Component({
  templateUrl: './new-wallet-guide.component.html',
  styleUrls: ['./new-wallet-guide.component.scss'],
})
export class PopupNewWalletGuideComponent {
  constructor(private dialog: MatDialog, private router: Router) {}

  to(type: 'create' | 'import') {
    this.dialog
      .open(PopupSelectDialogComponent, {
        data: {
          optionGroup: ChainTypeGroups,
          type: 'chain',
        },
        panelClass: 'custom-dialog-panel',
      })
      .afterClosed()
      .subscribe((chain) => {
        if (!chain) {
          return;
        }
        if (type === 'create') {
          this.router.navigateByUrl('/popup/wallet/create');
        } else {
          this.router.navigateByUrl('/popup/wallet/import');
        }
      });
  }
}
