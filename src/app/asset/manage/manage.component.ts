import {
    Component,
    OnInit,
    OnDestroy,
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
    switchMap
} from 'rxjs/operators';
import {
    GlobalService,
} from '@/app/core';
import {
    PopupAddTokenDialogComponent
} from '@popup/_dialogs';
import {
    MatDialog
} from '@angular/material';
import {
    Unsubscribable,
} from 'rxjs';

@Component({
    templateUrl: 'manage.component.html',
    styleUrls: ['manage.component.scss']
})
export class AssetManageComponent implements OnInit, OnDestroy {
    // public assets: PageData<Asset>;
    // public watch: Balance[] = [];
    private requesting = false;
    public allAssets: PageData < Asset > ; // 所有的资产
    public searchAssets: any = false; // 所有的资产
    public displayAssets: Balance[] = []; // 要显示的资产
    public watch: Balance[]; // 用户添加的资产
    public isLoading: boolean;
    public isSearch: boolean = false;
    public searchValue: string;
    public unSubBalance: Unsubscribable;
    public unSubAll: Unsubscribable;

    constructor(
        private asset: AssetState,
        private chrome: ChromeService,
        private neon: NeonService,
        public global: GlobalService,
        private dialog: MatDialog,
    ) {}

    ngOnInit(): void {
        this.unSubBalance = this.asset.balance().pipe(switchMap((res) => this.chrome.getWatch().pipe(map((watching) => {
            this.displayAssets = [];
            this.displayAssets.push(...res)
            //  去重
            let newWatch = [];
            watching.forEach((w) => {
                if (res.findIndex((r) => r.asset_id === w.asset_id) < 0) {
                    newWatch.push(w);
                }
            });
            this.watch = newWatch;
            this.displayAssets.push(...newWatch);
            return res;
        })))).subscribe(() => {
            this.unSubAll = this.asset.all().subscribe(res => {
                this.allAssets = res;
                this.allAssets.items.forEach((element, index) => {
                    this.allAssets.items[index].watching =
                        this.displayAssets.findIndex((w: Balance) => w.asset_id === element.asset_id) >= 0;
                    this.getAssetSrc(element.asset_id, index, 'all');
                });
                if (this.searchAssets && this.global.searchBalance && this.global.searchBalance.asset_id) {
                    let i = this.searchAssets.findIndex(w => w.asset_id === this.global.searchBalance.asset_id);
                    if (i >= 0) {
                        this.searchAssets[i].watching = false;
                    }
                    this.global.searchBalance = {};
                }
            });
        });

        this.asset.fetchAll(1);
        this.asset.fetchBalance(this.neon.address);
    }

    ngOnDestroy(): void {
        if (this.unSubAll) {
            this.unSubAll.unsubscribe();
        }
        if (this.unSubBalance) {
            this.unSubBalance.unsubscribe();
        }
    }

    public getAssetSrc(assetId, index, type) {
        const imageObj = this.asset.assetFile.get(assetId);
        let lastModified = '';
        if (imageObj) {
            lastModified = imageObj['last-modified'];
            if (type === 'all') {
                this.allAssets.items[index].avatar = imageObj['image-src'];
            } else if (type === 'search') {
                this.displayAssets[index].avatar = imageObj['image-src'];
            }
        }
        this.asset.getAssetSrc(assetId, lastModified).subscribe(assetRes => {
            if (assetRes && assetRes['status'] === 200) {
                this.asset.setAssetFile(assetRes, assetId).then(src => {
                    if (type === 'all') {
                        this.allAssets.items[index].avatar = src;
                    } else if (type === 'search') {
                        this.displayAssets[index].avatar = src;
                    }
                });
            } else if (assetRes && assetRes['status'] === 404) {
                if (type === 'all') {
                    this.allAssets.items[index].avatar = this.asset.defaultAssetSrc;
                } else if (type === 'search') {
                    this.displayAssets[index].avatar = this.asset.defaultAssetSrc;
                }
            }
        });
    }

    public addAsset(index: number) {
        const assetItem = this.searchAssets === false ? this.allAssets.items[index] : this.searchAssets[index];
        this.dialog.open(PopupAddTokenDialogComponent, {
            data: assetItem
        }).afterClosed().subscribe((confirm) => {
            if (confirm) {
                if (this.searchAssets !== false) {
                    // this.displayAssets.push(assetItem);
                    const i = this.allAssets.items.findIndex((a) => a.asset_id === assetItem.asset_id);
                    if (i >= 0) {
                        this.allAssets.items[i].watching = true;
                    }
                    this.searchAssets[index].watching = true;
                } else {
                    // this.displayAssets.push(assetItem);
                    this.allAssets.items[index].watching = true;
                }
                this.watch.push(assetItem);
                this.chrome.setWatch(this.watch);
                this.global.snackBarTip('addSucc');
                this.asset.fetchBalance(this.neon.address);
            }
        })
    }

    public page(page: number) {
        if (this.requesting) {
            return;
        }
        this.requesting = true;
        this.asset.fetchAll(page, true).finally(() => {
            this.requesting = false;
        });
    }

    public filter(id: string) {
        return ![NEO, GAS, EXT, EDS].includes(id);
    }

    public searchCurrency() {
        if (this.searchValue) {
            this.asset.searchAsset(this.searchValue).subscribe(res => {
                this.searchAssets = res;
                this.searchAssets.forEach((element, index) => {
                    this.getAssetSrc(element.asset_id, index, 'search');
                });
            });
        } else {
            this.searchAssets = false;
        }
    }
}
