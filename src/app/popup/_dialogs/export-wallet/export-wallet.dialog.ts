import { Component, Inject } from '@angular/core';
import { MatDialogRef, MAT_DIALOG_DATA } from '@angular/material/dialog';

@Component({
  templateUrl: './export-wallet.dialog.html',
  styleUrls: ['./export-wallet.dialog.scss'],
})
export class PopupExportWalletDialogComponent {
  exportAll = false;

  constructor(
    private dialogRef: MatDialogRef<PopupExportWalletDialogComponent>,
    @Inject(MAT_DIALOG_DATA) public msg: string
  ) {}

  confirm() {
    this.dialogRef.close(this.exportAll ? 'all' : 'current');
  }
}
