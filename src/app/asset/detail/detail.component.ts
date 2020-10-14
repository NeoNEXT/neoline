import {
    Component,
    OnInit,
    OnDestroy
} from '@angular/core';
import {
    AssetState,
    NeonService,
    GlobalService,
    TransactionState,
    ChromeService,
    HttpService,
} from '@app/core';
import {
    Balance,
    PageData,
    Transaction,
    NEO
} from 'src/models/models';
import {
    ActivatedRoute,
    Router
} from '@angular/router';
import {
    Unsubscribable,
    forkJoin
} from 'rxjs';
import { TransferService } from '@/app/transfer/transfer.service';
import { rpc } from '@cityofzion/neon-core';
import { bignumber } from 'mathjs';


@Component({
    templateUrl: 'detail.component.html',
    styleUrls: ['detail.component.scss']
})
export class AssetDetailComponent implements OnInit, OnDestroy {
    private status = {
        confirmed: 'confirmed',
        estimated: 'estimated',
        success: 'success'
    };
    public NEO = NEO;
    public claimNumber = 0;
    public claimStatus = 'confirmed';
    private claimsData = null;
    private intervalClaim = null;
    public showClaim = true;
    public init = false;

    private address: string = '';
    public balance: Balance;
    public txPage: PageData<Transaction>;
    public assetId: string = '';
    private requesting = false;
    public loading = true;
    public inTransaction: Array<Transaction>;
    public rateCurrency: string;
    public net: string;

    imageUrl: any;
    public unSubTxStatus: Unsubscribable;
    public unSubBalance: Unsubscribable;

    constructor(
        private asset: AssetState,
        private neon: NeonService,
        public global: GlobalService,
        private router: Router,
        private aRoute: ActivatedRoute,
        private txState: TransactionState,
        private chrome: ChromeService,
        private http: HttpService,
        private transferSer: TransferService
    ) { }

    ngOnInit(): void {
        this.address = this.neon.address;
        this.rateCurrency = this.asset.rateCurrency;
        this.net = this.global.net;
        this.aRoute.params.subscribe((params) => {
            this.assetId = params.id;
            this.initClaim();
            // 获取资产信息
            this.asset.fetchBalance(this.address).subscribe(balanceArr => {
                this.handlerBalance(balanceArr);
            });
        });
        this.unSubBalance = this.asset.balanceSub$.subscribe(balanceArr => {
            this.listenBalance(balanceArr);
        });
        this.unSubTxStatus = this.txState.txSub$.subscribe(() => {
            this.getInTransactions(1);
        });
    }

    ngOnDestroy(): void {
        this.txPage = {
            page: 1,
            pages: 0,
            items: [],
            total: 0,
            per_page: 10
        };
        if (this.unSubTxStatus) {
            this.unSubTxStatus.unsubscribe();
        }
        if (this.unSubBalance) {
            this.unSubBalance.unsubscribe();
        }
    }

