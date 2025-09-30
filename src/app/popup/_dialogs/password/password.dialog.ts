import { Component, OnInit, Inject } from '@angular/core';
import { MatDialogRef, MAT_DIALOG_DATA } from '@angular/material/dialog';
import { ChromeService, GlobalService, Neo3Service } from '@app/core';
import { Wallet as Wallet2 } from '@cityofzion/neon-core/lib/wallet';
import { Wallet3 } from '@popup/_lib';
import { ChainType } from '../../_lib';

@Component({
  templateUrl: './password.dialog.html',
  styleUrls: ['./password.dialog.scss'],
})
export class PopupPasswordDialogComponent implements OnInit {
  pwd = '';
  address = '';

  constructor(
    private dialogRef: MatDialogRef<PopupPasswordDialogComponent>,
    private global: GlobalService,
    private neo3Service: Neo3Service,
    private chrome: ChromeService,
    @Inject(MAT_DIALOG_DATA)
    public data: {
      account: Wallet2 | Wallet3;
      chainType: ChainType;
    }
  ) {}

  ngOnInit() {
    this.address = this.data.account.accounts[0].address;
  }

  verify() {
    const account =
      this.data.chainType === 'Neo2'
        ? this.data.account.accounts[0]
        : this.neo3Service.getNeo3Account(this.data.account.accounts[0]);
    account
      .decrypt(this.pwd)
      .then(() => {
        this.chrome.setPassword(this.pwd);
        this.dialogRef.close(true);
      })
      .catch((err) => {
        this.global.snackBarTip('verifyFailed', err);
      });
  }
}
