import { Component, OnInit, Input, OnDestroy } from '@angular/core';
import {
    GlobalService,
    NeonService,
    NftState,
    ChromeService,
    HttpService,
} from '@/app/core';
import { Transaction } from '@/models/models';
import { MatDialog } from '@angular/material/dialog';
import { PopupNftTxDetailDialogComponent } from '@/app/popup/_dialogs';
import { forkJoin } from 'rxjs';

@Component({
    selector: 'app-nft-tx-page',
    templateUrl: 'nft-tx-page.component.html',
    styleUrls: ['nft-tx-page.component.scss'],
})
export class PopupNftTxPageComponent implements OnInit, OnDestroy {
    @Input() nftContract: string;
    @Input() symbol = '';

    public show = false;
    public net: string;
    public address: string;
    public inTransaction: Array<Transaction>;
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
        private http: HttpService
    ) {}
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
        maxId = page > 1 ? this.txData[this.txData.length - 1].id - 1 : -1;
        const httpReq1 = this.nftState.getNftTransactions(
            this.neon.address,
            this.nftContract,
            maxId
        );
        if (page === 1) {
            this.chrome.getTransaction().subscribe((inTxData) => {
                if (
                    inTxData[this.net] === undefined ||
                    inTxData[this.net][this.address] === undefined ||
                    inTxData[this.net][this.address][this.nftContract] ===
                        undefined
                ) {
                    this.inTransaction = [];
                } else {
                    this.inTransaction =
                        inTxData[this.net][this.address][this.nftContract];
                }
                const txIdArray = [];
                this.inTransaction = this.inTransaction.filter(
                    (item) =>
                        new Date().getTime() / 1000 - item.block_time <= 120
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
                    httpReq2 = this.http.post(
                        `${this.global.apiDomain}/v1/neo3/hash_valid`,
                        {
                            hashes: txIdArray,
                        }
                    );
                }
                forkJoin([httpReq1, httpReq2]).subscribe((result: any) => {
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
                    if (inTxData[this.net] === undefined) {
                        inTxData[this.net] = {};
                    } else if (inTxData[this.net][this.address] === undefined) {
                        inTxData[this.net][this.address] = {};
                    } else if (
                        inTxData[this.net][this.address][this.nftContract] ===
                        undefined
                    ) {
                        inTxData[this.net][this.address][this.nftContract] = [];
                    } else {
                        inTxData[this.net][this.address][this.nftContract] =
                            this.inTransaction;
                    }
                    this.chrome.setTransaction(inTxData);
                    this.inTransaction = this.handleLocalTxs(this.inTransaction);
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
                    // 重新获取地址余额，更新整个页面的余额
                    // this.nftState
                    //     .getNftTokens(this.neon.address, this.nftContract)
                    //     .subscribe((res) => {
                    //         this.asset.pushBalance(res);
                    //     });
                    this.loading = false;
                });
            });
        } else {
            httpReq1.subscribe((res) => {
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
        return txs.map(({ txid, block_time, value, token_id }) => ({
            hash: txid,
            amount: value,
            block_time,
            token_id,
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
