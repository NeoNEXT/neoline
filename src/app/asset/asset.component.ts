import {
    Component,
    OnInit,
    OnDestroy,
    Output,
    EventEmitter
} from '@angular/core';
import {
    AssetState,
    NeonService,
    GlobalService,
    ChromeService,
} from '@app/core';
import {
    map,
    switchMap
} from 'rxjs/operators';
import {
    PageData,
    Balance,
    Asset,
    RateObj
} from '@/models/models';
import {
    MatDialog
} from '@angular/material';
import {
    PopupDelTokenDialogComponent
} from '@popup/_dialogs';
import {
    Unsubscribable
} from 'rxjs';


@Component({
    templateUrl: 'asset.component.html',
    styleUrls: ['asset.component.scss']
})
export class AssetComponent implements OnInit, OnDestroy {
    public address: string = '';
    public balance: Balance[] = [];

    public allAssets: PageData < Asset > ; // 所有的资产
    public searchAssets: any = false; // 所有的资产
    public displayAssets: Balance[] = []; // 要显示的资产
    public watch: Balance[]; // 用户添加的资产
    public unSubBalance: Unsubscribable;
    public rateCurrency: string;
    public rateSymbol = '';
    public rateObj: RateObj;

    constructor(
        private asset: AssetState,
        private neon: NeonService,
        private chrome: ChromeService,
        private global: GlobalService,
        private dialog: MatDialog,
    ) {}

    ngOnInit(): void {
        // 获取余额大于 0 的资产
        this.address = this.neon.address;
        // this.address = 'AJ1mqgPnsrq9W7K94Y8SS1DM2bGUojCFwb';
        this.chrome.getRateObj().subscribe(rateObj => {
            this.rateObj = rateObj;
            this.initPage();
        });
        this.asset.fetchBalance(this.address);
        this.asset.fetchAll(1);
    }
    ngOnDestroy(): void {
        if (this.unSubBalance) {
            this.unSubBalance.unsubscribe();
        }
    }

    public initPage() {
        this.unSubBalance = this.asset.balance().pipe(switchMap((res) => this.chrome.getWatch().pipe(map((watching) => {
            this.displayAssets = [];
            this.rateSymbol = '';
            res.map(r => {
                if (r.balance && r.balance > 0) {
                    this.rateSymbol += r.symbol + ',';
                }
                this.displayAssets.push(r);
            });
            this.rateSymbol = this.rateSymbol.slice(0, -1);
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
            this.rateCurrency = this.rateObj.currentCurrency;
            let query = {};
            query['symbol'] = this.rateObj.currentCurrency;
            // query['channel'] = this.rateObj.currentChannel;
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
    // 隐藏资产
    public delAsset(index: number) {
        this.dialog.open(PopupDelTokenDialogComponent).afterClosed().subscribe((confirm) => {
            if (confirm) {
                const i = this.watch.findIndex((w) => w.asset_id === this.displayAssets[index].asset_id);
                if (i >= 0) {
                    this.watch.splice(i, 1);
                    this.chrome.setWatch(this.watch);
                }
                this.global.searchBalance = this.displayAssets[index];
                // this.displayAssets.splice(index, 1);
                this.global.snackBarTip('hiddenSucc');
                this.asset.fetchBalance(this.neon.address);
            }
        })
    }
}
