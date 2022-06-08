import { Component, OnInit, ViewChild } from '@angular/core';
import {
    AssetState,
    NeonService,
    GlobalService,
    ChromeService,
    TransferService,
    HomeService,
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
import { Neo3TransferService } from '../transfer/neo3-transfer.service';
import { interval } from 'rxjs';
import { take } from 'rxjs/operators';

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
    private intervalN3Claim = null;
    showClaim = false;
    init = false;

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
        private router: Router,
        private neo3TransferService: Neo3TransferService,
        private homeService: HomeService
    ) {
        this.wallet = this.neon.wallet;
        this.rateCurrency = this.assetState.rateCurrency;
        this.assetId =
            this.neon.currentWalletChainType === 'Neo2' ? NEO : NEO3_CONTRACT;
        this.currentWalletIsN3 = this.neon.currentWalletChainType === 'Neo3';
    }

    ngOnInit(): void {
        if (
            this.neon.currentWalletChainType === 'Neo3' &&
            this.homeService.loading &&
            new Date().getTime() - this.homeService.claimTxTime < 20000
        ) {
            this.loading = this.homeService.loading;
            this.showClaim = this.homeService.showClaim;
            this.claimNumber = this.homeService.claimNumber;
            this.getTxStatus();
        }
        this.initClaim();
        this.showBackup = this.chrome.getHaveBackupTip();
        if (this.wallet.accounts[0]?.extra?.ledgerSLIP44) {
            this.showBackup = false;
        }
        if (this.showBackup === null) {
            this.chrome.getWalletStatus(this.neon.address).subscribe((res) => {
                this.showBackup = !res;
            });
        }
    }

    ngOnDestroy(): void {
        if (this.intervalN3Claim) {
            clearInterval(this.intervalN3Claim);
        }
        if (this.neon.currentWalletChainType === 'Neo3') {
            this.homeService.claimTxTime = new Date().getTime();
            this.homeService.claimNumber = this.claimNumber;
            this.homeService.showClaim = this.showClaim;
            this.homeService.loading = this.loading;
        }
    }

    initNeo($event) {
        this.balance = $event;
    }

    //#region user click function
    toWeb() {
        this.showMenu = false;
        switch (this.neon.currentWalletChainType) {
            case 'Neo2':
                if (this.global.n2Network.explorer) {
                    window.open(
                        `${this.global.n2Network.explorer}address/${this.neon.address}/page/1`
                    );
                }
                break;
            case 'Neo3':
                if (this.global.n3Network.explorer) {
                    window.open(
                        `${this.global.n3Network.explorer}address/${this.neon.address}`
                    );
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

    toAdd() {
        if (
            this.neon.currentWalletChainType === 'Neo3' &&
            this.selectedIndex === 1
        ) {
            this.router.navigateByUrl('/popup/add-nft');
        } else {
            this.router.navigateByUrl('/popup/add-asset');
        }
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
        if (this.neon.currentWalletChainType === 'Neo2') {
            this.neon.claimGAS(this.claimsData).subscribe((tx) => {
                tx.forEach((item) => {
                    try {
                        rpc.Query.sendRawTransaction(
                            item.serialize(true)
                        ).execute(this.global.n2Network.rpcUrl);
                    } catch (error) {
                        this.loading = false;
                    }
                });
                if (this.intervalClaim === null) {
                    this.initInterval();
                }
            });
        } else {
            if (this.intervalN3Claim) {
                clearInterval(this.intervalN3Claim);
            }
            const params = {
                addressFrom: this.neon.address,
                addressTo: this.neon.address,
                tokenScriptHash: NEO3_CONTRACT,
                amount: 0,
                networkFee: 0,
                decimals: 0,
            };
            const wif =
                this.neon.WIFArr[
                    this.neon.walletArr.findIndex(
                        (item) => item.accounts[0].address === this.neon.address
                    )
                ];
            this.neo3TransferService.createNeo3Tx(params).subscribe((tx) => {
                tx.sign(wif, this.global.n3Network.magicNumber);
                this.neo3TransferService.sendNeo3Tx(tx).then((hash) => {
                    this.homeService.claimGasHash = hash;
                    this.getTxStatus();
                });
            });
        }
    }

    getTxStatus() {
        const queryTxInterval = interval(5000)
            .pipe(take(5))
            .subscribe(() => {
                this.homeService
                    .getN3RawTransaction(this.homeService.claimGasHash)
                    .then((res) => {
                        if (res.blocktime) {
                            queryTxInterval.unsubscribe();
                            this.loading = false;
                            this.claimStatus = this.status.success;
                            setTimeout(() => {
                                this.initClaim();
                            }, 3000);
                        }
                    });
            });
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
        if (this.neon.currentWalletChainType === 'Neo2') {
            this.assetState
                .fetchClaim(this.neon.address)
                .subscribe((res: any) => {
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
        } else {
            if (
                this.loading &&
                new Date().getTime() - this.homeService.claimTxTime < 20000
            ) {
                return;
            }
            this.getN3UnclaimedGas();
            if (this.intervalN3Claim) {
                clearInterval(this.intervalN3Claim);
            }
            this.intervalN3Claim = setInterval(() => {
                this.getN3UnclaimedGas();
            }, 15000);
        }
    }

    getN3UnclaimedGas() {
        this.assetState.getUnclaimedGas(this.neon.address).subscribe((res) => {
            if (res?.unclaimed && res?.unclaimed !== '0') {
                this.claimNumber = new BigNumber(res?.unclaimed)
                    .shiftedBy(-8)
                    .toNumber();
                this.claimStatus = this.status.confirmed;
                this.showClaim = true;
            } else {
                this.showClaim = false;
                clearInterval(this.intervalN3Claim);
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
