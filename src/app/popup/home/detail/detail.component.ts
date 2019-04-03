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
import {
    switchMap
} from 'rxjs/operators';
import {
    Unsubscribable
} from 'rxjs';

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

    private unSubTxStatus: Unsubscribable;
    private unSubRate: Unsubscribable;
    public unSubTxFetch: Unsubscribable;
    public unSubAsset: Unsubscribable;

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
    }

    ngOnInit(): void {
        this.asset.fetchBalance(this.neon.address);
        this.chrome.getRateCurrency().subscribe(rateCurrency => {
            this.rateCurrency = rateCurrency;
            this.aRouter.params.subscribe((params: any) => {
                if (this.unSubRate) {
                    this.unSubRate.unsubscribe();
                }
                this.unSubAsset = this.asset.detail(params.id).subscribe((res: Balance) => {
                    res.balance = Number(res.balance);
                    this.balance = res;
                    this.assetId = params.id;
                    // 获取资产汇率
                    if (this.balance.balance && this.balance.balance > 0) {
                        let query = {};
                        query['symbol'] = this.rateCurrency;
                        query['coins'] = this.balance.symbol;
                        this.unSubRate = this.asset.getRate(query).subscribe(rateBalance => {
                            if (rateBalance !== undefined && JSON.stringify(rateBalance.result) !== '{}') {
                                this.balance.rateBalance =
                                    Number(rateBalance.result[this.balance.symbol]) * this.balance.balance;
                            }
                        });
                    } else {
                        this.balance.rateBalance = 0;
                    }
                });
                if (this.unSubTxFetch) {
                    this.unSubTxFetch.unsubscribe();
                }
                this.unSubTxFetch = this.txState.fetch(this.address, 1, params.id).subscribe();
            });
        });
        this.unSubTxStatus = this.txState.data().subscribe((res: any) => {
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
            this.isLoading = false;
            this.filterBar.needLoad.emit(false);
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
        if (this.unSubTxFetch) {
            this.unSubTxFetch.unsubscribe();
        }
        if (this.unSubAsset) {
            this.unSubAsset.unsubscribe()
        }
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
        this.txState.fetch(this.address, page, this.assetId, maxId, sinceId, absPage).subscribe(() => {
            this.txPage.page = page;
            this.isLoading = false;
            this.filterBar.needLoad.emit(false);
        });
    }
}
