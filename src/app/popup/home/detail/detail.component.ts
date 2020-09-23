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
import { Unsubscribable, forkJoin, from } from 'rxjs';

@Component({
    templateUrl: 'detail.component.html',
    styleUrls: ['detail.component.scss']
})
export class PopupHomeDetailComponent implements OnInit, OnDestroy {
    public balance: Balance;
    public address: string;
    public assetId: string;
    public txPage: PageData<Transaction>;
    public isLoading: boolean;
    public needLoadWhenSymbolSwitch: boolean;
    public inTransaction: Array<Transaction>;
    public rateCurrency: string;
    public net: string;

    public unSubTxStatus: Unsubscribable;
    public unSubBalance: Unsubscribable;

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
        this.net = this.global.net;
        this.aRouter.params.subscribe((params: any) => {
            this.assetId = params.id;
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
            this.asset.getAssetRate(this.balance.symbol).subscribe(rateBalance => {
                if (this.balance.symbol.toLowerCase() in rateBalance) {
                    this.balance.rateBalance = rateBalance[this.balance.symbol.toLowerCase()] * this.balance.balance;
                }
            });
        } else {
            this.balance.rateBalance = 0;
        }
    }

    public getInTransactions(page, maxId = -1, sinceId = -1, absPage = 1) {
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
                const httpReq2 = txIdArray.length !== 0 ? this.http.post(`${this.global.apiDomain}/v1/transactions/confirms`, {
                    txids: txIdArray
                }) : new Promise<any>((mResolve) => {
                    mResolve({result: []});
                });
                forkJoin(httpReq1, httpReq2).subscribe(result => {
                    const txPage = result[0];
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
                    this.isLoading = false;
                    this.filterBar.needLoad.emit(false);
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
                this.isLoading = false;
                this.filterBar.needLoad.emit(false);
            });
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
        this.getInTransactions(page, maxId, sinceId, absPage);
    }
}
