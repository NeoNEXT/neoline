import { Component, Inject } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';

@Component({
  templateUrl: 'perps-slippage.dialog.html',
  styleUrls: ['perps-slippage.dialog.scss'],
})
export class PopupPerpsSlippageDialogComponent {
  value: number;

  constructor(
    private dialogRef: MatDialogRef<PopupPerpsSlippageDialogComponent>,
    @Inject(MAT_DIALOG_DATA)
    public data: {
      value: number;
      min: number;
      max: number;
    }
  ) {
    this.value = data.value;
  }

  get valid(): boolean {
    return (
      Number.isFinite(Number(this.value)) &&
      Number(this.value) >= this.data.min &&
      Number(this.value) <= this.data.max
    );
  }

  confirm() {
    if (this.valid) {
      this.dialogRef.close(Number(this.value));
    }
  }
}
