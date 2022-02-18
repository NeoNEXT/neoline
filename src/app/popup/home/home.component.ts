import {
    Component,
    OnChanges,
    SimpleChanges,
    OnInit,
    OnDestroy,
    ViewChild
} from '@angular/core';
import {
    AssetState,
    NeonService,
    HttpService,
    GlobalService,
    ChromeService
} from '@/app/core';
import { NEO, Balance, Asset, GAS } from '@/models/models';
import { TransferService } from '@/app/transfer/transfer.service';
import { Wallet as Wallet2 } from '@cityofzion/neon-core/lib/wallet';
import { Wallet as Wallet3 } from '@cityofzion/neon-core-neo3/lib/wallet';
import { PopupTxPageComponent } from '@share/components/tx-page/tx-page.component';
import { MatDialog } from '@angular/material/dialog';
import { PopupConfirmDialogComponent } from '../_dialogs';
import { Router } from '@angular/router';
import { rpc } from '@cityofzion/neon-core';
import { bignumber } from 'mathjs';
import { NEO3_CONTRACT, NEO3_MAGIC_NUMBER } from '../_lib';
import BigNumber from 'bignumber.js';
import { Neo3TransferService } from '../transfer/neo3-transfer.service';


@Component({
    templateUrl: 'home.component.html',
    styleUrls: ['home.component.scss']
})
export class PopupHomeComponent implements OnInit, OnDestroy {
    @ViewChild('txPage')
    txPageComponent: PopupTxPageComponent;
    public imageUrl: any = '';
    selectedIndex = 0;
    public assetId: string;
    public wallet: Wallet2 | Wallet3;
    public balance: Balance;
    public rateCurrency: string;
    public net: string;

    private status = {
        confirmed: 'confirmed',
        estimated: 'estimated',
        success: 'success'
    };
    public claimNumber = 0;
    public claimStatus = 'confirmed';
    public loading = false;
    private claimsData = null;
    private intervalClaim = null;
    private intervalN3Claim = null;
    public showClaim = false;
    public init = false;

    public currentTxPage = 2;
    assetList: Asset[] = [];

    showBackup: boolean = null;

    currentWalletIsN3;

    // 菜单
    showMenu = false;
    constructor(
        private assetState: AssetState,
        private neon: NeonService,
        private http: HttpService,
        private global: GlobalService,
        private transfer: TransferService,
        private chrome: ChromeService,
        private dialog: MatDialog,
        private router: Router,
        private neo3TransferService: Neo3TransferService
    ) {
        this.wallet = this.neon.wallet;
        this.rateCurrency = this.assetState.rateCurrency;
        this.assetId = this.neon.currentWalletChainType === 'Neo2' ? NEO : NEO3_CONTRACT;
        this.currentWalletIsN3 = this.neon.currentWalletChainType === 'Neo3';

        const imageObj = this.assetState.assetFile.get(this.assetId);
        let lastModified = '';
        if (imageObj) {
            lastModified = imageObj['last-modified'];
            this.imageUrl = imageObj['image-src'];
        }
    }

    ngOnInit(): void {
        this.net = this.global.net;
        this.initClaim();
        this.getAssetList();
        this.showBackup = this.chrome.getHaveBackupTip();
        if( this.showBackup === null) {
            this.chrome.getWalletStatus(this.neon.address).subscribe(res => {
                this.showBackup = !res;
            });
        }
    }

    ngOnDestroy(): void {
        if (this.intervalN3Claim) {
            clearInterval(this.intervalN3Claim);
        }
    }

    toAdd() {
        if (this.neon.currentWalletChainType === 'Neo3' && this.selectedIndex === 1) {
            this.router.navigateByUrl('/popup/add-nft');
        } else {
            this.router.navigateByUrl('/popup/add-asset');
        }
    }

