import { Component, OnInit, Input, OnDestroy } from '@angular/core';
import {
    GlobalService,
    NeonService,
    NftState,
    ChromeService,
    HttpService,
    TransactionState,
} from '@/app/core';
import { NftTransaction } from '@/models/models';
import { MatDialog } from '@angular/material/dialog';
import { PopupNftTxDetailDialogComponent } from '@/app/popup/_dialogs';
import { forkJoin } from 'rxjs';
import { STORAGE_NAME, NetworkType } from '../../_lib';

@Component({
    selector: 'app-nft-tx-page',
    templateUrl: 'nft-tx-page.component.html',
    styleUrls: ['nft-tx-page.component.scss'],
})
export class PopupNftTxPageComponent implements OnInit, OnDestroy {
    @Input() nftContract: string;
    @Input() symbol = '';

    public show = false;
    public network: NetworkType;
    public address: string;
    public inTransaction: Array<NftTransaction>;
    public txData: Array<any> = [];
    public currentPage = 0;
    public loading = false;
    public noMoreData: boolean = false;
    constructor(
        private global: GlobalService,
        private neon: NeonService,
        private dialog: MatDialog,
        private nftState: NftState,
        private chrome: ChromeService,
        private http: HttpService,
        private txState: TransactionState
    ) {}
    ngOnInit(): void {
        this.network = this.global.n3Network.network;
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
        const httpReq1 = this.nftState.getNftTransactions(
            this.neon.address,
            this.nftContract
        );
        if (page === 1) {
            this.chrome
                .getStorage(STORAGE_NAME.transaction)
                .subscribe((inTxData) => {
                    if (
                        inTxData[this.network] === undefined ||
                        inTxData[this.network][this.address] === undefined ||
                        inTxData[this.network][this.address][
                            this.nftContract
                        ] === undefined
                    ) {
                        this.inTransaction = [];
                    } else {
                        this.inTransaction =
                            inTxData[this.network][this.address][
                                this.nftContract
                            ];
                    }
                    const txIdArray = [];
                    this.inTransaction = this.inTransaction.filter(
                        (item) =>
                            new Date().getTime() / 1000 - item.block_time <=
                            7200
                    );
                    this.inTransaction.forEach((item) => {
                        txIdArray.push(item.txid);
                    });
                    let httpReq2;
                    if (txIdArray.length === 0) {
                        httpReq2 = new Promise<any>((mResolve) => {
                            mResolve([]);
                        });
                    } else {
                        httpReq2 = this.txState.getTxsValid(txIdArray, 'Neo3').toPromise();
                    }
                    Promise.all([httpReq1, httpReq2]).then((result: any) => {
                        let txData = result[0] || [];
                        const txConfirm = result[1] || [];
                        txConfirm.forEach((item) => {
                            const tempIndex = this.inTransaction.findIndex(
                                (e) => e.txid === item
                            );
                            if (tempIndex >= 0) {
                                this.inTransaction.splice(tempIndex, 1);
                            }
                        });
                        if (inTxData[this.network] === undefined) {
                            inTxData[this.network] = {};
                        } else if (
                            inTxData[this.network][this.address] === undefined
                        ) {
                            inTxData[this.network][this.address] = {};
                        } else if (
                            inTxData[this.network][this.address][
                                this.nftContract
                            ] === undefined
                        ) {
                            inTxData[this.network][this.address][
                                this.nftContract
                            ] = [];
                        } else {
                            inTxData[this.network][this.address][
                                this.nftContract
                            ] = this.inTransaction;
                        }
                        this.chrome.setStorage(
                            STORAGE_NAME.transaction,
                            inTxData
                        );
                        this.inTransaction = this.handleLocalTxs(
                            this.inTransaction
                        );
                        if (this.nftContract !== '') {
                            if (txData.length === 0) {
                                this.noMoreData = true;
                            }
                            txData = this.inTransaction.concat(txData);
                            this.txData = txData;
                        } else {
                            if (txData.length === 0) {
                                this.noMoreData = true;
                            }
                            txData = this.inTransaction.concat(txData);
                            this.txData = txData;
                        }
                        this.loading = false;
                    });
                });
        } else {
            httpReq1.then((res) => {
                const resultData = res || [];
                this.txData = this.txData.concat(resultData);
                if (resultData.length === 0) {
                    this.noMoreData = true;
                }
                this.loading = false;
            });
        }
    }

    handleLocalTxs(txs: any[]): any[] {
        return txs.map(({ txid, block_time, value, tokenid }) => ({
            hash: txid,
            amount: value,
            block_time,
            tokenid,
        }));
    }

    showDetail(tx) {
        this.dialog.open(PopupNftTxDetailDialogComponent, {
            panelClass: 'custom-dialog-panel',
            data: {
                tx,
                address: this.address,
            },
        });
    }
}
