import { Component, Inject } from '@angular/core';
import { MAT_DIALOG_DATA } from '@angular/material/dialog';
import { TransactionState } from '@/app/core';

@Component({
    templateUrl: 'tx-detail.dialog.html',
    styleUrls: ['tx-detail.dialog.scss']
})
export class PopupTxDetailDialogComponent {
    txDetail: any;

    constructor(
        private txState: TransactionState,
        @Inject(MAT_DIALOG_DATA) public data: { tx: any; symbol: string }
    ) {
        this.txState.getTxDetail(this.data.tx.txid).subscribe(res => {
            this.txDetail = res;
            this.txDetail.vin = this.txDetail.vin.reduce((prev, element) => {
                if (!prev.find(item => item.address === element.address)) {
                    prev.push(element)
                }
                return prev
            }, [])
            this.txDetail.vout = this.txDetail.vout.reduce((prev, element) => {
                if (!prev.find(item => item.address === element.address)) {
                    prev.push(element)
                }
                return prev
            }, [])
        });
    }
}
