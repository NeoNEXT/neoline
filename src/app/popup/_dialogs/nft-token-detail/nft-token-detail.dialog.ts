import { Component, Inject } from '@angular/core';
import { MAT_DIALOG_DATA } from '@angular/material/dialog';

@Component({
    templateUrl: 'nft-token-detail.dialog.html',
    styleUrls: ['nft-token-detail.dialog.scss'],
})
export class PopupNftTokenDetailDialogComponent {
    constructor(
        @Inject(MAT_DIALOG_DATA)
        public data: {
            nftToken: any;
        }
    ) {}
}
