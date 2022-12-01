import { Component, OnInit, Inject } from '@angular/core';
import { GlobalService, UtilServiceState } from '@/app/core';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { ChainType } from '@/app/popup/_lib';
import { Wallet as Wallet2 } from '@cityofzion/neon-core/lib/wallet';
import { Wallet as Wallet3 } from '@cityofzion/neon-core-neo3/lib/wallet';

@Component({
  templateUrl: 'private-key.dialog.html',
  styleUrls: ['private-key.dialog.scss'],
})
export class PopupPrivateKeyComponent implements OnInit {
  address: string;
  walletName: string;
  verified = false;
  loading = false;
  pwd = '';
  wif: string;

  constructor(
    private global: GlobalService,
    private dialogRef: MatDialogRef<PopupPrivateKeyComponent>,
    private util: UtilServiceState,
    @Inject(MAT_DIALOG_DATA)
    public data: {
      currentWallet: Wallet2 | Wallet3;
      chainType: ChainType;
    }
  ) {}

  ngOnInit(): void {
    this.walletName = this.data.currentWallet.name;
    this.address = this.data.currentWallet.accounts[0].address;
  }

  verify() {
    if (this.loading) {
      return;
    }
    if (!this.pwd || !this.pwd.length) {
      this.global.snackBarTip('checkInput');
      return;
    }
    this.loading = true;
    const account =
      this.data.chainType === 'Neo3'
        ? this.util.getNeo3Account(this.data.currentWallet.accounts[0])
        : this.data.currentWallet.accounts[0];
    account
      .decrypt(this.pwd)
      .then((res) => {
        this.loading = false;
        this.verified = true;
        this.wif = res.WIF;
      })
      .catch((err) => {
        this.loading = false;
        this.global.snackBarTip('verifyFailed', err);
      });
  }

  close() {
    this.dialogRef.close();
  }
}
