import {
    Component,
    OnInit,
    OnDestroy,
    OnChanges,
} from '@angular/core';
import {
    PageData,
    Balance,
    Asset,
    NEO,
    GAS,
    EXT,
    EDS
} from '@/models/models';
import {
    AssetState,
    ChromeService,
    NeonService,
} from '@/app/core';
import {
    map,
    switchMap,
} from 'rxjs/operators';
import {
    GlobalService,
} from '@/app/core';
import {
    PopupAddTokenDialogComponent
} from '@popup/_dialogs';
import {
    MatDialog
} from '@angular/material/dialog';
import { Unsubscribable } from 'rxjs';

@Component({
    templateUrl: 'manage.component.html',
    styleUrls: ['manage.component.scss']
})
export class AssetManageComponent implements OnInit, OnDestroy {
    private requesting = false;
    public allAssets: Asset[] ; // 所有的资产
    public searchAssets: any = false; // 搜索出来的资产
    public displayAssets: Balance[] = []; // 要显示的资产
    public watch: Asset[]; // 用户添加的资产
    public isLoading: boolean;
    public isSearch: boolean = false;
    public searchValue: string;
    public unSubDelAsset: Unsubscribable;

    constructor(
        private asset: AssetState,
        private chrome: ChromeService,
        private neon: NeonService,
        public global: GlobalService,
        private dialog: MatDialog,
    ) {}

    ngOnInit(): void {
        this.asset.fetchBalance(this.neon.address).pipe(switchMap((res) => this.chrome.getWatch(this.neon.address, this.neon.currentWalletChainType).pipe(map((watching) => {
            this.displayAssets = [];
            this.displayAssets.push(...res)
            //  去重
            const newWatch = [];
            watching.forEach((w) => {
                if (res.findIndex((r) => r.asset_id === w.asset_id) < 0) {
                    newWatch.push(w);
                }
            });
            this.watch = newWatch;
            this.displayAssets.push(...newWatch);
            return res;
        })))).subscribe(() => {
            this.getAllBalance(1);
        });
        this.unSubDelAsset = this.asset.popDelAssetId().subscribe(delId => {
            if (!delId) {
                return;
            }
            if (this.searchAssets) {
                for (const [item, index] of this.searchAssets) {
                    if (item.asset_id === delId) {
                        this.searchAssets[index].watching = false;
                        return;
                    }
                }
            } else {
                for (const index in this.allAssets) {
                    if (this.allAssets[index].asset_id === delId) {
                        this.allAssets[index].watching = false;
                        return;
                    }
                }
            }
        });
    }

    ngOnDestroy(): void {
        if (this.unSubDelAsset) {
            this.unSubDelAsset.unsubscribe();
        }
    }

    public getAllBalance(page) {
        this.requesting = true;
        this.asset.fetchAll().then(res => {
            this.allAssets = res;
            this.allAssets.forEach((element, index) => {
                this.allAssets[index].watching =
                    this.displayAssets.findIndex((w: Balance) => w.asset_id === element.asset_id) >= 0;
                this.getAssetSrc(element, index, 'all');
            });
            this.requesting = false;
        });
    }

    public getAssetSrc(asset: Asset, index, type) {
        const imageObj = this.asset.assetFile.get(asset.asset_id);
        let lastModified = '';
        if (imageObj) {
            lastModified = imageObj['last-modified'];
            if (type === 'all') {
                this.allAssets[index].avatar = imageObj['image-src'];
            } else if (type === 'search') {
                this.searchAssets[index].avatar = imageObj['image-src'];
            }
        }
        this.asset.getAssetImageFromUrl(asset.image_url, lastModified).subscribe(assetRes => {
            if (assetRes && assetRes['status'] === 200) {
                this.asset.setAssetFile(assetRes, asset.asset_id).then(src => {
                    if (type === 'all') {
                        this.allAssets[index].avatar = src;
                    } else if (type === 'search') {
                        this.searchAssets[index].avatar = src;
                    }
                });
            } else if (assetRes && assetRes['status'] === 404) {
                if (type === 'all') {
                    this.allAssets[index].avatar = this.asset.defaultAssetSrc;
                } else if (type === 'search') {
                    this.searchAssets[index].avatar = this.asset.defaultAssetSrc;
                }
            }
        });
    }

    public addAsset(index: number) {
        const assetItem = this.searchAssets === false ? this.allAssets[index] : this.searchAssets[index];
        this.dialog.open(PopupAddTokenDialogComponent, {
            data: assetItem,
            panelClass: 'custom-dialog-panel'
        }).afterClosed().subscribe((confirm) => {
            if (confirm) {
                if (this.searchAssets !== false) {
                    const i = this.allAssets.findIndex((a) => a.asset_id === assetItem.asset_id);
                    if (i >= 0) {
                        this.allAssets[i].watching = true;
                    }
                    this.searchAssets[index].watching = true;
                } else {
                    this.allAssets[index].watching = true;
                }
                this.displayAssets.push(assetItem);
                this.watch.push(assetItem);
                this.chrome.setWatch(this.neon.address, this.watch, this.neon.currentWalletChainType);
                this.asset.pushAddAssetId(assetItem);
                this.global.snackBarTip('addSucc');
            }
        });
    }

    public page(page: number) {
        if (this.requesting) {
            return;
        }
        this.requesting = true;
        this.getAllBalance(page);
    }

    public filter(id: string) {
        return ![NEO, GAS, EXT, EDS].includes(id);
    }

    public searchCurrency() {
        if (this.searchValue) {
            this.asset.searchAsset(this.searchValue).subscribe(res => {
                this.searchAssets = res;
                this.searchAssets.forEach((element, index) => {
                    this.searchAssets[index].watching = this.displayAssets.findIndex((w: Balance) => w.asset_id === element.asset_id) >= 0;
                    this.getAssetSrc(element, index, 'search');
                });
            });
        } else {
            this.searchAssets = false;
        }
    }
}
