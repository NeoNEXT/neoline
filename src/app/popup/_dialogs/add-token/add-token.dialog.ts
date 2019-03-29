import {
    Component,
    Inject,
    OnInit
} from '@angular/core';
import {
    MatDialogRef,
    MAT_DIALOG_DATA
} from '@angular/material';
import {
    GlobalService,
    AssetState,
} from '@/app/core';

@Component({
    templateUrl: './add-token.dialog.html',
    styleUrls: ['./add-token.dialog.scss']
})
export class PopupAddTokenDialogComponent implements OnInit {
    imageUrl: any;
    constructor(
        private dialogRef: MatDialogRef < PopupAddTokenDialogComponent > ,
        @Inject(MAT_DIALOG_DATA) public asset: any,
        public global: GlobalService,
        private assetState: AssetState,
    ) {}

    ngOnInit() {
        const assetId = this.asset.asset_id;
        this.assetState.getAssetSrc(assetId).subscribe(assetRes => {
            if (typeof assetRes === 'string') {
                this.imageUrl = assetRes;
            } else {
                this.assetState.setAssetFile(assetRes, assetId).then(src => {
                    this.imageUrl = src;
                });
            }
        });
    }

    public cancel() {
        this.dialogRef.close();
    }
    public enter() {}
}