    getAssetList() {
        this.assetState
            .fetchBalance(this.wallet.accounts[0].address)
            .subscribe(balanceArr => {
                this.handlerBalance(balanceArr);
                this.chrome.getWatch(this.neon.address, this.neon.currentWalletChainType).subscribe(watching => {
                    this.assetList = [];
                    const showAssetList = [];
                    let rateSymbol = '';
                    balanceArr.map((r, index) => {
                        if (r.balance && r.balance > 0) {
                            rateSymbol += r.symbol + ',';
                        }
                        this.assetList.push(r);
                    });
                    rateSymbol = rateSymbol.slice(0, -1);
                    this.getAssetListRate(rateSymbol);
                    //  去重
                    this.assetList.forEach(asset => {
                        if(asset.is_risk !== true || watching.findIndex(item => item.asset_id === asset.asset_id)) {
                            showAssetList.push(asset)
                        }
                    })
                    watching.forEach((w, index) => {
                        if (
                            balanceArr.findIndex(
                                r => r.asset_id === w.asset_id
                            ) < 0
                        ) {
                            showAssetList.push(w);
                        }
                    });
                    this.assetList = showAssetList;
                    this.assetList.forEach((asset, index) => {
                        this.getAssetSrc(asset, index);
                    })
                });
            });
    }

    // 获取资产汇率
    getAssetListRate(rateSymbol: string) {
        this.assetState.getAssetRate(rateSymbol).subscribe(rateBalance => {
            this.assetList.map(d => {
                if (d.symbol.toLowerCase() in rateBalance) {
                    try {
                        d.rateBalance = bignumber(rateBalance[d.symbol.toLowerCase()] || '0').mul(bignumber(d.balance)).toNumber();
                    } catch (error) {
                        d.rateBalance = 0;
                    }
                }
                return d;
            });
        });
    }

    public getAssetSrc(asset: Asset, index) {
        const imageObj = this.assetState.assetFile.get(asset.asset_id);
        let lastModified = '';
        if (imageObj) {
            lastModified = imageObj['last-modified'];
            this.assetList[index].image_url = imageObj['image-src'];
        }
        if (asset.image_url) {
            this.assetState
                .getAssetImageFromUrl(asset.image_url, lastModified)
                .subscribe(assetRes => {
                    if (assetRes && assetRes.status === 200) {
                        this.assetState
                            .setAssetFile(assetRes, asset.asset_id)
                            .then(src => {
                                this.assetList[index].image_url = src;
                            });
                    } else if (assetRes && assetRes.status === 404) {
                        this.assetList[
                            index
                        ].image_url = this.assetState.defaultAssetSrc;
                    }
                    if(asset.asset_id === NEO || asset.asset_id === NEO3_CONTRACT) {
                        this.imageUrl =  this.assetList[
                            index
                        ].image_url;
                    }
                });
        } else {
            this.assetList[
                index
            ].image_url = this.assetState.defaultAssetSrc;
            if(asset.asset_id === NEO || asset.asset_id === NEO3_CONTRACT) {
                this.imageUrl =  this.assetList[
                    index
                ].image_url;
            }
        }
    }

    public onScrolltaChange(el: Element) {
        const tabGroup = el.children[el.children.length - 1];
        if (
            tabGroup.clientHeight - el.scrollTop < 343 &&
            !this.txPageComponent.loading && !this.txPageComponent.noMoreData
        ) {
            this.txPageComponent.getInTransactions(this.currentTxPage);
            this.currentTxPage++;
        }
    }

    public handlerBalance(balanceRes: Balance[]) {
        this.chrome.getWatch(this.neon.address, this.neon.currentWalletChainType).subscribe(watching => {
            this.findBalance(balanceRes, watching);
            // 获取交易
            // this.getInTransactions(1);
            // 获取资产汇率
            this.getAssetRate();
        });
    }

    public findBalance(balanceRes, watching) {
        let balance =
            balanceRes.find(b => b.asset_id === this.assetId) ||
            watching.find(w => w.asset_id === this.assetId);
        if (!balance) {
            this.assetId = this.neon.currentWalletChainType === 'Neo2' ? NEO : NEO3_CONTRACT;
            balance =
                balanceRes.find(b => b.asset_id === this.assetId) ||
                watching.find(w => w.asset_id === this.assetId);
        }
        balance.balance = Number(balance.balance);
        this.balance = balance;
    }

    public getAssetRate() {
        if (this.balance.balance && bignumber(this.balance.balance ).comparedTo(0) === 1) {
            this.assetState
                .getAssetRate(this.balance.symbol)
                .subscribe(rateBalance => {
                    if (this.balance.symbol.toLowerCase() in rateBalance) {
                        this.balance.rateBalance =
                            (rateBalance[this.balance.symbol.toLowerCase()] || 0) *
                            bignumber(this.balance.balance || 0 ).toNumber();
                    } else {
                        this.balance.rateBalance = 0;
                    }
                });
        } else {
            this.balance.rateBalance = 0;
        }
    }

