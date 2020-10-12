import { Component, OnInit } from '@angular/core';
import { PageData, Balance, Asset } from '@/models/models';
import {
    AssetState,
    ChromeService,
    NeonService,
    GlobalService
} from '@/app/core';
import { MatDialog } from '@angular/material/dialog';

import { PopupAddTokenDialogComponent, PopupAddTokenWarnDialogComponent, PopupDelTokenDialogComponent } from '@popup/_dialogs';
import { forkJoin } from 'rxjs';

@Component({
    templateUrl: 'my-assets.component.html',
    styleUrls: ['my-assets.component.scss']
})
export class PopupMyAssetsComponent implements OnInit {
    public myAssets: Array<Asset> = []; // 所有的资产
    public watch: Asset[] = []; // 用户添加的资产
    public moneyAssets: Asset[] = []; // 有钱的资产
    public isLoading = false;
    public searchValue: string = '';

    sourceScrollHeight = 0;

    constructor(
        private asset: AssetState,
        private chrome: ChromeService,
        private neon: NeonService,
        private dialog: MatDialog,
        private global: GlobalService
    ) { }

    ngOnInit(): void {
        const getMoneyBalance = this.asset.fetchBalanceGo(this.neon.address);
        const getWatch = this.chrome.getWatch();
        forkJoin([getMoneyBalance, getWatch]).subscribe(res => {
            this.moneyAssets = res[0];
            this.watch = res[1];
            this.myAssets = this.moneyAssets;
            this.getAllBalance(1);
        });
    }

    public getAllBalance(page) {
        this.isLoading = true;

        this.watch.forEach(item => {
            if (this.moneyAssets.findIndex(balanceItem => balanceItem.asset_id === item.asset_id) < 0) {
                this.myAssets.push(item);
            }
        })
        this.myAssets.forEach((item, index) => {
            const moneyIndex = this.moneyAssets.findIndex(balanceAsset => balanceAsset.asset_id === item.asset_id);
            if (moneyIndex >= 0) {
                this.myAssets[index].balance = this.moneyAssets[moneyIndex].balance;
            }
            this.getAssetSrc(item, index)
        })
        this.isLoading = false;
    }

    public getAssetSrc(asset: Asset, index) {
        const imageObj = this.asset.assetFile.get(asset.asset_id);
        let lastModified = '';
        if (imageObj) {
            lastModified = imageObj['last-modified'];
            this.myAssets[index].image_url = imageObj['image-src'];
        }
        this.asset.getAssetImageFromUrl(asset.image_url, lastModified).subscribe(assetRes => {
            if (assetRes && assetRes.status === 200) {
                this.asset.setAssetFile(assetRes, asset.image_url).then(src => {
                    this.myAssets[index].image_url = src;
                });
            } else if (assetRes && assetRes.status === 404) {
                this.myAssets[index].image_url = this.asset.defaultAssetSrc;
            }
        });
    }

    public addAsset(index: number) {
        const assetItem = this.myAssets[index]
        this.dialog
            .open(PopupAddTokenDialogComponent, {
                data: assetItem,
                panelClass: 'custom-dialog-panel'
            })
            .afterClosed()
            .subscribe(confirm => {
                if (confirm) {
                    this.myAssets[index].watching = true;
                    this.watch.push(assetItem);
                    this.chrome.setWatch(this.watch);
                    this.global.snackBarTip('addSucc');
                }
            });
    }

    public addAssetCheck(index: number) {
        const assetItem = this.myAssets[index];
        if (assetItem.is_risk === true) {
            this.dialog.open(PopupAddTokenWarnDialogComponent, {
                panelClass: 'custom-dialog-panel',
                disableClose: true
            }).afterClosed().subscribe(confirm => {
                if (confirm) {
                    this.addAsset(index);
                }
            });
        } else {
            this.addAsset(index);
        }
    }

    public removeAsset(index: number) {
        const asset = this.myAssets[index];
        this.dialog
        .open(PopupDelTokenDialogComponent, {
            panelClass: 'custom-dialog-panel'
        })
        .afterClosed()
        .subscribe(confirm => {
            if (confirm) {
                const i = this.watch.findIndex(
                    w => w.asset_id === asset.asset_id
                );
                if (i >= 0) {
                    this.myAssets[index].watching = false;
                    this.watch.splice(i, 1);
                    this.chrome.setWatch(this.watch);
                    this.global.snackBarTip('hiddenSucc');
                }
            }
        });
    }
}
