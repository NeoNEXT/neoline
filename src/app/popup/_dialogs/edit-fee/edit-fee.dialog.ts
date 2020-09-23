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
        }
    ) {
        this.fee = this.data.fee;
        if (this.data.speedFee) {
            this.gasFeeSpeed = this.data.speedFee;
            this.updateLevel();
        } else {
            this.getGasFee();
        }
    }

    getGasFee() {
        if (this.assetState.gasFeeSpeed) {
            this.gasFeeSpeed = this.assetState.gasFeeSpeed;
            this.updateLevel();
        } else {
            this.assetState.getGasFee().subscribe((res: GasFeeSpeed) => {
                this.gasFeeSpeed = res;
                this.updateLevel();
            });
        }
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
                this.fee = bignumber(this.gasFeeSpeed && this.gasFeeSpeed.slow_price || this.fee).toNumber();
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
