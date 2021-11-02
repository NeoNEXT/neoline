import { Component, Inject } from '@angular/core';
import { MAT_DIALOG_DATA } from '@angular/material/dialog';
import { TransactionState, NeonService } from '@/app/core';

@Component({
    templateUrl: 'tx-detail.dialog.html',
    styleUrls: ['tx-detail.dialog.scss'],
})
export class PopupTxDetailDialogComponent {
    txDetail: any;

    constructor(
        private txState: TransactionState,
        private neonService: NeonService,
        @Inject(MAT_DIALOG_DATA)
        public data: {
            tx: any;
            symbol: string;
            address: string;
            assetId: string;
        }
    ) {
        this.txState
            .getTxDetail(
                this.data.tx.txid,
                this.data.address,
                this.data.assetId
            )
            .subscribe((res) => {
                this.txDetail = res;
                switch (this.neonService.currentWalletChainType) {
                    case 'Neo2':
                        this.txDetail.vin = this.txDetail.vin.reduce(
                            (prev, element) => {
                                if (
                                    !prev.find(
                                        (item) => item === element.address
                                    )
                                ) {
                                    prev.push(element.address);
                                }
                                return prev;
                            },
                            []
                        );
                        this.txDetail.vout = this.txDetail.vout.reduce(
                            (prev, element) => {
                                if (
                                    !prev.find(
                                        (item) => item === element.address
                                    )
                                ) {
                                    prev.push(element.address);
                                }
                                return prev;
                            },
                            []
                        );
                        break;
                    case 'Neo3':
                        this.txDetail.vin = [];
                        this.txDetail.vout = [];
                        this.txDetail.transfer.forEach((txItem) => {
                            if (
                                !this.txDetail.vin.find(
                                    (item) => item === txItem.from
                                )
                            ) {
                                this.txDetail.vin.push(txItem.from);
                            }
                            if (
                                !this.txDetail.vout.find(
                                    (item) => item === txItem.from
                                )
                            ) {
                                this.txDetail.vout.push(txItem.to);
                            }
                        });
                        break;
                }
            });
    }
}
