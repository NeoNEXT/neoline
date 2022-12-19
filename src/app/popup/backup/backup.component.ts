import { Component } from '@angular/core';
import { MatDialog } from '@angular/material/dialog';
import { PopupBackupTipDialogComponent } from '../_dialogs';
import { Router } from '@angular/router';

@Component({
  templateUrl: 'backup.component.html',
  styleUrls: ['backup.component.scss'],
})
export class PopupBackupComponent {
  constructor(private dialog: MatDialog, private router: Router) {}

  backup() {
    this.dialog
      .open(PopupBackupTipDialogComponent, {
        panelClass: 'custom-dialog-panel',
        disableClose: true,
      })
      .afterClosed()
      .subscribe((confirm) => {
        if (confirm) {
          this.router.navigateByUrl('/popup/backup/key');
        }
      });
  }
}
