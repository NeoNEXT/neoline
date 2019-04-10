import {
    Component,
    OnInit,
    OnDestroy,
    OnChanges
} from '@angular/core';
import {
    ActivatedRoute
} from '@angular/router';

import {
    AssetState,
    NeonService,
    GlobalService,
    TransactionState,
    ChromeService,
    HttpService
} from '@app/core';

import {
    Balance,
    PageData,
    Transaction,
    NEO,
} from '@models/models';

import {
    FilterBarService
} from '@popup/_services/filter-bar.service';

@Component({
    templateUrl: 'detail.component.html',
    styleUrls: ['detail.component.scss']
})
export class PopupHomeDetailComponent implements OnInit, OnDestroy {
    public balance: Balance;
    public address: string;
    public assetId: string;
    public txPage: PageData < Transaction > ;
    public isLoading: boolean;
    public needLoadWhenSymbolSwitch: boolean;
    public inTransaction: Array < Transaction > ;
    public rateCurrency: string;

    constructor(
        private asset: AssetState,
        private neon: NeonService,
        private global: GlobalService,
        private aRouter: ActivatedRoute,
        private txState: TransactionState,
        private filterBar: FilterBarService,
        private chrome: ChromeService,
        private http: HttpService,
    ) {
        this.assetId = '';
        this.isLoading = true;
        this.address = this.neon.address;
        this.needLoadWhenSymbolSwitch = false;
        this.filterBar.needLoad.subscribe((value: boolean) => {
            this.needLoadWhenSymbolSwitch = value;
        });
        this.rateCurrency = this.asset.rateCurrency;
    }

    ngOnInit(): void {
        this.aRouter.params.subscribe((params: any) => {
            this.assetId = params.id;
            this.getBalance();
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

    public getBalance() {
        this.asset.detail(this.address, this.assetId).subscribe((res: Balance) => {
            if (!res) {
                this.assetId = NEO;
                this.getBalance();
                return;
            }
            res.balance = Number(res.balance);
            this.balance = res;
            // 获取资产汇率
            if (this.balance.balance && this.balance.balance > 0) {
                this.asset.getAssetRate(this.balance.symbol).subscribe(rateBalance => {
                    if (this.balance.symbol.toLowerCase() in rateBalance) {
                        this.balance.rateBalance = rateBalance[this.balance.symbol.toLowerCase()] * this.balance.balance;
                    }
                });
            } else {
                this.balance.rateBalance = 0;
            }
            this.getInTransactions(1);
        });
    }

    public getInTransactions(page, maxId = -1, sinceId = -1, absPage = 1) {
        this.txState.fetchTx(this.address, 1, this.assetId, maxId, sinceId, absPage).subscribe((res: any) => {
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
                    }, error => {});
                });
            }
            this.txPage = res;
            this.txPage.page = page;
            this.isLoading = false;
            this.filterBar.needLoad.emit(false);
        });
    }

    public page(page: number) {
        this.isLoading = true;
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
}
