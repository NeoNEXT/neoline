import {
    Component,
    Inject,
    OnInit,
    AfterViewInit
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
        const imageObj = this.assetState.assetFile.get(assetId);
        let lastModified = '';
        if (imageObj) {
            lastModified = imageObj['last-modified'];
            this.imageUrl = imageObj['image-src'];
        }
        if (!this.asset.balance || this.asset.balance === 0) {
            this.asset.rateBalance = 0;
        }
        this.assetState.getAssetSrc(assetId, lastModified).subscribe(assetRes => {
            if (assetRes && assetRes['status'] === 200) {
                this.assetState.setAssetFile(assetRes, assetId).then(src => {
                    this.imageUrl = src;
                });
            } else if (assetRes && assetRes['status'] === 404) {
                this.imageUrl = this.assetState.defaultAssetSrc;
            }
        });
    }

    public cancel() {
        this.dialogRef.close();
    }
    public enter() {}
}
