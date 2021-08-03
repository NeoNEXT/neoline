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

@Component({
    templateUrl: 'asset-detail.component.html',
    styleUrls: ['asset-detail.component.scss'],
})
export class PopupAssetDetailComponent implements OnInit {
    balance: Balance;
    assetId: string;
    imageUrl = '';
    rateCurrency: string;
    // 交易记录
    @ViewChild('txPage') txPageComponent: PopupTxPageComponent;
    sourceScrollHeight = 0;
    currentTxPage = 1;

    // 菜单
    showMenu = false;
    watch: Asset[]; // 用户添加的资产
    canHideBalance = false;
    net: string;

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
        this.net = this.global.net;
        this.aRouter.params.subscribe(async (params: any) => {
            this.assetId = params.assetId || NEO;
            this.imageUrl = await this.assetState.getAssetImageFromAssetId(
                this.assetId
            );
            // 获取资产信息
            this.assetState
                .fetchBalance(this.neon.address)
                .subscribe((balanceArr) => {
                    this.handlerBalance(balanceArr);
                });
            this.chrome.getWatch(this.neon.address, this.neon.currentWalletChainType).subscribe((res) => {
                this.watch = res;
                this.canHideBalance =
                    res.findIndex((w) => w.asset_id === this.assetId) >= 0;
            });
        });
    }

    handlerBalance(balanceRes: Balance[]) {
        this.chrome.getWatch(this.neon.address, this.neon.currentWalletChainType).subscribe((watching) => {
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
                .getAssetRate(this.balance.symbol)
                .subscribe((rateBalance) => {
                    if (this.balance.symbol.toLowerCase() in rateBalance) {
                        this.balance.rateBalance =
                            bignumber(
                                rateBalance[
                                    this.balance.symbol.toLowerCase()
                                ] || '0'
                            )
                                .mul(bignumber(this.balance.balance))
                                .toNumber() || 0;
                    } else {
                        this.balance.rateBalance = 0;
                    }
                });
        } else {
            this.balance.rateBalance = 0;
        }
    }

    public onScrolltaChange(el: Element) {
        const clientHeight = el.clientHeight;
        const scrollHeight = el.scrollHeight;
        const scrollTop = el.scrollTop;
        if (
            scrollHeight - clientHeight < scrollTop + 100 &&
            this.sourceScrollHeight < scrollHeight &&
            !this.txPageComponent.noMoreData
        ) {
            this.txPageComponent.getInTransactions(++this.currentTxPage);
            this.sourceScrollHeight = scrollHeight;
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
                        this.chrome.setWatch(this.neon.address, this.watch, this.neon.currentWalletChainType);
                        this.global.snackBarTip('hiddenSucc');
                        this.router.navigateByUrl('/popup/home');
                    }
                }
            });
    }

    toWeb() {
        this.showMenu = false;
        const isNep5 = this.assetId !== NEO && this.assetId !== GAS;
        console.log(
            `https://${this.net === 'TestNet' ? 'testnet.' : ''}neotube.io/${
                isNep5 ? 'nep5' : 'asset'
            }/${this.assetId}`
        );
        switch (this.neon.currentWalletChainType) {
            case 'Neo2':
                window.open(
                    `https://${this.net === 'TestNet' ? 'testnet.' : ''}neotube.io/${
                        isNep5 ? 'nep5' : 'asset'
                    }/${this.assetId}/page/1`
                );
                break;
            case 'Neo3':
                if (this.net === 'MainNet') {
                    window.open(`https://neo3.neotube.io/tokens/nep17/${this.assetId}`);
                } else {
                    window.open(`https://neo3.testnet.neotube.io/tokens/nep17/${this.assetId}`);
                }
                break;
        }
    }
}
