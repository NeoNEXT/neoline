import { Component, OnChanges, SimpleChanges, OnInit, OnDestroy, ViewChild } from '@angular/core';
import { AssetState, NeonService, HttpService, GlobalService, ChromeService } from '@/app/core';
import { NEO, Balance } from '@/models/models';
import { TransferService } from '@/app/transfer/transfer.service';
import { Wallet } from '@cityofzion/neon-core/lib/wallet';
import { PopupHomeTxPageComponent } from './tx-page/tx-page.component';

@Component({
    templateUrl: 'home.component.html',
    styleUrls: ['home.component.scss']
})
export class PopupHomeComponent implements OnInit {
    @ViewChild('txPage')
    txPageComponent: PopupHomeTxPageComponent;
    public imageUrl: any = '';
    selectedIndex = 0;
    public assetId: string = NEO;
    public wallet: Wallet;
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
    public showClaim = false;
    public init = false;

    public currentTxPage = 2;
    constructor(
        private assetState: AssetState,
        private neon: NeonService,
        private http: HttpService,
        private global: GlobalService,
        private transfer: TransferService,
        private chrome: ChromeService,
    ) {
        this.wallet = this.neon.wallet;
        this.rateCurrency = this.assetState.rateCurrency;

        const imageObj = this.assetState.assetFile.get(this.assetId);
        let lastModified = '';
        if (imageObj) {
            lastModified = imageObj['last-modified'];
            this.imageUrl = imageObj['image-src'];
        }
        this.assetState.getAssetSrc(NEO, lastModified).subscribe((assetRes: any) => {
            if (assetRes && assetRes.status === 200) {
                this.assetState.setAssetFile(assetRes, NEO).then(src => {
                    this.imageUrl = src;
                });
            } else if (assetRes && assetRes.status === 404) {
                this.imageUrl = this.assetState.defaultAssetSrc;
            }
        });
    }

    ngOnInit(): void {
        this.net = this.global.net;
        this.assetState.fetchBalance(this.wallet.accounts[0].address).subscribe(balanceArr => {
            this.handlerBalance(balanceArr);
        });
    }

    public onScrolltaChange(el: Element) {
        const tabGroup = el.children[el.children.length - 1];
        console.log(this.txPageComponent.loading);
        if(tabGroup.clientHeight - el.scrollTop < 343 && !this.txPageComponent.loading) {
            console.log('load')
            this.txPageComponent.getInTransactions(this.currentTxPage)
            this.currentTxPage ++;
        }
    }

    public handlerBalance(balanceRes: Balance[]) {
        this.chrome.getWatch().subscribe(watching => {
            this.findBalance(balanceRes, watching);
            // 获取交易
            // this.getInTransactions(1);
            // 获取资产汇率
            this.getAssetRate();
        });
    }

    // 监听 balance 发生变化
    public listenBalance(balanceRes: Balance[]) {
        this.chrome.getWatch().subscribe(watching => {
            this.findBalance(balanceRes, watching);
            // 获取资产汇率
            this.getAssetRate();
        });
    }

    public findBalance(balanceRes, watching) {
        let balance = balanceRes.find(b => b.asset_id === this.assetId) || watching.find(w => w.asset_id === this.assetId);
        if (!balance) {
            this.assetId = NEO;
            balance = balanceRes.find(b => b.asset_id === this.assetId) || watching.find(w => w.asset_id === this.assetId);
        }
        balance.balance = Number(balance.balance);
        this.balance = balance;
    }

    public getAssetRate() {
        if (this.balance.balance && this.balance.balance > 0) {
            this.assetState.getAssetRate(this.balance.symbol).subscribe(rateBalance => {
                if (this.balance.symbol.toLowerCase() in rateBalance) {
                    this.balance.rateBalance = rateBalance[this.balance.symbol.toLowerCase()] * this.balance.balance;
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
        this.neon.claimGAS(this.claimsData, this.claimNumber).subscribe(tx => {
            return this.http.post(`${this.global.apiDomain}/v1/transactions/transfer`, {
                signature_transaction: tx.serialize(true)
            }).subscribe(res => {
                if (this.intervalClaim === null) {
                    this.initInterval();
                }
            }, err => {
                this.loading = false;
                if (this.intervalClaim === null) {
                    this.initInterval();
                }
            });
        });
    }

    private initInterval() {
        this.intervalClaim = setInterval(() => {
            this.assetState.fetchClaim(this.neon.address).subscribe((claimRes: any) => {
                if (Number(claimRes.unspent_claim) === 0) {
                    this.loading = false;
                    this.claimNumber = claimRes.uncollect_claim;
                    clearInterval(this.intervalClaim);
                    this.intervalClaim = null;
                    this.claimStatus = this.status.success;
                }
            });
        }, 10000);
    }

    private syncNow() {
        this.transfer.create(this.neon.address, this.neon.address, NEO, 1).subscribe((res) => {
            res.sign(this.neon.WIFArr[this.neon.walletArr.findIndex(item =>
                item.accounts[0].address === this.neon.wallet.accounts[0].address)]);
            this.http.post(`${this.global.apiDomain}/v1/transactions/transfer`, {
                signature_transaction: res.serialize(true)
            }).subscribe(txRes => {
                if (this.intervalClaim === null) {
                    this.intervalClaim = setInterval(() => {
                        this.assetState.fetchClaim(this.neon.address).subscribe((claimRes: any) => {
                            if (Number(claimRes.unspent_claim) !== 0) {
                                this.loading = false;
                                this.claimsData = claimRes.claims;
                                this.claimNumber = claimRes.unspent_claim;
                                clearInterval(this.intervalClaim);
                                this.claimStatus = this.status.confirmed;
                                this.intervalClaim = null;
                            }
                        });
                    }, 10000);
                }
            }, txErr => {
                this.loading = false;
            });
        }, (err) => {
            this.global.snackBarTip('wentWrong', err);
        });
    }

    private initClaim() {
        this.assetState.fetchClaim(this.neon.address).subscribe((res: any) => {
            this.claimsData = res.claims;
            if (res.unspent_claim > 0) {
                this.claimNumber = res.unspent_claim;
                this.showClaim = true;
            } else if (res.uncollect_claim > 0) {
                this.claimNumber = res.uncollect_claim;
                this.claimStatus = this.status.estimated;
                this.showClaim = true;
            } else {
                this.showClaim = false;
            }
            this.init = true;
            this.loading = false;
        });
    }
}
