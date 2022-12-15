import { Component, OnInit, Inject } from '@angular/core';
import { MatDialogRef, MAT_DIALOG_DATA } from '@angular/material/dialog';

import { Asset, NftToken } from '@/models/models';

@Component({
  templateUrl: 'asset.dialog.html',
  styleUrls: ['asset.dialog.scss'],
})
export class PopupAssetDialogComponent implements OnInit {
  searchValue = '';
  showBalances = [];
  constructor(
    private dialogRef: MatDialogRef<PopupAssetDialogComponent>,
    @Inject(MAT_DIALOG_DATA)
    public data: {
      balances?: Asset[] | NftToken[];
      selectedId: string;
      isNft?: boolean;
    }
  ) {}

  ngOnInit() {
    this.showBalances = [...(this.data.balances || [])];
  }

  public select(item: Asset | NftToken) {
    this.dialogRef.close(item);
  }

  search() {
    if (!this.searchValue || this.searchValue.trim() === '') {
      this.showBalances = [...(this.data.balances || [])];
      return;
    }
    const value = this.searchValue.toLowerCase();
    if (this.data.isNft) {
      this.showBalances = (this.data.balances as NftToken[]).filter(
        (item) =>
          item.name.toLowerCase().includes(value) ||
          item.tokenid.toLowerCase().includes(value)
      );
    } else {
      this.showBalances = (this.data.balances as Asset[]).filter((item) =>
        item.symbol.toLowerCase().includes(value)
      );
    }
  }
}
