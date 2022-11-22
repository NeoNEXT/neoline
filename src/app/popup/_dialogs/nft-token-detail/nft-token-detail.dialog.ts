import { Component, Inject } from '@angular/core';
import { MAT_DIALOG_DATA } from '@angular/material/dialog';
import { NftToken } from '@/models/models';

@Component({
  templateUrl: 'nft-token-detail.dialog.html',
  styleUrls: ['nft-token-detail.dialog.scss'],
})
export class PopupNftTokenDetailDialogComponent {
  constructor(
    @Inject(MAT_DIALOG_DATA)
    public data: {
      nftToken: NftToken;
    }
  ) {}

  openImg(url: string) {
    window.open(url);
  }
}
