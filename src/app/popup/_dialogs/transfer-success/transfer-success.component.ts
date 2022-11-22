import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { MatDialogRef } from '@angular/material/dialog';

@Component({
  templateUrl: 'transfer-success.component.html',
  styleUrls: ['transfer-success.component.scss'],
})
export class PopupTransferSuccessDialogComponent implements OnInit {
  constructor(
    private router: Router,
    private dialogRef: MatDialogRef<PopupTransferSuccessDialogComponent>
  ) {}

  ngOnInit(): void {}

  public close() {
    if (this.router.url.match('notification') !== null) {
      window.close();
    }
    this.dialogRef.close();
  }
}
