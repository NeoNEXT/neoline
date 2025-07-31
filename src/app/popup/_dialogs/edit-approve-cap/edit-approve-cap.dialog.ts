import { Component, Inject } from '@angular/core';
import { MatDialogRef, MAT_DIALOG_DATA } from '@angular/material/dialog';

@Component({
  templateUrl: 'edit-approve-cap.dialog.html',
  styleUrls: ['edit-approve-cap.dialog.scss'],
})
export class PopupEditApproveCapDialogComponent {
  inputAmount = '';

  constructor(
    private dialogRef: MatDialogRef<PopupEditApproveCapDialogComponent>,
    @Inject(MAT_DIALOG_DATA)
    public data: {
      approveAssetBalance: string;
      approveAmount: string;
    }
  ) {
    this.inputAmount = this.data.approveAmount;
  }

  useMaxApproveAmount() {
    this.inputAmount = this.data.approveAssetBalance;
  }

  confirm() {
    this.dialogRef.close(this.inputAmount);
  }
}
