import { Component, OnInit, ViewChild } from '@angular/core';
import {
    AssetState,
    NeonService,
    ChromeService,
    GlobalService,
} from '@/app/core';
import { ActivatedRoute, Router } from '@angular/router';
import { NEO, Balance, GAS, Asset } from '@/models/models';
import { PopupTxPageComponent } from '@share/components/tx-page/tx-page.component';
import { MatDialog } from '@angular/material/dialog';
import { PopupConfirmDialogComponent } from '@popup/_dialogs';
import { bignumber } from 'mathjs';
import BigNumber from 'bignumber.js';
import { NetworkType } from '../_lib';

@Component({
    templateUrl: 'asset-detail.component.html',
    styleUrls: ['asset-detail.component.scss'],
})
export class PopupAssetDetailComponent implements OnInit {
    balance: Balance;
    assetId: string;
    rateCurrency: string;
    // Transaction Record
    @ViewChild('txPage') txPageComponent: PopupTxPageComponent;
    sourceScrollHeight = 0;
    currentTxPage = 1;

    showMenu = false;
    watch: Asset[]; // User-added assets
    canHideBalance = false;
    network: NetworkType;

    constructor(
        private assetState: AssetState,
        private aRouter: ActivatedRoute,
        private chrome: ChromeService,
        private neon: NeonService,
        private dialog: MatDialog,
        private global: GlobalService,
        private router: Router
    ) {
        this.rateCurrency = this.assetState.rateCurrency;
    }

    ngOnInit(): void {
        this.network = this.neon.currentWalletChainType === 'Neo2' ? this.global.n2Network.network : this.global.n3Network.network;
        this.aRouter.params.subscribe(async (params: any) => {
            this.assetId = params.assetId || NEO;
            // 获取资产信息
            this.assetState
                .getAddressBalances(this.neon.address)
                .then((balanceArr) => {
                    this.handlerBalance(balanceArr);
                });
            this.chrome
                .getWatch(this.neon.address, this.neon.currentWalletChainType, this.network)
                .subscribe((res) => {
                    this.watch = res;
                    this.canHideBalance =
                        res.findIndex((w) => w.asset_id === this.assetId) >= 0;
                });
        });
    }

    handlerBalance(balanceRes: Balance[]) {
        this.chrome
            .getWatch(this.neon.address, this.neon.currentWalletChainType, this.network)
            .subscribe((watching) => {
                this.findBalance(balanceRes, watching);
                // 获取资产汇率
                this.getAssetRate();
            });
    }

    findBalance(balanceRes, watching) {
        const balance =
            balanceRes.find((b) => b.asset_id === this.assetId) ||
            watching.find((w) => w.asset_id === this.assetId);
        balance.balance = Number(balance.balance);
        this.balance = balance;
    }

    getAssetRate() {
        if (
            this.balance.balance &&
            bignumber(this.balance.balance).comparedTo(0) > 0
        ) {
            this.assetState
                .getAssetRate(this.balance.symbol, this.balance.asset_id)
                .then((rate) => {
                    this.balance.rateBalance = new BigNumber(this.balance.balance).times(rate || 0).toFixed() || '0';
                });
        } else {
            this.balance.rateBalance = '0';
        }
    }

    hideBalance() {
        this.dialog
            .open(PopupConfirmDialogComponent, {
                data: 'delAssetTip',
                panelClass: 'custom-dialog-panel',
            })
            .afterClosed()
            .subscribe((confirm) => {
                if (confirm) {
                    const i = this.watch.findIndex(
                        (w) => w.asset_id === this.assetId
                    );
                    if (i >= 0) {
                        this.watch.splice(i, 1);
                        this.chrome.setWatch(
                            this.neon.address,
                            this.watch,
                            this.neon.currentWalletChainType,
                            this.network
                        );
                        this.global.snackBarTip('hiddenSucc');
                        this.router.navigateByUrl('/popup/home');
                    }
                }
            });
    }

    toWeb() {
        this.showMenu = false;
        const isNep5 = this.assetId !== NEO && this.assetId !== GAS;
        switch (this.neon.currentWalletChainType) {
            case 'Neo2':
                if (this.global.n2Network.explorer) {
                    window.open(`${this.global.n2Network.explorer}${isNep5 ? 'nep5' : 'asset'}/${this.assetId}/page/1`)
                }
                break;
            case 'Neo3':
                if (this.global.n3Network.explorer) {
                    window.open(`${this.global.n3Network.explorer}tokens/nep17/${this.assetId}`)
                }
                break;
        }
    }
}
