import { Component, OnInit, Inject } from '@angular/core';
import { MatDialogRef, MAT_DIALOG_DATA } from '@angular/material/dialog';

import { Asset, NftToken } from '@/models/models';
import { Unsubscribable, timer } from 'rxjs';
import { ChainType } from '../../_lib';

@Component({
  templateUrl: 'asset-list.dialog.html',
  styleUrls: ['asset-list.dialog.scss'],
})
export class PopupAssetListDialogComponent implements OnInit {
  searchValue = '';
  showBalances = [];
  private searchSub: Unsubscribable;

  constructor(
    private dialogRef: MatDialogRef<PopupAssetListDialogComponent>,
    @Inject(MAT_DIALOG_DATA)
    public data: {
      balances?: Asset[] | NftToken[];
      selectedId: string;
      isNft?: boolean;
      chainType: ChainType;
      networkId: number;
    }
  ) {}

  ngOnInit() {
    this.showBalances = [...(this.data.balances || [])];
  }

  public select(item: Asset | NftToken) {
    this.dialogRef.close(item);
  }

  search() {
    this.searchSub?.unsubscribe();
    this.searchSub = timer(500).subscribe(() => {
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
    });
  }
}
