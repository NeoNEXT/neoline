import { Component, OnInit } from '@angular/core';
import { Balance, Asset } from '@/models/models';
import {
    AssetState,
    ChromeService,
    NeonService,
    GlobalService,
} from '@/app/core';
import { MatDialog } from '@angular/material/dialog';
import { PopupAddTokenDialogComponent } from '@popup/_dialogs';

@Component({
    templateUrl: 'add-asset.component.html',
    styleUrls: ['add-asset.component.scss'],
})
export class PopupAddAssetComponent implements OnInit {
    public searchAsset: Asset; // Searched asset
    public watch: Asset[] = []; // User-added assets
    public isLoading = false;
    public searchValue: string = '';

    sourceScrollHeight = 0;

    constructor(
        private asset: AssetState,
        private chrome: ChromeService,
        private neon: NeonService,
        private dialog: MatDialog,
        private global: GlobalService
    ) {}

    ngOnInit(): void {
        this.chrome
            .getWatch(this.neon.address, this.neon.currentWalletChainType)
            .subscribe((res) => (this.watch = res));
    }

    public getAssetSrc() {
        const imageObj = this.asset.assetFile.get(this.searchAsset.asset_id);
        let lastModified = '';
        if (imageObj) {
            lastModified = imageObj['last-modified'];
            this.searchAsset.image_url = imageObj['image-src'];
        }
        if (this.searchAsset.image_url) {
            this.asset
                .getAssetImageFromUrl(this.searchAsset.image_url, lastModified)
                .subscribe((assetRes) => {
                    if (assetRes && assetRes.status === 200) {
                        this.asset
                            .setAssetFile(assetRes, this.searchAsset.asset_id)
                            .then((src) => {
                                this.searchAsset.image_url = src;
                            });
                    } else if (assetRes && assetRes.status === 404) {
                        this.searchAsset.image_url = this.asset.defaultAssetSrc;
                    }
                });
        } else {
            this.searchAsset.image_url = this.asset.defaultAssetSrc;
        }
    }

    public addAsset() {
        this.dialog
            .open(PopupAddTokenDialogComponent, {
                data: this.searchAsset,
                panelClass: 'custom-dialog-panel',
            })
            .afterClosed()
            .subscribe((confirm) => {
                if (confirm) {
                    this.searchAsset.watching = true;
                    this.watch.push(this.searchAsset);
                    this.chrome.setWatch(
                        this.neon.address,
                        this.watch,
                        this.neon.currentWalletChainType
                    );
                    this.global.snackBarTip('addSucc');
                }
            });
    }

    public searchCurrency() {
        if (!this.searchValue) {
            return;
        }
        this.searchAsset = undefined;
        this.asset.searchAsset(this.searchValue).then((res) => {
            this.searchAsset = res;
            this.searchAsset.watching =
                this.watch.findIndex(
                    (w: Balance) => w.asset_id === this.searchAsset.asset_id
                ) >= 0;
            this.getAssetSrc();
        });
    }
}
