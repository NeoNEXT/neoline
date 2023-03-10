import { Component, OnInit, Inject } from '@angular/core';
import { MatDialogRef, MAT_DIALOG_DATA } from '@angular/material/dialog';
import { Wallet as Wallet2 } from '@cityofzion/neon-core/lib/wallet';
import { Wallet as Wallet3 } from '@cityofzion/neon-core-neo3/lib/wallet';
import { Unsubscribable, timer } from 'rxjs';

@Component({
  templateUrl: 'wallet-list.dialog.html',
  styleUrls: ['wallet-list.dialog.scss'],
})
export class PopupWalletListDialogComponent implements OnInit {
  searchValue = '';
  showWalletArr: Array<Wallet2 | Wallet3> = [];
  private searchSub: Unsubscribable;

  constructor(
    private dialogRef: MatDialogRef<PopupWalletListDialogComponent>,
    @Inject(MAT_DIALOG_DATA)
    public data: {
      walletArr: Array<Wallet2 | Wallet3>;
      currentAddress: string;
    }
  ) {}

  ngOnInit() {
    this.showWalletArr = [...(this.data.walletArr || [])];
  }

  select(item: Wallet2 | Wallet3) {
    this.dialogRef.close(item);
  }

  search() {
    this.searchSub?.unsubscribe();
    this.searchSub = timer(500).subscribe(() => {
      if (!this.searchValue || this.searchValue.trim() === '') {
        this.showWalletArr = [...(this.data.walletArr || [])];
        return;
      }
      const value = this.searchValue.toLowerCase();
      this.showWalletArr = this.data.walletArr.filter((item) =>
        item.name.toLowerCase().includes(value)
      );
    });
  }
}
