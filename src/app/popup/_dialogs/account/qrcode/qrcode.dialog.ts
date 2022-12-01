import { Component, Inject, OnInit } from '@angular/core';
import { MatDialogRef, MAT_DIALOG_DATA } from '@angular/material/dialog';

declare var QRCode: any;

@Component({
  templateUrl: 'qrcode.dialog.html',
  styleUrls: ['qrcode.dialog.scss'],
})
export class PopupQRCodeDialogComponent implements OnInit {
  constructor(
    private dialogRef: MatDialogRef<PopupQRCodeDialogComponent>,
    @Inject(MAT_DIALOG_DATA) public address: string
  ) {}

  ngOnInit() {
    if (QRCode) {
      var qrcode = new QRCode('popup-address-qrcode', {
        text: this.address,
        width: 214,
        height: 214,
        colorDark: '#333333',
        colorLight: '#ffffff',
        correctLevel: QRCode.CorrectLevel.H,
      });
    }
  }

  public cancel() {
    this.dialogRef.close();
  }
}
