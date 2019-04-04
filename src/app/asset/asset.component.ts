import {
    Component,
    OnInit,
    OnChanges,
} from '@angular/core';
import {
    AssetState,
    NeonService,
    GlobalService,
    ChromeService,
} from '@app/core';
import {
    map,
} from 'rxjs/operators';
import {
    Balance,
} from '@/models/models';
import {
    MatDialog
} from '@angular/material';
import {
    PopupDelTokenDialogComponent
} from '@popup/_dialogs';
import {
    ActivatedRoute
} from '@angular/router';

@Component({
    templateUrl: 'asset.component.html',
    styleUrls: ['asset.component.scss']
})
export class AssetComponent implements OnInit {
    public address: string = '';
    public displayAssets; // 要显示的资产
    public watch: Balance[]; // 用户添加的资产
    public rateSymbol = '';
    public rateCurrency: string;

    constructor(
        private asset: AssetState,
        private neon: NeonService,
        private chrome: ChromeService,
        private global: GlobalService,
        private dialog: MatDialog,
        private aRoute: ActivatedRoute,
    ) {}

    ngOnInit(): void {
        this.address = this.neon.address;
        this.chrome.getRateCurrency().subscribe(rateCurrency => {
            this.rateCurrency = rateCurrency;
            this.asset.fetchBalanceTemp(this.neon.address).pipe(map(balanceRes => {
                this.displayAssets = [];
                this.rateSymbol = '';
                balanceRes.forEach(r => {
                    if (r.balance && r.balance > 0) {
                        this.rateSymbol += r.symbol + ',';
                    }
                    this.displayAssets.push(r);
                });
                this.rateSymbol = this.rateSymbol.slice(0, -1);
                this.getAssetRate();
                return balanceRes;
            })).subscribe((balanceRes) => this.chrome.getWatch().subscribe(watching => {
                const newWatch = [];
                watching.forEach((w) => {
                    if (balanceRes.findIndex((r) => r.asset_id === w.asset_id) < 0) {
                        newWatch.push(w);
                    }
                });
                this.watch = newWatch;
                this.displayAssets.push(...newWatch);
            }));
        });
        this.asset.popAddAssetId().subscribe(assetItem => {
            if (!assetItem) {
                return;
            }
            this.displayAssets.push(assetItem);
        });
    }

    // 获取资产汇率
    public getAssetRate() {
        if (!this.rateSymbol) {
            return;
        }
        this.rateCurrency = this.rateCurrency;
        let query = {};
        query['symbol'] = this.rateCurrency;
        query['coins'] = this.rateSymbol;
        this.asset.getRate(query).subscribe(rateBalance => {
            const tempRateObj = rateBalance.result;
            if (JSON.stringify(tempRateObj) === '{}') {
                return;
            }
            this.displayAssets.map(d => {
                if (d.symbol.toLowerCase() in tempRateObj) {
                    d.rateBalance = Number(tempRateObj[d.symbol]) * d.balance;
                }
                return d;
            });
        });
    }

    // 隐藏资产
    public delAsset(index: number) {
        const delId = this.displayAssets[index].asset_id;
        this.dialog.open(PopupDelTokenDialogComponent).afterClosed().subscribe((confirm) => {
            if (confirm) {
                const i = this.watch.findIndex((w) => w.asset_id === this.displayAssets[index].asset_id);
                if (i >= 0) {
                    this.watch.splice(i, 1);
                    this.chrome.setWatch(this.watch);
                }
                this.global.searchBalance = this.displayAssets[index];
                this.displayAssets.splice(index, 1);
                this.global.snackBarTip('hiddenSucc');
                this.asset.pushDelAssetId(delId);
            }
        });
    }
}
