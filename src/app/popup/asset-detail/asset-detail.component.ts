import { Component, OnInit, ViewChild } from '@angular/core';
import {
    AssetState,
    NeonService,
    ChromeService,
    GlobalService,
    UtilServiceState,
} from '@/app/core';
import { ActivatedRoute, Router } from '@angular/router';
import { NEO, GAS, Asset } from '@/models/models';
import { PopupTxPageComponent } from '@share/components/tx-page/tx-page.component';
import { MatDialog } from '@angular/material/dialog';
import { PopupConfirmDialogComponent } from '@popup/_dialogs';
import { bignumber } from 'mathjs';
import BigNumber from 'bignumber.js';
import { NEO3_CONTRACT, GAS3_CONTRACT } from '../_lib';

@Component({
    templateUrl: 'asset-detail.component.html',
    styleUrls: ['asset-detail.component.scss'],
})
export class PopupAssetDetailComponent implements OnInit {
    balance: Asset;
    assetId: string;
    rateCurrency: string;
    // Transaction Record
    @ViewChild('txPage') txPageComponent: PopupTxPageComponent;
    sourceScrollHeight = 0;
    currentTxPage = 1;

    showMenu = false;
    watch: Asset[]; // User-added assets
    canHideBalance = false;
    networkId: number;

    constructor(
        private assetState: AssetState,
        private aRouter: ActivatedRoute,
        private chrome: ChromeService,
        private neon: NeonService,
        private dialog: MatDialog,
        private global: GlobalService,
        private router: Router,
        private util: UtilServiceState
    ) {
        this.rateCurrency = this.assetState.rateCurrency;
    }

    ngOnInit(): void {
        this.networkId =
            this.neon.currentWalletChainType === 'Neo2'
                ? this.global.n2Network.id
                : this.global.n3Network.id;
        this.aRouter.params.subscribe(async (params: any) => {
            this.assetId = params.assetId || NEO;
            this.getAssetDetail();
            this.getCanHide();
            this.chrome
                .getWatch(this.networkId, this.neon.address)
                .subscribe((res) => {
                    this.watch = res;
                });
        });
    }

    getCanHide() {
        if (this.neon.currentWalletChainType === 'Neo2') {
            if (this.assetId !== NEO && this.assetId !== GAS) {
                this.canHideBalance = true;
            }
        }
        if (this.neon.currentWalletChainType === 'Neo3') {
            if (
                this.assetId !== NEO3_CONTRACT &&
                this.assetId !== GAS3_CONTRACT
            ) {
                this.canHideBalance = true;
            }
        }
    }

    async getAssetDetail() {
        const balance = await this.assetState.getAddressAssetBalance(
            this.neon.address,
            this.assetId,
            this.neon.currentWalletChainType
        );
        const symbols = await this.util.getAssetSymbols(
            [this.assetId],
            this.neon.currentWalletChainType
        );
        const decimals = await this.util.getAssetDecimals(
            [this.assetId],
            this.neon.currentWalletChainType
        );
        this.balance = {
            asset_id: this.assetId,
            balance: new BigNumber(balance).shiftedBy(-decimals[0]).toFixed(),
            symbol: symbols[0],
            decimals: decimals[0],
        };
        this.getAssetRate();
    }

    getAssetRate() {
        if (
            this.balance.balance &&
            bignumber(this.balance.balance).comparedTo(0) > 0
        ) {
            this.assetState
                .getAssetRate(this.balance.symbol, this.balance.asset_id)
                .then((rate) => {
                    this.balance.rateBalance =
                        new BigNumber(this.balance.balance)
                            .times(rate || 0)
                            .toFixed() || '0';
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
                    } else {
                        this.balance.watching = false;
                        this.watch.push(this.balance);
                    }
                    this.chrome.setWatch(
                        this.networkId,
                        this.neon.address,
                        this.watch
                    );
                    this.global.snackBarTip('hiddenSucc');
                    this.router.navigateByUrl('/popup/home');
                }
            });
    }

    toWeb() {
        this.showMenu = false;
        const isNep5 = this.assetId !== NEO && this.assetId !== GAS;
        switch (this.neon.currentWalletChainType) {
            case 'Neo2':
                if (this.global.n2Network.explorer) {
                    window.open(
                        `${this.global.n2Network.explorer}${
                            isNep5 ? 'nep5' : 'asset'
                        }/${this.assetId}/page/1`
                    );
                }
                break;
            case 'Neo3':
                if (this.global.n3Network.explorer) {
                    window.open(
                        `${this.global.n3Network.explorer}tokens/nep17/${this.assetId}`
                    );
                }
                break;
        }
    }
}
