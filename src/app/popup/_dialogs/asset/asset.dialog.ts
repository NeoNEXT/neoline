import {
    Component,
    OnInit,
    Inject
} from '@angular/core';
import {
    MatDialogRef, MAT_DIALOG_DATA,
} from '@angular/material/dialog';

import {
    AssetState,
} from '@app/core';
import { Asset } from '@/models/models';

@Component({
    templateUrl: 'asset.dialog.html',
    styleUrls: ['asset.dialog.scss']
})
export class PopupAssetDialogComponent implements OnInit {
    public logoUrlArr = [];
    constructor(
        private dialogRef: MatDialogRef<PopupAssetDialogComponent>,
        private assetState: AssetState,
        @Inject(MAT_DIALOG_DATA) public data: {
            balances: Array<Asset>,
            selected: number
        }
    ) { }

    ngOnInit() {
        this.data.balances.forEach(async (item, index) => {
            this.logoUrlArr[index] = await this.assetState.getAssetImage(item);
        })
    }

    public select(index: number) {
        this.dialogRef.close(index);
    }
}
