import { Component, OnInit } from '@angular/core';
import { PageData, Balance, Asset, GAS, NEO } from '@/models/models';
import {
    AssetState,
    ChromeService,
    NeonService,
    GlobalService
} from '@/app/core';
import { MatDialog } from '@angular/material/dialog';

import { PopupAddTokenDialogComponent, PopupAddTokenWarnDialogComponent } from '@popup/_dialogs';
import { forkJoin } from 'rxjs';
import { timingSafeEqual } from 'crypto';

@Component({
    templateUrl: 'add-asset.component.html',
    styleUrls: ['add-asset.component.scss']
})
export class PopupAddAssetComponent implements OnInit {
    public allowAssets: Array<Asset>; // 推荐资产
    public searchAssets: any = false; // 搜索的资产
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
        const getMoneyBalance = this.asset.fetchBalance(this.neon.address);
        const getWatch = this.chrome.getWatch(this.neon.address, this.neon.currentWalletChainType);
        forkJoin([getMoneyBalance, getWatch]).subscribe(res => {
            this.moneyAssets = res[0];
            this.watch = res[1];
            this.getAllBalance();
        });
    }

    public getAllBalance() {
        this.isLoading = true;
        this.asset.fetchAllowList().subscribe((res: Array<Asset>) => {
            this.allowAssets = res;
            this.allowAssets.forEach((asset, index) => {
                if (asset.asset_id) {
                    const moneyIndex = this.moneyAssets.findIndex(item => item.asset_id === asset.asset_id);
                    if(moneyIndex >= 0) {
                        this.allowAssets[index].balance = this.moneyAssets[moneyIndex].balance;
                    }
                    this.getAssetSrc(
                        asset,
                        index,
                        'all'
                    );
                    this.allowAssets[index].watching = this.watch.findIndex(  // watching=true 已添加
                        (w: Balance) =>
                            w.asset_id ===
                            asset.asset_id
                    ) >= 0;
                }
            })
            this.isLoading = false;
        });
    }

    public getAssetSrc(asset: Asset, index, type) {
        const imageObj = this.asset.assetFile.get(asset.asset_id);
        let lastModified = '';
        if (imageObj) {
            lastModified = imageObj['last-modified'];
            if (type === 'all') {
                this.allowAssets[index].image_url = imageObj['image-src'];
            } else if (type === 'search') {
                this.searchAssets[index].image_url = imageObj['image-src'];
            }
        }
        this.asset.getAssetImageFromUrl(asset.image_url, lastModified).subscribe(assetRes => {
            if (assetRes && assetRes.status === 200) {
                this.asset.setAssetFile(assetRes, asset.asset_id).then(src => {
                    if (type === 'all') {
                        this.allowAssets[index].image_url = src;
                    } else if (type === 'search') {
                        this.searchAssets[index].image_url = src;
                    }
                });
            } else if (assetRes && (assetRes.status === 404)) {
                if (type === 'all') {
                    this.allowAssets[
                        index
                    ].image_url = this.asset.defaultAssetSrc;
                } else if (type === 'search') {
                    this.searchAssets[
                        index
                    ].image_url = this.asset.defaultAssetSrc;
                }
            }
        });
    }

    public addAsset(index: number) {
        const assetItem =
            this.searchAssets === false
                ? this.allowAssets[index]
                : this.searchAssets[index];
        this.dialog
            .open(PopupAddTokenDialogComponent, {
                data: assetItem,
                panelClass: 'custom-dialog-panel'
            })
            .afterClosed()
            .subscribe(confirm => {
                if (confirm) {
                    if (this.searchAssets !== false) {
                        const i = this.allowAssets.findIndex(
                            a => a.asset_id === assetItem.asset_id
                        );
                        if (i >= 0) {
                            this.allowAssets[i].watching = true;
                        }
                        this.searchAssets[index].watching = true;
                    } else {
                        this.allowAssets[index].watching = true;
                    }
                    this.watch.push(assetItem);
                    this.chrome.setWatch(this.neon.address, this.watch, this.neon.currentWalletChainType);
                    this.global.snackBarTip('addSucc');
                }
            });
    }

    public searchCurrency() {
        if (this.searchValue) {
            this.asset.searchAsset(this.searchValue).subscribe(res => {
                this.searchAssets = res;
                this.searchAssets.forEach((s, index) => {
                    const moneyIndex = this.moneyAssets.findIndex(item => item.asset_id === s.asset_id);
                    if(moneyIndex >= 0) {
                        this.searchAssets[index].balance = this.moneyAssets[moneyIndex].balance;
                    }
                    this.searchAssets[index].watching =
                        this.watch.findIndex(
                            (w: Balance) => w.asset_id === s.asset_id
                        ) >= 0;
                    this.getAssetSrc(s, index, 'search');
                });
            });
        } else {
            this.searchAssets = false;
        }
    }

    public addAssetCheck(index: number) {
        const assetItem = this.searchAssets === false ? this.allowAssets[index] : this.searchAssets[index];
        if(assetItem.is_risk === true) {
            this.dialog
            .open(PopupAddTokenWarnDialogComponent, {
                panelClass: 'custom-dialog-panel',
                disableClose: true
            })
            .afterClosed()
            .subscribe(confirm => {
                if(confirm) {
                    this.addAsset(index);
                }
            });
        } else {
            this.addAsset(index);
        }
    }
}
