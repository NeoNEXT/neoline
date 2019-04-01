import {
    Component,
    OnInit,
    OnDestroy
} from '@angular/core';
import {
    PageData,
    Balance,
    Asset,
    RateObj
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
} from '@angular/material';


import {
    PopupAddTokenDialogComponent,
    PopupDelTokenDialogComponent
} from '@popup/_dialogs';
import {
    Unsubscribable
} from 'rxjs';

@Component({
    templateUrl: 'assets.component.html',
    styleUrls: ['assets.component.scss']
})
export class PopupAssetsComponent implements OnInit, OnDestroy {
    public allAssets: PageData < Asset > ; // 所有的资产
    public searchAssets: any = false; // 所有的资产
    public fillAssets: Balance[]; // 余额大于0的资产
    public displayAssets: Balance[] = []; // 要显示的资产
    public watch: Balance[]; // 用户添加的资产
    public isLoading: boolean;
    public isSearch: boolean = false;
    public searchValue: string;
    public unSubBalance: Unsubscribable;
    public unSubAll: Unsubscribable;
    public rateSymbol = '';
    public rateCurrency: string;
    public rateObj: RateObj;

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
    }

    ngOnInit(): void {
        // let address = 'Af1FkesAboWnz7PfvXsEiXiwoH3PPzx7ta';
        this.chrome.getRateObj().subscribe(rateObj => {
            this.rateObj = rateObj;
            this.initPage();
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

    public initPage() {
        this.unSubBalance = this.asset.balance().pipe(switchMap((res) => this.chrome.getWatch().pipe(map((watching) => {
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
            this.unSubAll = this.asset.all().subscribe(res => {
                res.items = res.items.map((e, index) => {
                    this.getAssetSrc(e.asset_id, index, 'all');
                    e.watching = this.displayAssets.findIndex((w: Balance) => w.asset_id === e.asset_id) >= 0;
                    return e;
                });
                this.allAssets = res;
            });
            this.rateCurrency = this.rateObj.currentCurrency;
            let query = {};
            query['symbol'] = this.rateObj.currentCurrency;
            query['channel'] = this.rateObj.currentChannel;
            query['coins'] = this.rateSymbol;
            if (!this.rateSymbol) {
                return;
            }
            this.asset.getRate(query).subscribe(rateBalance => {
                let k = 0;
                for (let i = 0; i < this.displayAssets.length; i++) {
                    if (k >= rateBalance.length) {
                        break;
                    }
                    for (let j = k; j < rateBalance.result.length; j++) {
                        if (String(Object.keys(rateBalance.result[j])).toLowerCase() === this.displayAssets[i].symbol.toLowerCase()) {
                            this.displayAssets[i].rateBalance =
                                Number(Object.values(rateBalance.result[j])[0]) * this.displayAssets[i].balance;
                            k = j + 1;
                            break;
                        }
                    }
                }
            });
        });
    }

    public getAssetSrc(assetId, index, type = 'all') {
        this.asset.getAssetSrc(assetId).subscribe(assetRes => {
            if (typeof assetRes === 'string') {
                if (type === 'all') {
                    this.allAssets.items[index].avatar = assetRes;
                } else if (type === 'display') {
                    this.displayAssets[index].avatar = assetRes;
                } else {
                    this.searchAssets[index].avatar = assetRes;
                }
            } else {
                this.asset.setAssetFile(assetRes, assetId).then(src => {
                    if (type === 'all') {
                        this.allAssets.items[index].avatar = src;
                    } else if (type === 'display') {
                        this.displayAssets[index].avatar = src;
                    } else {
                        this.searchAssets[index].avatar = src;
                    }
                });
            }
        });
    }

    public page(page: number) {
        this.isLoading = true;

        this.asset.fetchAll(page, true).finally(() => {
            this.isLoading = false;
        });
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
                } else {
                    this.allAssets.items[index].watching = true;
                }
                this.watch.push(assetItem);
                this.chrome.setWatch(this.watch);
                this.global.snackBarTip('addSucc');
                this.asset.fetchBalance(this.neon.address);
            }
        })
    }

    public delAsset(index: number) {
        this.dialog.open(PopupDelTokenDialogComponent).afterClosed().subscribe((confirm) => {
            if (confirm) {
                const i = this.watch.findIndex((w) => w.asset_id === this.displayAssets[index].asset_id);
                if (i >= 0) {
                    this.watch.splice(i, 1);
                    this.chrome.setWatch(this.watch);
                }
                this.allAssets.items.forEach((item, i) => {
                    if (item.asset_id === this.displayAssets[index].asset_id) {
                        this.allAssets.items[i].watching = false;
                        return;
                    }
                });
                this.global.snackBarTip('hiddenSucc');
                this.asset.fetchBalance(this.neon.address);
            }
        })
    }


    public searchCurrency() {
        if (this.searchValue) {
            this.asset.searchAsset(this.searchValue).subscribe(res => {
                res = res.map((e) => {
                    e.watching = this.displayAssets.findIndex((w: Balance) => w.asset_id === e.asset_id) >= 0;
                    return e;
                });
                this.searchAssets = res;
                this.searchAssets.forEach((s, index) => {
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
