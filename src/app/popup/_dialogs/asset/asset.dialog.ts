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
  showNftTokens = [];
  constructor(
    private dialogRef: MatDialogRef<PopupAssetDialogComponent>,
    @Inject(MAT_DIALOG_DATA)
    public data: {
      balances?: Array<Asset>;
      selectedId: string;
      isNft?: boolean;
      nftTokens?: NftToken[];
    }
  ) {}

  ngOnInit() {
    this.showBalances = [...(this.data.balances || [])];
    this.showNftTokens = [...(this.data.nftTokens || [])];
  }

  public select(item) {
    let index;
    if (this.data.isNft) {
      index = this.data.nftTokens.findIndex((m) => m.tokenid === item.tokenid);
    } else {
      index = this.data.balances.findIndex((m) => m.asset_id === item.asset_id);
    }
    this.dialogRef.close(index);
  }

  search() {
    if (!this.searchValue || this.searchValue.trim() === '') {
      this.showBalances = [...(this.data.balances || [])];
      this.showNftTokens = [...(this.data.nftTokens || [])];
      return;
    }
    const value = this.searchValue.toLowerCase();
    if (this.data.isNft) {
      this.showNftTokens = this.data.nftTokens.filter(
        (item) =>
          item.name.toLowerCase().includes(value) ||
          item.tokenid.toLowerCase().includes(value)
      );
    } else {
      this.showBalances = this.data.balances.filter((item) =>
        item.symbol.toLowerCase().includes(value)
      );
    }
  }
}
