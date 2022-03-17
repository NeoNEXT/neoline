import {
    Component,
    OnInit,
    Input,
    OnDestroy,
    ɵclearResolutionOfComponentResourcesQueue,
} from '@angular/core';
import {
    GlobalService,
    TransactionState,
    NeonService,
    ChromeService,
    HttpService,
    AssetState,
} from '@/app/core';
import { Transaction } from '@/models/models';
import { forkJoin } from 'rxjs';
import { MatDialog } from '@angular/material/dialog';
import { PopupTxDetailDialogComponent } from '@/app/popup/_dialogs';
import { STORAGE_NAME, NetworkType } from '@/app/popup/_lib';

@Component({
    selector: 'app-tx-page',
    templateUrl: 'tx-page.component.html',
    styleUrls: ['tx-page.component.scss'],
})
export class PopupTxPageComponent implements OnInit, OnDestroy {
    @Input() assetId = '';
    @Input() symbol = '';
    @Input() rateCurrency: string;

    public show = false;
    public network: NetworkType;
    public address: string;
    public inTransaction: Array<Transaction>;
    public txData: Array<any> = [];
    public loading = false;
    constructor(
        private asset: AssetState,
        private global: GlobalService,
        private chrome: ChromeService,
        private neon: NeonService,
        private txState: TransactionState,
        private http: HttpService,
        private dialog: MatDialog
    ) {}
    ngOnInit(): void {
        this.network =
            this.neon.currentWalletChainType === 'Neo2'
                ? this.global.n2Network.network
                : this.global.n3Network.network;
        this.address = this.neon.address;
        this.txData = [];
        this.getInTransactions();
    }

    ngOnDestroy(): void {
        this.txData = [];
    }

    public getInTransactions() {
        this.loading = true;
        const httpReq1 =
            this.assetId !== ''
                ? this.txState.getAssetTxs(this.neon.address, this.assetId)
                : this.txState.getAllTxs(this.neon.address);
        if (this.assetId === '') {
            httpReq1.then((res) => {
                this.txData = res || [];
                this.loading = false;
            });
        } else {
            this.chrome
                .getStorage(STORAGE_NAME.transaction)
                .subscribe((inTxData) => {
                    if (
                        inTxData[this.network] === undefined ||
                        inTxData[this.network][this.address] === undefined ||
                        inTxData[this.network][this.address][this.assetId] ===
                            undefined
                    ) {
                        this.inTransaction = [];
                    } else {
                        this.inTransaction =
                            inTxData[this.network][this.address][this.assetId];
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
                        httpReq2 = this.txState.getTxsValid(
                            txIdArray,
                            this.neon.currentWalletChainType
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
                        if (inTxData[this.network] === undefined) {
                            inTxData[this.network] = {};
                        } else if (
                            inTxData[this.network][this.address] === undefined
                        ) {
                            inTxData[this.network][this.address] = {};
                        } else if (
                            inTxData[this.network][this.address][
                                this.assetId
                            ] === undefined
                        ) {
                            inTxData[this.network][this.address][this.assetId] =
                                [];
                        } else {
                            inTxData[this.network][this.address][this.assetId] =
                                this.inTransaction;
                        }
                        this.chrome.setStorage(
                            STORAGE_NAME.transaction,
                            inTxData
                        );
                        txData = this.inTransaction.concat(txData);
                        this.txData = txData;
                        this.loading = false;
                    });
                });
        }
    }

    showDetail(tx, symbol) {
        this.dialog.open(PopupTxDetailDialogComponent, {
            panelClass: 'custom-dialog-panel',
            data: {
                tx,
                symbol,
                address: this.address,
                assetId: tx.asset_id,
            },
        });
    }
}
