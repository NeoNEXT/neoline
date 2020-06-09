import {
    Component,
    OnInit,
    OnDestroy
} from '@angular/core';
import {
    PageData,
    Balance,
    Asset,
} from '@/models/models';
import {
    AssetState,
    ChromeService,
    NeonService,
    GlobalService
} from '@/app/core';
import {
    map,
    mapTo,
    switchMap
} from 'rxjs/operators';
import {
    MatDialog
} from '@angular/material/dialog';


import {
    PopupAddTokenDialogComponent,
    PopupDelTokenDialogComponent
} from '@popup/_dialogs';

@Component({
    templateUrl: 'assets.component.html',
    styleUrls: ['assets.component.scss']
})
export class PopupAssetsComponent implements OnInit {
    public allAssets: PageData < Asset > ; // 所有的资产
    public searchAssets: any = false; // 所有的资产
    public displayAssets: Balance[] = []; // 要显示的资产
    public watch: Balance[]; // 用户添加的资产
    public isLoading: boolean;
    public isSearch: boolean = false;
    public searchValue: string;
    public rateSymbol = '';
    public rateCurrency: string;

    constructor(
        private asset: AssetState,
        private chrome: ChromeService,
        private neon: NeonService,
        private dialog: MatDialog,
        private global: GlobalService
    ) {
        this.watch = [];
        this.displayAssets = [];
        this.isLoading = false;
        this.rateCurrency = this.asset.rateCurrency;
    }

    ngOnInit(): void {
        // let address = 'Af1FkesAboWnz7PfvXsEiXiwoH3PPzx7ta';
        this.getBalance();
    }

    public getBalance() {
        this.asset.fetchBalance(this.neon.address).pipe(switchMap((res) => this.chrome.getWatch().pipe(map((watching) => {
            this.displayAssets = [];
            this.rateSymbol = '';
            res.map((r, index) => {
                if (r.balance && r.balance > 0) {
                    this.rateSymbol += r.symbol + ',';
                }
                this.displayAssets.push(r);
                this.getAssetSrc(r.asset_id, index, 'display');
            });
            this.rateSymbol = this.rateSymbol.slice(0, -1);
            this.getAssetRate();
            //  去重
            const newWatch = [];
            watching.forEach((w, index) => {
                if (res.findIndex((r) => r.asset_id === w.asset_id) < 0) {
                    newWatch.push(w);
                    this.displayAssets.push(w);
                    this.getAssetSrc(w.asset_id, res.length + index, 'display');
                }
            });
            this.watch = newWatch;
            // this.displayAssets.push(...newWatch);
            return res;
        })))).subscribe(() => {
            this.getAllBalance(1);
        });
    }

    public getAllBalance(page) {
        this.isLoading = true;
        this.asset.fetchAll(page).then(res => {
            this.allAssets = res;
            this.allAssets.items.forEach((e, index) => {
                this.getAssetSrc(e.asset_id, index, 'all');
                this.allAssets.items[index].watching = this.displayAssets.findIndex((w: Balance) => w.asset_id === e.asset_id) >= 0;
            });
            this.isLoading = false;
        });
    }

    // 获取资产汇率
    public getAssetRate() {
        this.asset.getAssetRate(this.rateSymbol).subscribe(rateBalance => {
            this.displayAssets.map(d => {
                if (d.symbol.toLowerCase() in rateBalance) {
                    d.rateBalance = rateBalance[d.symbol.toLowerCase()] * d.balance;
                }
                return d;
            });
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
            } else if (type === 'display') {
                this.displayAssets[index].avatar = imageObj['image-src'];
            }
        }
        this.asset.getAssetSrc(assetId, lastModified).subscribe(assetRes => {
            if (assetRes && assetRes['status'] === 200) {
                this.asset.setAssetFile(assetRes, assetId).then(src => {
                    if (type === 'all') {
                        this.allAssets.items[index].avatar = src;
                    } else if (type === 'search') {
                        this.searchAssets[index].avatar = src;
                    } else if (type === 'display') {
                        this.displayAssets[index].avatar = src;
                    }
                });
            } else if (assetRes && assetRes['status'] === 404) {
                if (type === 'all') {
                    this.allAssets.items[index].avatar = this.asset.defaultAssetSrc;
                } else if (type === 'search') {
                    this.searchAssets[index].avatar = this.asset.defaultAssetSrc;
                } else if (type === 'display') {
                    this.displayAssets[index].avatar = this.asset.defaultAssetSrc;
                }
            }
        });
    }

    public page(page: number) {
        this.isLoading = true;
        this.getAllBalance(page);
    }

    public addAsset(index: number) {
        const assetItem = this.searchAssets === false ? this.allAssets.items[index] : this.searchAssets[index];
        this.dialog.open(PopupAddTokenDialogComponent, {
            data: assetItem
        }).afterClosed().subscribe((confirm) => {
            if (confirm) {
                if (this.searchAssets !== false) {
                    const i = this.allAssets.items.findIndex((a) => a.asset_id === assetItem.asset_id);
                    if (i >= 0) {
                        this.allAssets.items[i].watching = true;
                    }
                    this.searchAssets[index].watching = true;
                    this.displayAssets.push(this.searchAssets[index]);
                } else {
                    this.allAssets.items[index].watching = true;
                    this.displayAssets.push(this.allAssets.items[index]);
                }
                this.watch.push(assetItem);
                this.chrome.setWatch(this.watch);
                this.global.snackBarTip('addSucc');
            }
        });
    }

    public delAsset(index: number) {
        this.dialog.open(PopupDelTokenDialogComponent).afterClosed().subscribe((confirm) => {
            if (confirm) {
                const i = this.watch.findIndex((w) => w.asset_id === this.displayAssets[index].asset_id);
                if (i >= 0) {
                    this.watch.splice(i, 1);
                    this.chrome.setWatch(this.watch);
                }
                for (const allIndex in this.allAssets.items) {
                    if (this.allAssets.items[allIndex].asset_id === this.displayAssets[index].asset_id) {
                        this.allAssets.items[allIndex].watching = false;
                        break;
                    }
                }
                this.displayAssets.splice(index, 1);
                this.global.snackBarTip('hiddenSucc');
            }
        });
    }


    public searchCurrency() {
        if (this.searchValue) {
            this.asset.searchAsset(this.searchValue).subscribe(res => {
                this.searchAssets = res;
                this.searchAssets.forEach((s, index) => {
                    this.searchAssets[index].watching = this.displayAssets.findIndex((w: Balance) => w.asset_id === s.asset_id) >= 0;
                    this.getAssetSrc(s.asset_id, index, 'search');
                });
            })
        } else {
            this.searchAssets = false;
        }
    }

    public search() {
        this.isSearch = true;
    }

    public backDisplayAssets() {
        this.isSearch = false;
        this.searchValue = '';
        this.searchAssets = false;
    }
}
