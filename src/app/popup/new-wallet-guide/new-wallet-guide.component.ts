import { Component } from '@angular/core';
import { MatDialog } from '@angular/material/dialog';
import { PopupSelectDialogComponent } from '@popup/_dialogs';
import { Router } from '@angular/router';
import { ChainTypeGroups, STORAGE_NAME } from '@popup/_lib';
import { ChromeService, GlobalService } from '@/app/core';

@Component({
  templateUrl: './new-wallet-guide.component.html',
  styleUrls: ['./new-wallet-guide.component.scss'],
})
export class PopupNewWalletGuideComponent {
  constructor(
    private dialog: MatDialog,
    private router: Router,
    private chromeSrc: ChromeService,
    private global: GlobalService
  ) {}

  to(type: 'create' | 'import') {
    this.dialog
      .open(PopupSelectDialogComponent, {
        data: {
          optionGroup: ChainTypeGroups,
          type: 'chain',
        },
        panelClass: 'custom-dialog-panel',
        backdropClass: 'custom-dialog-backdrop',
      })
      .afterClosed()
      .subscribe((chain) => {
        if (!chain) {
          return;
        }
        if (chain === 'NeoX') {
          this.chromeSrc
            .getStorage(STORAGE_NAME.onePassword)
            .subscribe((res) => {
              if (res !== false) {
                this.toCreate(type);
              } else {
                this.global.snackBarTip('switchOnePasswordFirst');
              }
            });
        } else {
          this.toCreate(type);
        }
      });
  }

  private toCreate(type: 'create' | 'import') {
    if (type === 'create') {
      this.router.navigateByUrl('/popup/wallet/create');
    } else {
      this.router.navigateByUrl('/popup/wallet/import');
    }
  }
}
