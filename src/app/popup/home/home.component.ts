import { Component, OnInit, ViewChild } from '@angular/core';
import {
    AssetState,
    NeonService,
    GlobalService,
    ChromeService,
    TransferService,
} from '@/app/core';
import { NEO, GAS, Asset } from '@/models/models';
import { Wallet as Wallet2 } from '@cityofzion/neon-core/lib/wallet';
import { Wallet as Wallet3 } from '@cityofzion/neon-core-neo3/lib/wallet';
import { PopupTxPageComponent } from '@share/components/tx-page/tx-page.component';
import { MatDialog } from '@angular/material/dialog';
import { PopupConfirmDialogComponent } from '../_dialogs';
import { Router } from '@angular/router';
import { rpc } from '@cityofzion/neon-core';
import { bignumber } from 'mathjs';
import { NEO3_CONTRACT, NetworkType } from '../_lib';
import BigNumber from 'bignumber.js';

@Component({
    templateUrl: 'home.component.html',
    styleUrls: ['home.component.scss'],
})
export class PopupHomeComponent implements OnInit {
    @ViewChild('txPage') txPageComponent: PopupTxPageComponent;
    selectedIndex = 0; // asset tab or transaction tab
    private assetId: string;
    wallet: Wallet2 | Wallet3;
    balance: Asset;
    rateCurrency: string;
    network: NetworkType;

    GAS = GAS;

    private status = {
        confirmed: 'confirmed',
        estimated: 'estimated',
        success: 'success',
    };
    claimNumber = 0;
    claimStatus = 'confirmed';
    loading = false;
    private claimsData = null;
    private intervalClaim = null;
    showClaim = false;
    init = false;

    assetList: Asset[] = [];
    showBackup: boolean = null;

    currentWalletIsN3;

    // 菜单
    showMenu = false;
    constructor(
        private assetState: AssetState,
        private neon: NeonService,
        private global: GlobalService,
        private transfer: TransferService,
        private chrome: ChromeService,
        private dialog: MatDialog,
        private router: Router
    ) {
        this.wallet = this.neon.wallet;
        this.rateCurrency = this.assetState.rateCurrency;
        this.assetId =
            this.neon.currentWalletChainType === 'Neo2' ? NEO : NEO3_CONTRACT;
        this.currentWalletIsN3 = this.neon.currentWalletChainType === 'Neo3';
    }

    ngOnInit(): void {
        if (this.neon.currentWalletChainType === 'Neo2') {
            this.initClaim();
        }
        this.getAssetList();
        this.showBackup = this.chrome.getHaveBackupTip();
        if (this.showBackup === null) {
            this.chrome.getWalletStatus(this.neon.address).subscribe((res) => {
                this.showBackup = !res;
            });
        }
    }

    //#region user click function
    toWeb() {
        this.showMenu = false;
        switch (this.neon.currentWalletChainType) {
            case 'Neo2':
                if (this.global.n2Network.explorer) {
                    window.open(`${this.global.n2Network.explorer}address/${this.neon.address}/page/1`)
                }
                break;
            case 'Neo3':
                if (this.global.n3Network.explorer) {
                    window.open(`${this.global.n3Network.explorer}address/${this.neon.address}`)
                }
                break;
        }
    }
    removeAccount() {
        this.showMenu = false;
        this.dialog
            .open(PopupConfirmDialogComponent, {
                data: 'delWalletConfirm',
                panelClass: 'custom-dialog-panel',
            })
            .afterClosed()
            .subscribe((confirm) => {
                if (confirm) {
                    this.neon.delWallet(this.wallet).subscribe(() => {
                        if (this.neon.walletArr.length === 0) {
                            this.router.navigateByUrl(
                                '/popup/wallet/new-guide'
                            );
                        } else {
                            location.reload();
                        }
                    });
                }
            });
    }
    showAddToken(): boolean {
        if (
            this.neon.currentWalletChainType === 'Neo3' &&
            this.selectedIndex === 1
        ) {
            return false;
        }
        return true;
    }
    backupLater() {
        this.chrome.setHaveBackupTip(false);
        this.showBackup = false;
    }
    claim() {
        this.loading = true;
        if (this.claimStatus === this.status.success) {
            this.initClaim();
            return;
        }
        if (this.claimStatus === this.status.estimated) {
            this.syncNow();
            return;
        }
        this.neon.claimGAS(this.claimsData).subscribe((tx) => {
            tx.forEach((item) => {
                try {
                    rpc.Query.sendRawTransaction(item.serialize(true)).execute(
                        this.global.n2Network.rpcUrl
                    );
                } catch (error) {
                    this.loading = false;
                }
            });
            if (this.intervalClaim === null) {
                this.initInterval();
            }
        });
    }
    //#endregion

