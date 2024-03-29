import { Component, Inject, OnInit } from '@angular/core';
import { MatDialogRef, MAT_DIALOG_DATA } from '@angular/material/dialog';

@Component({
  templateUrl: './confirm.dialog.html',
  styleUrls: ['./confirm.dialog.scss'],
})
export class PopupConfirmDialogComponent {
  constructor(
    private dialogRef: MatDialogRef<PopupConfirmDialogComponent>,
    @Inject(MAT_DIALOG_DATA) public msg: string
  ) {}

  public cancel() {}

  public enter() {}
}
