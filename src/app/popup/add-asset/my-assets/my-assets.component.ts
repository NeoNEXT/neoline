import { Component, OnInit } from '@angular/core';
import { PageData, Balance, Asset } from '@/models/models';
import {
    AssetState,
    ChromeService,
    NeonService,
    GlobalService
} from '@/app/core';
import { MatDialog } from '@angular/material/dialog';

import { PopupAddTokenDialogComponent } from '@popup/_dialogs';
import { forkJoin } from 'rxjs';

@Component({
    templateUrl: 'my-assets.component.html',
    styleUrls: ['my-assets.component.scss']
})
export class PopupMyAssetsComponent implements OnInit {
    public allAssets: PageData<Asset>; // 所有的资产
    public searchAssets: any = false; // 搜索的资产
    public watch: Balance[] = []; // 用户添加的资产
    public moneyAssets: Balance[] = []; // 有钱的资产
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
        // let address = 'Af1FkesAboWnz7PfvXsEiXiwoH3PPzx7ta';
        const getMoneyBalance = this.asset.fetchBalance(this.neon.address);
        const getWatch = this.chrome.getWatch();
        forkJoin([getMoneyBalance, getWatch]).subscribe(res => {
            this.moneyAssets = res[0];
            this.watch = res[1];
            this.getAllBalance(1);
        });
    }

    public getAllBalance(page) {
        this.isLoading = true;
        this.asset.fetchAll(page).then((res: PageData<Asset>) => {
            if (page === 1) {
                this.allAssets = res;
            } else {
                this.allAssets.page = res.page;
                this.allAssets.pages = res.pages;
                this.allAssets.total = res.total;
                this.allAssets.per_page = res.per_page;
                this.allAssets.items = this.allAssets.items.concat(res.items);
            }

            const length =
                res.page * res.per_page < res.total
                    ? res.page * res.per_page
                    : res.total;
            for (
                let index = (res.page - 1) * res.per_page;
                index < length;
                index++
            ) {
                if (this.allAssets.items[index].asset_id) {
                    this.getAssetSrc(
                        this.allAssets.items[index].asset_id,
                        index,
                        'all'
                    );
                    this.allAssets.items[index].watching =
                        this.moneyAssets.findIndex(
                            (m: Balance) =>
                                m.asset_id ===
                                this.allAssets.items[index].asset_id
                        ) >= 0 ||
                        this.watch.findIndex(
                            (w: Balance) =>
                                w.asset_id ===
                                this.allAssets.items[index].asset_id
                        ) >= 0;
                }
            }
            this.isLoading = false;
        });
    }

    public getAssetSrc(assetId, index, type) {
        const imageObj = this.asset.assetFile.get(assetId);
        let lastModified = '';
        if (imageObj) {
            lastModified = imageObj['last-modified'];
            if (type === 'all') {
                this.allAssets.items[index].avatar = imageObj['image-src'];
            } else if (type === 'search') {
                this.searchAssets[index].avatar = imageObj['image-src'];
            }
        }
        this.asset.getAssetSrc(assetId, lastModified).subscribe(assetRes => {
            if (assetRes && assetRes.status === 200) {
                this.asset.setAssetFile(assetRes, assetId).then(src => {
                    if (type === 'all') {
                        this.allAssets.items[index].avatar = src;
                    } else if (type === 'search') {
                        this.searchAssets[index].avatar = src;
                    }
                });
            } else if (assetRes && assetRes.status === 404) {
                if (type === 'all') {
                    this.allAssets.items[
                        index
                    ].avatar = this.asset.defaultAssetSrc;
                } else if (type === 'search') {
                    this.searchAssets[
                        index
                    ].avatar = this.asset.defaultAssetSrc;
                }
            }
        });
    }

    public addAsset(index: number) {
        const assetItem =
            this.searchAssets === false
                ? this.allAssets.items[index]
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
                        const i = this.allAssets.items.findIndex(
                            a => a.asset_id === assetItem.asset_id
                        );
                        if (i >= 0) {
                            this.allAssets.items[i].watching = true;
                        }
                        this.searchAssets[index].watching = true;
                    } else {
                        this.allAssets.items[index].watching = true;
                    }
                    this.watch.push(assetItem);
                    this.chrome.setWatch(this.watch);
                    this.global.snackBarTip('addSucc');
                }
            });
    }

    public searchCurrency() {
        if (this.searchValue) {
            this.asset.searchAsset(this.searchValue).subscribe(res => {
                this.searchAssets = res;
                this.searchAssets.forEach((s, index) => {
                    this.searchAssets[index].watching =
                        this.moneyAssets.findIndex(
                            (m: Balance) => m.asset_id === s.asset_id
                        ) >= 0 ||
                        this.watch.findIndex(
                            (w: Balance) => w.asset_id === s.asset_id
                        ) >= 0;
                    this.getAssetSrc(s.asset_id, index, 'search');
                });
            });
        } else {
            this.searchAssets = false;
        }
    }

    public onScrolltaChange(el: Element) {
        const clientHeight = el.clientHeight;
        const scrollHeight = el.scrollHeight;
        const scrollTop = el.scrollTop;
        if (
            scrollHeight - clientHeight < scrollTop + 100 &&
            this.sourceScrollHeight < scrollHeight &&
            this.allAssets.page < this.allAssets.pages
        ) {
            this.getAllBalance(++this.allAssets.page);
            this.sourceScrollHeight = scrollHeight;
        }
    }
}
