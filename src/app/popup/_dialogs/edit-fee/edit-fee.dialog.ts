import { Component, Inject } from '@angular/core';
import { MatDialogRef, MAT_DIALOG_DATA } from '@angular/material/dialog';
import { GasFeeSpeed } from '@popup/_lib/type';
import { AssetState } from '@app/core';
import { bignumber } from 'mathjs';

@Component({
    templateUrl: 'edit-fee.dialog.html',
    styleUrls: ['edit-fee.dialog.scss']
})
export class PopupEditFeeDialogComponent {
    showCustom = false;
    minFee = 0;
    fee = 0;
    gasFeeSpeed: GasFeeSpeed;
    level = 1;
    constructor(
        private dialogRef: MatDialogRef<PopupEditFeeDialogComponent>,
        private assetState: AssetState,
        @Inject(MAT_DIALOG_DATA)
        public data: {
            fee: number;
            speedFee?: any;
            minFee: number;
        }
    ) {
        this.minFee = this.data.minFee || 0;
        this.fee = this.data.fee;
        if (this.data.speedFee) {
            this.gasFeeSpeed = this.data.speedFee;
            this.updateGasFeeSpeed();
            this.updateLevel();
        } else {
            this.getGasFee();
        }
    }

    getGasFee() {
        if (this.assetState.gasFeeSpeed) {
            this.gasFeeSpeed = this.assetState.gasFeeSpeed;
            if(Number(this.gasFeeSpeed.slow_price) === 0) {
                this.updateGasFeeSpeed()
            }
            this.updateLevel();
        } else {
            this.assetState.getGasFee().subscribe((res: GasFeeSpeed) => {
                this.gasFeeSpeed = res;
                this.updateLevel();
                this.updateGasFeeSpeed()
            });
        }
    }

    updateGasFeeSpeed() {
        this.gasFeeSpeed.slow_price = bignumber(this.gasFeeSpeed.slow_price).add(bignumber(this.minFee)).toFixed();
        this.gasFeeSpeed.propose_price = bignumber(this.gasFeeSpeed.propose_price).add(bignumber(this.minFee)).toFixed();
        this.gasFeeSpeed.fast_price = bignumber(this.gasFeeSpeed.fast_price).add(bignumber(this.minFee)).toFixed();
    }

    updateLevel() {
        const slow = bignumber(this.gasFeeSpeed.slow_price).toFixed()
        const middle = bignumber(this.gasFeeSpeed.propose_price).toFixed()
        const fast = bignumber(this.gasFeeSpeed.fast_price).toFixed()
        const current = bignumber(this.fee).toFixed()
        if(current<= slow) {
            this.level = 0
        } else if(current > slow && current < fast ) {
            this.level = 1;
        } else {
            this.level = 2;
        }
    }

    updateFee() {
        switch (this.level) {
            case 0:
                this.fee = bignumber((this.gasFeeSpeed && this.gasFeeSpeed.slow_price) || this.fee).toNumber();
                break;
            case 1:
                this.fee = bignumber(this.gasFeeSpeed && this.gasFeeSpeed.propose_price || this.fee).toNumber();
                break;
            case 2:
                this.fee = bignumber(this.gasFeeSpeed && this.gasFeeSpeed.fast_price || this.fee).toNumber();
                break;
        }
    }

    ok() {
        this.dialogRef.close(this.fee);
    }
}