    public claim() {
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
            this.neon.claimGAS(this.claimsData).subscribe(tx => {
                tx.forEach(item => {
                    try {
                        rpc.Query.sendRawTransaction(item.serialize(true)).execute(this.global.RPCDomain)
                    } catch (error) {
                        this.loading = false;
                    }
                })
                if (this.intervalClaim === null) {
                    this.initInterval();
                }
            });
        } else {
            const params = {
                addressFrom: this.neon.address,
                addressTo: this.neon.address,
                tokenScriptHash: NEO3_CONTRACT,
                amount: 0,
                networkFee: 0,
                decimals: 0,
            }
            const wif =
            this.neon.WIFArr[
                this.neon.walletArr.findIndex(
                    (item) => item.accounts[0].address === this.neon.address
                )
            ];
            this.neo3TransferService.createNeo3Tx(params).subscribe(tx => {
                tx.sign(
                    wif,
                    NEO3_MAGIC_NUMBER[this.net]
                );
                this.neo3TransferService.sendNeo3Tx(tx).then(res => {
                    this.loading = false;
                    this.claimStatus = this.status.success;
                    setTimeout(() => {
                        this.initClaim();
                    }, 20000);
                })
            });
        }
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

    private syncNow() {
        this.transfer.create(this.neon.address, this.neon.address, NEO, '1').subscribe(
            async res => {
                const wif = this.neon.WIFArr[this.neon.walletArr.findIndex(item =>
                    item.accounts[0].address === this.neon.wallet.accounts[0].address
                )]
                res.sign(wif);
                try {
                    const result = await rpc.Query.sendRawTransaction(res.serialize(true)).execute(this.global.RPCDomain)
                    if (result.error === undefined || result.error === null) {
                        if (this.intervalClaim === null) {
                            this.intervalClaim = setInterval(() => {
                                this.assetState.fetchClaim(this.neon.address)
                                    .subscribe((claimRes: any) => {
                                        if (Number(claimRes.available) !== 0) {
                                            this.loading = false;
                                            this.claimsData = claimRes.claimable;
                                            this.claimNumber = claimRes.available;
                                            clearInterval(this.intervalClaim);
                                            this.claimStatus = this.status.confirmed;
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
            err => {
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
        } else {
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
        this.assetState.getUnclaimedGas(this.neon.address).subscribe(res => {
            if (res.result.unclaimed && res.result.unclaimed !== '0') {
                this.claimNumber = new BigNumber(res.result.unclaimed).shiftedBy(-8).toNumber();
                this.claimStatus = this.status.confirmed;
                this.showClaim = true;
            } else {
                this.showClaim = false;
                clearInterval(this.intervalN3Claim);
            }
            this.init = true;
            this.loading = false;
        })
    }

    toWeb() {
        this.showMenu = false;
        switch (this.neon.currentWalletChainType) {
            case 'Neo2':
                window.open(
                    `https://${
                    this.net === 'TestNet' ? 'testnet.' : ''
                    }neotube.io/address/${this.neon.address}/page/1`
                );
                break;
            case 'Neo3':
                if (this.net === 'MainNet') {
                    window.open(`https://neo3.neotube.io/address/${this.neon.address}`);
                } else {
                    window.open(`https://neo3.testnet.neotube.io/address/${this.neon.address}`);
                }
                break;
        }
    }
    removeAccount() {
        this.showMenu = false;
        this.dialog
            .open(PopupConfirmDialogComponent, {
                data: 'delWalletConfirm',
                panelClass: 'custom-dialog-panel'
            })
            .afterClosed()
            .subscribe(confirm => {
                if (confirm) {
                    this.neon.delWallet(this.wallet).subscribe(res => {
                        if (this.neon.walletArr.length === 0) {
                            this.router.navigateByUrl('/popup/wallet/new-guide');
                        } else {
                            location.reload();
                        }
                    });
                }
            });
    }
    backupLater() {
        this.chrome.setHaveBackupTip(false);
        this.showBackup = false;
    }
}