    //#region asset logo and rate
    async getAssetList() {
        const balanceArr = await this.assetState.getAddressBalances(
            this.wallet.accounts[0].address
        );
        this.balance = balanceArr.find((b) => b.asset_id === this.assetId);
        this.getAssetRate();
        this.chrome
            .getWatch(
                this.neon.address,
                this.neon.currentWalletChainType,
                this.neon.currentWalletChainType === 'Neo2'
                    ? this.global.n2Network.network
                    : this.global.n3Network.network
            )
            .subscribe((watching) => {
                const showAssetList = [];
                let rateSymbol = '';
                console.log(balanceArr);
                console.log(watching);
                balanceArr.map((r) => {
                    if (
                        r.balance &&
                        new BigNumber(r.balance).comparedTo(0) > 0
                    ) {
                        rateSymbol += r.symbol + ',';
                    }
                    showAssetList.push(r);
                });
                rateSymbol = rateSymbol.slice(0, -1);
                this.getAssetListRate(rateSymbol);
                watching.forEach((w) => {
                    if (
                        balanceArr.findIndex((r) => r.asset_id === w.asset_id) <
                        0
                    ) {
                        showAssetList.push(w);
                    }
                });
                this.assetList = showAssetList;
            });
    }
    // Get asset exchange rate
    private getAssetListRate(rateSymbol: string) {
        this.assetState.getAssetRate(rateSymbol).subscribe((rateBalance) => {
            this.assetList.map((d) => {
                if (d.symbol.toLowerCase() in rateBalance) {
                    try {
                        d.rateBalance = new BigNumber(
                            rateBalance[d.symbol.toLowerCase()] || 0
                        )
                            .times(new BigNumber(d.balance))
                            .toFixed();
                    } catch (error) {
                        d.rateBalance = '0';
                    }
                }
                return d;
            });
        });
    }
    private getAssetRate() {
        if (
            this.balance.balance &&
            bignumber(this.balance.balance).comparedTo(0) === 1
        ) {
            this.assetState
                .getAssetRate(this.balance.symbol)
                .subscribe((rateBalance) => {
                    if (this.balance.symbol.toLowerCase() in rateBalance) {
                        this.balance.rateBalance = new BigNumber(
                            rateBalance[this.balance.symbol.toLowerCase()] || 0
                        )
                            .times(new BigNumber(this.balance.balance || 0))
                            .toFixed();
                    } else {
                        this.balance.rateBalance = '0';
                    }
                });
        } else {
            this.balance.rateBalance = '0';
        }
    }
    //#endregion

    //#region claim
    private syncNow() {
        this.transfer
            .create(this.neon.address, this.neon.address, NEO, '1')
            .subscribe(
                async (res) => {
                    const wif =
                        this.neon.WIFArr[
                            this.neon.walletArr.findIndex(
                                (item) =>
                                    item.accounts[0].address ===
                                    this.neon.wallet.accounts[0].address
                            )
                        ];
                    res.sign(wif);
                    try {
                        const result = await rpc.Query.sendRawTransaction(
                            res.serialize(true)
                        ).execute(this.global.n2Network.rpcUrl);
                        if (
                            result.error === undefined ||
                            result.error === null
                        ) {
                            if (this.intervalClaim === null) {
                                this.intervalClaim = setInterval(() => {
                                    this.assetState
                                        .fetchClaim(this.neon.address)
                                        .subscribe((claimRes: any) => {
                                            if (
                                                Number(claimRes.available) !== 0
                                            ) {
                                                this.loading = false;
                                                this.claimsData =
                                                    claimRes.claimable;
                                                this.claimNumber =
                                                    claimRes.available;
                                                clearInterval(
                                                    this.intervalClaim
                                                );
                                                this.claimStatus =
                                                    this.status.confirmed;
                                                this.intervalClaim = null;
                                            }
                                        });
                                }, 10000);
                            } else {
                                this.loading = false;
                            }
                        }
                    } catch (error) {
                        this.loading = false;
                    }
                },
                (err) => {
                    if (this.neon.currentWalletChainType === 'Neo3' && err) {
                        this.global.snackBarTip('wentWrong', err, 10000);
                    } else {
                        this.global.snackBarTip('wentWrong', err);
                    }
                }
            );
    }
    private initClaim() {
        this.assetState.fetchClaim(this.neon.address).subscribe((res: any) => {
            this.claimsData = res.claimable;
            if (res.available > 0) {
                this.claimNumber = res.available;
                this.showClaim = true;
            } else if (res.unavailable > 0) {
                this.claimNumber = res.unavailable;
                this.claimStatus = this.status.estimated;
                this.showClaim = true;
            } else {
                this.showClaim = false;
            }
            this.init = true;
            this.loading = false;
        });
    }
    private initInterval() {
        this.intervalClaim = setInterval(() => {
            this.assetState
                .fetchClaim(this.neon.address)
                .subscribe((claimRes: any) => {
                    if (Number(claimRes.available) === 0) {
                        this.loading = false;
                        this.claimNumber = claimRes.unavailable;
                        clearInterval(this.intervalClaim);
                        this.intervalClaim = null;
                        this.claimStatus = this.status.success;
                    }
                });
        }, 10000);
    }
    //#endregion
}