    public handlerBalance(balanceRes: Balance[]) {
        this.chrome.getWatch().subscribe(watching => {
            this.findBalance(balanceRes, watching);
            // 获取交易
            this.getInTransactions(1);
            // 获取资产头像
            this.getAssetSrc();
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
        if (this.balance !== undefined && this.balance.balance && bignumber(this.balance.balance).comparedTo(0) === 1) {
            this.asset.getAssetRate(this.balance.symbol).subscribe(rateBalance => {
                if (this.balance.symbol.toLowerCase() in rateBalance) {
                    this.balance.rateBalance = bignumber(rateBalance[this.balance.symbol.toLowerCase()])
                        .mul(bignumber(this.balance.balance)).toNumber();
                }
            });
        } else {
            if (this.balance !== undefined) {
                this.balance.rateBalance = 0;
            }
        }
    }

    public getAssetSrc() {
        const imageObj = this.asset.assetFile.get(this.assetId);
        let lastModified = '';
        if (imageObj) {
            lastModified = imageObj['last-modified'];
            this.imageUrl = imageObj['image-src'];
        }
        this.asset.getAssetSrc(this.assetId, lastModified).subscribe(assetRes => {
            if (assetRes && assetRes['status'] === 200) {
                this.asset.setAssetFile(assetRes, this.assetId).then(src => {
                    this.imageUrl = src;
                });
            } else if (assetRes && assetRes['status'] === 404) {
                this.imageUrl = this.asset.defaultAssetSrc;
            }
        });
    }

    private getInTransactions(page, maxId = -1, sinceId = -1, absPage = 1) {
        const httpReq1 = this.txState.fetchTx(this.neon.address, page, this.assetId, maxId, sinceId, absPage);
        if (page === 1) {
            this.chrome.getTransaction().subscribe(inTxData => {
                if (inTxData[this.net] === undefined || inTxData[this.net][this.address] === undefined || inTxData[this.net][this.address][this.assetId] === undefined) {
                    this.inTransaction = [];
                } else {
                    this.inTransaction = inTxData[this.net][this.address][this.assetId];
                }
                const txIdArray = [];
                this.inTransaction = this.inTransaction.filter(item => (new Date().getTime()) / 1000 - item.block_time <= 120);
                this.inTransaction.forEach(item => {
                    txIdArray.push(item.txid);
                });
                const httpReq2 = this.http.post(`${this.global.apiDomain}/v1/transactions/confirms`, {
                    txids: txIdArray
                });
                forkJoin([httpReq1, httpReq2]).subscribe(result => {
                    let txPage = result[0];
                    let txConfirm = result[1];
                    txConfirm = txConfirm.result;
                    txConfirm.forEach(item => {
                        const tempIndex = this.inTransaction.findIndex(e => e.txid === item);
                        if (tempIndex >= 0) {
                            this.inTransaction.splice(tempIndex, 1);
                        }
                    });
                    if (inTxData[this.net] === undefined) {
                        inTxData[this.net] = {};
                    } else if (inTxData[this.net][this.address] === undefined) {
                        inTxData[this.net][this.address] = {};
                    } else if (inTxData[this.net][this.address][this.assetId] === undefined) {
                        inTxData[this.net][this.address][this.assetId] = [];
                    } else {
                        inTxData[this.net][this.address][this.assetId] = this.inTransaction;
                    }
                    this.chrome.setTransaction(inTxData);
                    txPage.items = this.inTransaction.concat(txPage.items);
                    this.txPage = txPage;
                    this.txPage.page = page;
                    // 重新获取地址余额，更新整个页面的余额
                    this.asset.fetchBalance(this.neon.address).subscribe(res => {
                        this.asset.pushBalance(res);
                    });
                });
            });
        } else {
            httpReq1.subscribe(res => {
                this.txPage = res;
                this.txPage.page = page;
            });
        }
    }

    public page(page: number) {
        let maxId = -1;
        let sinceId = -1;
        let absPage = Math.abs(this.txPage.page - page);
        if (page === 1) {
            absPage = 1;
        }
        if (page > this.txPage.page) {
            maxId = this.txPage.items[this.txPage.items.length - 1].id;
        } else {
            if (page !== 1) {
                sinceId = this.txPage.items[0].id;
            }
        }
        this.getInTransactions(page, maxId, sinceId, absPage);
    }


    public receive() {
        this.router.navigate([{
            outlets: {
                transfer: ['transfer', 'receive']
            }
        }]);
    }
    public transfer() {
        this.router.navigate([{
            outlets: {
                transfer: ['transfer', 'create', this.balance.asset_id]
            }
        }]);
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
    }

    private initInterval() {
        this.intervalClaim = setInterval(() => {
            this.asset.fetchClaim(this.neon.address).subscribe((claimRes: any) => {
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
        this.transferSer.create(this.neon.address, this.neon.address, NEO, '1').subscribe((res) => {
            res.sign(this.neon.WIFArr[this.neon.walletArr.findIndex(item =>
                item.accounts[0].address === this.neon.wallet.accounts[0].address)]);
            this.http.post(`${this.global.apiDomain}/v1/transactions/transfer`, {
                signature_transaction: res.serialize(true)
            }).subscribe(txRes => {
                if (this.intervalClaim === null) {
                    this.intervalClaim = setInterval(() => {
                        this.asset.fetchClaim(this.neon.address).subscribe((claimRes: any) => {
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
                }
            }, txErr => {
                this.loading = false;
            });
        }, (err) => {
            this.global.snackBarTip('wentWrong', err);
        });
    }

    private initClaim() {
        this.asset.fetchClaim(this.neon.address).subscribe((res: any) => {
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
}
