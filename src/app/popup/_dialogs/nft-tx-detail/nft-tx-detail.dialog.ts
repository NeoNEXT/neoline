import { Component, Inject } from '@angular/core';
import { MAT_DIALOG_DATA } from '@angular/material/dialog';

@Component({
    templateUrl: 'nft-tx-detail.dialog.html',
    styleUrls: ['nft-tx-detail.dialog.scss'],
})
export class PopupNftTxDetailDialogComponent {
    constructor(
        @Inject(MAT_DIALOG_DATA)
        public data: {
            tx: any;
            address: string;
        }
    ) {}
}
