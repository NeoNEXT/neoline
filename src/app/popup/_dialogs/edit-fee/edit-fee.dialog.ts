import { Component, Inject } from '@angular/core';
import { MatDialogRef, MAT_DIALOG_DATA } from '@angular/material/dialog';
import { GasFeeSpeed } from '@popup/_lib/type';
import { AssetState } from '@app/core';

@Component({
    templateUrl: 'edit-fee.dialog.html',
    styleUrls: ['edit-fee.dialog.scss']
})
export class PopupEditFeeDialogComponent {
    showCustom = false;
    fee = 0;
    step: number;
    speedFee: GasFeeSpeed;
    constructor(
        private dialogRef: MatDialogRef<PopupEditFeeDialogComponent>,
        private assetState: AssetState,
        @Inject(MAT_DIALOG_DATA)
        public data: {
            fee: number;
            speedFee?: any;
        }
    ) {
        if (this.data.speedFee) {
            this.speedFee = this.data.speedFee;
            this.step = (Number(this.speedFee.fast_price) - Number(this.speedFee.slow_price)) / 2;
        } else {
            this.getGasFee();
        }
        this.fee = this.data.fee;
    }

    getGasFee() {
        this.assetState.getGasFee().subscribe(res => {
            if (res.status === 'success') {
                this.speedFee = res.data;
                this.step = (Number(this.speedFee.fast_price) - Number(this.speedFee.slow_price)) / 2;
            }
        });
    }

    ok() {
        this.dialogRef.close(this.fee);
    }
}
