import {
    Component,
    OnInit,
    Input,
    OnDestroy,
    ɵclearResolutionOfComponentResourcesQueue
} from '@angular/core';
import {
    GlobalService,
    TransactionState,
    NeonService,
    ChromeService,
    HttpService,
    AssetState
} from '@/app/core';
import { Transaction, PageData } from '@/models/models';
import { forkJoin } from 'rxjs';
import { MatDialog } from '@angular/material/dialog';
import { PopupTxDetailDialogComponent } from '@/app/popup/_dialogs';

@Component({
    selector: 'app-tx-page',
    templateUrl: 'tx-page.component.html',
    styleUrls: ['tx-page.component.scss']
})
export class PopupTxPageComponent implements OnInit, OnDestroy {
    @Input() assetId = '';
    @Input() symbol = '';
    @Input() rateCurrency: string;

    public show = false;
    public net: string;
    public address: string;
    public inTransaction: Array<Transaction>;
    public txData: Array<any> = [];
    public currentPage = 0;
    public loading = false;
    public noMoreData: boolean = false;
    constructor(
        private asset: AssetState,
        private global: GlobalService,
        private chrome: ChromeService,
        private neon: NeonService,
        private txState: TransactionState,
        private http: HttpService,
        private dialog: MatDialog
    ) { }
    ngOnInit(): void {
        this.net = this.global.net;
        this.address = this.neon.address;
        this.txData = [];
        this.getInTransactions(1);
    }

    ngOnDestroy(): void {
        this.txData = [];
    }

    public getInTransactions(page: number) {
        if (this.currentPage === page) {
            return;
        } else {
            this.currentPage = page;
        }
        this.loading = true;
        let maxId = -1;
        maxId = page > 1 ? this.txData[this.txData.length - 1].id : -1;
        const httpReq1 = this.assetId !== '' ? this.txState.fetchTx(
            this.neon.address,
            page,
            this.assetId,
            maxId
        ) : this.txState.getAllTx(this.neon.address, maxId);
        if (page === 1) {
            this.chrome.getTransaction().subscribe(inTxData => {
                if (
                    inTxData[this.net] === undefined ||
                    inTxData[this.net][this.address] === undefined ||
                    inTxData[this.net][this.address][this.assetId] === undefined
                ) {
                    this.inTransaction = [];
                } else {
                    this.inTransaction =
                        inTxData[this.net][this.address][this.assetId];
                }
                const txIdArray = [];
                this.inTransaction = this.inTransaction.filter(
                    item => new Date().getTime() / 1000 - item.block_time <= 120
                );
                this.inTransaction.forEach(item => {
                    txIdArray.push(item.txid);
                });
                const httpReq2 = txIdArray.length !== 0 ?
                    this.http.post(`${this.global.apiGoDomain}/v1/neo2/txids_valid`, {
                        txids: txIdArray
                    }) : new Promise<any>((mResolve) => {
                        mResolve({result: []});
                    });
                forkJoin([httpReq1, httpReq2]).subscribe(result => {
                    let txData = result[0];
                    let txConfirm = result[1];
                    txConfirm = txConfirm.result;
                    txConfirm.forEach(item => {
                        const tempIndex = this.inTransaction.findIndex(
                            e => e.txid === item
                        );
                        if (tempIndex >= 0) {
                            this.inTransaction.splice(tempIndex, 1);
                        }
                    });
                    if (inTxData[this.net] === undefined) {
                        inTxData[this.net] = {};
                    } else if (inTxData[this.net][this.address] === undefined) {
                        inTxData[this.net][this.address] = {};
                    } else if (
                        inTxData[this.net][this.address][this.assetId] ===
                        undefined
                    ) {
                        inTxData[this.net][this.address][this.assetId] = [];
                    } else {
                        inTxData[this.net][this.address][
                            this.assetId
                        ] = this.inTransaction;
                    }
                    this.chrome.setTransaction(inTxData);
                    if (this.assetId !== '') {
                        if (txData.length === 0) {
                            this.noMoreData = true
                        }
                        txData = this.inTransaction.concat(txData);
                        this.txData = txData;
                    } else {
                        if (txData.length === 0) {
                            this.noMoreData = true
                        }
                        txData = this.inTransaction.concat(txData);
                        this.txData = txData;
                    }
                    // 重新获取地址余额，更新整个页面的余额
                    this.asset
                        .fetchBalance(this.neon.address)
                        .subscribe(res => {
                            this.asset.pushBalance(res);
                        });
                    this.loading = false;
                });
            });
        } else {
            httpReq1.subscribe(res => {
                if (this.assetId === '') {
                    this.txData = this.txData.concat(res);
                    if (res.length === 0) {
                        this.noMoreData = true
                    }
                } else {
                    this.txData = this.txData.concat(res.items);
                    if (res.items.length === 0) {
                        this.noMoreData = true
                    }
                }
                this.loading = false;
            });
        }
    }

    showDetail(tx, symbol) {
        this.dialog.open(PopupTxDetailDialogComponent, {
            panelClass: 'custom-dialog-panel',
            data: {
                tx,
                symbol
            }
        });
    }
}
