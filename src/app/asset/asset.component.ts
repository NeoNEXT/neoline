import { Component, OnInit, OnChanges, OnDestroy } from '@angular/core';
import {
    AssetState,
    NeonService,
    GlobalService,
    ChromeService,
} from '@app/core';
import { map } from 'rxjs/operators';
import { Asset, Balance } from '@/models/models';
import { MatDialog } from '@angular/material/dialog';
import { PopupConfirmDialogComponent } from '@popup/_dialogs';
import { ActivatedRoute } from '@angular/router';
import { Unsubscribable } from 'rxjs';
import { bignumber } from 'mathjs';

@Component({
    templateUrl: 'asset.component.html',
    styleUrls: ['asset.component.scss'],
})
export class AssetComponent implements OnInit, OnDestroy {
    public address: string = '';
    public displayAssets; // 要显示的资产
    public watch: Asset[]; // 用户添加的资产
    public rateSymbol = '';
    public rateCurrency: string;

    public unSubAddAsset: Unsubscribable;
    public unSubBalance: Unsubscribable;

    constructor(
        private asset: AssetState,
        private neon: NeonService,
        private chrome: ChromeService,
        private global: GlobalService,
        private dialog: MatDialog,
        private aRoute: ActivatedRoute
    ) {}

    ngOnInit(): void {
        this.address = this.neon.address;
        this.rateCurrency = this.asset.rateCurrency;
        this.unSubBalance = this.asset.balanceSub$.subscribe((balanceArr) => {
            this.handlerBalance(balanceArr);
        });
        this.asset.fetchBalance(this.neon.address).subscribe((balanceArr) => {
            this.handlerBalance(balanceArr);
        });
        this.unSubAddAsset = this.asset
            .popAddAssetId()
            .subscribe((assetItem) => {
                if (!assetItem) {
                    return;
                }
                this.displayAssets.push(assetItem);
            });
    }

    ngOnDestroy(): void {
        if (this.unSubAddAsset) {
            this.unSubAddAsset.unsubscribe();
        }
        if (this.unSubBalance) {
            this.unSubBalance.unsubscribe();
        }
    }

    public handlerBalance(balanceRes: Balance[]) {
        this.displayAssets = [];
        this.rateSymbol = '';
        balanceRes.forEach((r) => {
            if (r.balance && bignumber(r.balance).comparedTo(0) === 1) {
                this.rateSymbol += r.symbol + ',';
            }
            this.displayAssets.push(r);
        });
        this.rateSymbol = this.rateSymbol.slice(0, -1);
        this.getAssetRate();
        this.chrome.getWatch(this.address).subscribe((watching) => {
            const newWatch = [];
            watching.forEach((w) => {
                if (
                    balanceRes.findIndex((r) => r.asset_id === w.asset_id) < 0
                ) {
                    newWatch.push(w);
                }
            });
            this.watch = newWatch;
            this.displayAssets.push(...newWatch);
        });
    }

    // 获取资产汇率
    public getAssetRate() {
        this.asset.getAssetRate(this.rateSymbol).subscribe((rateBalance) => {
            this.displayAssets.map((d) => {
                if (d.symbol.toLowerCase() in rateBalance) {
                    d.rateBalance =
                        (rateBalance[d.symbol.toLowerCase()] || 0) * d.balance;
                }
                return d;
            });
        });
    }

    // 隐藏资产
    public delAsset(index: number) {
        const delId = this.displayAssets[index].asset_id;
        this.dialog
            .open(PopupConfirmDialogComponent, {
                data: 'delAssetTip',
                panelClass: 'custom-dialog-panel',
            })
            .afterClosed()
            .subscribe((confirm) => {
                if (confirm) {
                    const i = this.watch.findIndex(
                        (w) => w.asset_id === this.displayAssets[index].asset_id
                    );
                    if (i >= 0) {
                        this.watch.splice(i, 1);
                        this.chrome.setWatch(this.neon.address, this.watch);
                    }
                    this.displayAssets.splice(index, 1);
                    this.global.snackBarTip('hiddenSucc');
                    this.asset.pushDelAssetId(delId);
                }
            });
    }
}
