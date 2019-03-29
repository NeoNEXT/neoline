import {
    Component,
    OnInit,
    OnDestroy
} from '@angular/core';
import {
    PageData,
    Balance,
    Asset
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
        this.unSubBalance = this.asset.balance().pipe(switchMap((res) => this.chrome.getWatch().pipe(map((watching) => {
            this.displayAssets = [];
            this.rateSymbol = '';
            res.map(r => {
                if (r.balance && r.balance > 0) {
                    this.rateSymbol += r.symbol + ',';
                }
                this.displayAssets.push(r);
            });
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
            this.unSubAll = this.asset.all().subscribe(res => {
                res.items = res.items.map((e) => {
                    e.watching = this.displayAssets.findIndex((w: Balance) => w.asset_id === e.asset_id) >= 0;
                    return e;
                });
                this.allAssets = res;
            });
            this.chrome.getRateObj().subscribe(rateObj => {
                this.rateCurrency = rateObj.currentCurrency;
                let query = {};
                query['symbol'] = rateObj.currentCurrency;
                query['channel'] = rateObj.currentChannel;
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
