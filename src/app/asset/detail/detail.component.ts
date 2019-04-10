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
        private txState: TransactionState,
        private chrome: ChromeService,
        private http: HttpService,
    ) {}

    ngOnInit(): void {
        this.address = this.neon.address;
        this.rateCurrency = this.asset.rateCurrency;
        this.aRoute.params.subscribe((params) => {
            // 获取资产信息
            this.getBalance(params.id);
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
    }

    public getBalance(id) {
        this.asset.detail(this.address, id).subscribe((res: Balance) => {
            if (!res) {
                this.getBalance(NEO);
                return;
            }
            this.assetId = id;
            // 获取交易
            this.getInTransactions(1);
            res.balance = Number(res.balance);
            this.balance = res;
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
                    this.imageUrl = this.asset.defaultAssetSrc;
                }
            });
            // 获取资产汇率
            if (this.balance !== undefined && this.balance.balance && this.balance.balance > 0) {
                this.asset.getAssetRate(this.balance.symbol).subscribe(rateBalance => {
                    if (this.balance.symbol.toLowerCase() in rateBalance) {
                        this.balance.rateBalance = rateBalance[this.balance.symbol.toLowerCase()] * this.balance.balance;
                    }
                });
            } else {
                if (this.balance !== undefined) {
                    this.balance.rateBalance = 0;
                }
            }
        });
    }

    private getInTransactions(page, maxId = -1, sinceId = -1, absPage = 1) {
        this.txState.fetchTx(this.neon.address, page, this.assetId, maxId, sinceId, absPage).subscribe((res: any) => {
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
                        // this.txPage = res;
                        this.txPage.items = this.inTransaction.concat(this.txPage.items);
                        // this.txPage.page = 1;
                    }, error => {});
                });
            }
            this.txPage = res;
            this.txPage.page = page;
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
}
