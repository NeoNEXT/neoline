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
    step = 0.01;
    gasFeeSpeed: GasFeeSpeed;
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
            this.gasFeeSpeed = this.data.speedFee;
            this.step = (Number(this.gasFeeSpeed.fast_price) - Number(this.gasFeeSpeed.slow_price)) / 2;
        } else {
            this.getGasFee();
        }
        this.fee = this.data.fee;
    }

    getGasFee() {
        if (this.assetState.gasFeeSpeed) {
            this.gasFeeSpeed = this.assetState.gasFeeSpeed;
            this.step = (Number(this.gasFeeSpeed.fast_price) - Number(this.gasFeeSpeed.slow_price)) / 2;
        } else {
            this.assetState.getGasFee().subscribe((res: GasFeeSpeed) => {
                this.gasFeeSpeed = res;
                this.step = (Number(this.gasFeeSpeed.fast_price) - Number(this.gasFeeSpeed.slow_price)) / 2;
            });
        }
    }

    ok() {
        this.dialogRef.close(this.fee);
    }
}
