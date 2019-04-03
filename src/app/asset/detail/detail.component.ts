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
} from 'src/models/models';
import {
    ActivatedRoute,
    Router
} from '@angular/router';

@Component({
    templateUrl: 'detail.component.html',
    styleUrls: ['detail.component.scss']
})
export class AssetDetailComponent implements OnInit, OnDestroy {
    private address: string = '';
    public balance: Balance;
    public txPage: PageData < Transaction > ;
    private assetId: string = '';
    private requesting = false;
    public loading = true;
    public inTransaction: Array < Transaction > ;
    public rateCurrency: string;

    imageUrl: any;

    constructor(
        private asset: AssetState,
        private neon: NeonService,
        public global: GlobalService,
        private router: Router,
        private aRoute: ActivatedRoute,
        private transaction: TransactionState,
        private txState: TransactionState,
        private chrome: ChromeService,
        private http: HttpService,
    ) { }

    ngOnInit(): void {
        this.address = this.neon.address;
        this.transaction.data().subscribe((res) => {
            this.txPage = res;
        });
        this.chrome.getRateCurrency().subscribe(rateCurrency => {
            this.rateCurrency = rateCurrency;
            this.initPage();
        });
        this.getInTransactions();
    }

    ngOnDestroy(): void {
        this.txPage = {
            page: 1,
            pages: 0,
            items: [],
            total: 0,
            per_page: 10
        };
    }

    public initPage() {
        this.aRoute.params.subscribe((params) => {
            this.txPage = undefined;
            this.asset.detail(params.id).subscribe((res: Balance) => {
                res.balance = Number(res.balance);
                this.balance = res;
                this.assetId = params.id;
                this.transaction.fetch(this.address, 1, params.id, true);
                // 获取资产头像
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
                        this.imageUrl = '';
                    }
                });
                // 获取资产汇率
                if (this.balance !== undefined && this.balance.balance && this.balance.balance > 0) {
                    let query = {};
                    query['symbol'] = this.rateCurrency;
                    query['coins'] = this.balance.symbol;
                    this.asset.getRate(query).subscribe(rateBalance => {
                        if (rateBalance !== undefined && JSON.stringify(rateBalance.result) !== '{}') {
                            this.balance.rateBalance =
                                Number(rateBalance.result[this.balance.symbol]) * this.balance.balance;
                        }
                    });
                } else {
                    if (this.balance !== undefined) {
                        this.balance.rateBalance = 0;
                    }
                }
            });
        });
    }

    private getInTransactions() {
        this.txState.data().subscribe((res: any) => {
            if (this.txPage === undefined || res.page === 1) {
                this.chrome.getTransaction().subscribe(inTxData => {
                    if (inTxData[this.address] === undefined || inTxData[this.address][this.assetId] === undefined) {
                        this.inTransaction = [];
                    } else {
                        this.inTransaction = inTxData[this.address][this.assetId];
                    }
                    const txIdArray = [];
                    this.inTransaction.forEach(item => {
                        txIdArray.push(item.txid);
                    });
                    this.http.post(`${this.global.apiDomain}/v1/transactions/confirms`, {
                        txids: txIdArray
                    }).subscribe(txConfirm => {
                        txConfirm = txConfirm.result;
                        txConfirm.forEach(item => {
                            const tempIndex = this.inTransaction.findIndex(e => e.txid === item);
                            if (tempIndex >= 0) {
                                this.inTransaction.splice(tempIndex, 1);
                            }
                        });
                        if (inTxData[this.address] === undefined || inTxData[this.address][this.assetId] === undefined) {
                            inTxData[this.address] = {};
                            inTxData[this.address][this.assetId] = [];
                        } else {
                            inTxData[this.address][this.assetId] = this.inTransaction;
                        }
                        this.chrome.setTransaction(inTxData);
                        this.txPage = res;
                        this.txPage.items = this.inTransaction.concat(this.txPage.items);
                    }, error => {});
                });
            } else {
                this.txPage = res;
                this.txPage.page = 1;
            }
        });
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
        this.txState.fetch(this.address, page, this.assetId, true, maxId, sinceId, absPage).finally(() => {
            this.txPage.page = page;
        });
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
}
