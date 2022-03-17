import {
    Component,
    OnInit,
    Inject
} from '@angular/core';
import {
    MatDialogRef, MAT_DIALOG_DATA,
} from '@angular/material/dialog';

import { Asset, NftToken } from '@/models/models';

@Component({
    templateUrl: 'asset.dialog.html',
    styleUrls: ['asset.dialog.scss']
})
export class PopupAssetDialogComponent implements OnInit {
    constructor(
        private dialogRef: MatDialogRef<PopupAssetDialogComponent>,
        @Inject(MAT_DIALOG_DATA) public data: {
            balances?: Array<Asset>,
            selected: number,
            isNft?: boolean,
            nftTokens?: NftToken[],
        }
    ) { }

    ngOnInit() {
    }

    public select(index: number) {
        this.dialogRef.close(index);
    }
}
