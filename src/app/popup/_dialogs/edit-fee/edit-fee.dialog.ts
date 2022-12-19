import { Component, Inject } from '@angular/core';
import { MatDialogRef, MAT_DIALOG_DATA } from '@angular/material/dialog';
import { GasFeeSpeed } from '@popup/_lib/type';
import { AssetState } from '@app/core';
import { bignumber } from 'mathjs';

@Component({
  templateUrl: 'edit-fee.dialog.html',
  styleUrls: ['edit-fee.dialog.scss'],
})
export class PopupEditFeeDialogComponent {
  showCustom = false;
  minFee = 0;
  fee: any = 0;
  gasFeeSpeed: GasFeeSpeed;
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
    this.fee = bignumber(this.data.fee).toFixed();
    if (this.data.speedFee) {
      this.gasFeeSpeed = this.data.speedFee;
      this.updateGasFeeSpeed();
    } else {
      this.getGasFee();
    }
  }

  getGasFee() {
    if (this.assetState.gasFeeSpeed) {
      this.gasFeeSpeed = this.assetState.gasFeeSpeed;
      this.updateGasFeeSpeed();
    } else {
      this.assetState.getGasFee().subscribe((res: GasFeeSpeed) => {
        this.gasFeeSpeed = res;
        this.updateGasFeeSpeed();
      });
    }
  }

  updateGasFeeSpeed() {
    this.gasFeeSpeed.slow_price = bignumber(this.gasFeeSpeed.slow_price)
      .add(bignumber(this.minFee))
      .toFixed();
    this.gasFeeSpeed.propose_price = bignumber(this.gasFeeSpeed.propose_price)
      .add(bignumber(this.minFee))
      .toFixed();
    this.gasFeeSpeed.fast_price = bignumber(this.gasFeeSpeed.fast_price)
      .add(bignumber(this.minFee))
      .toFixed();
  }

  updateFee(level: number) {
    switch (level) {
      case 0:
        this.fee = bignumber(
          (this.gasFeeSpeed && this.gasFeeSpeed.slow_price) || this.fee
        ).toFixed();
        break;
      case 1:
        this.fee = bignumber(
          (this.gasFeeSpeed && this.gasFeeSpeed.propose_price) || this.fee
        ).toFixed();
        break;
      case 2:
        this.fee = bignumber(
          (this.gasFeeSpeed && this.gasFeeSpeed.fast_price) || this.fee
        ).toFixed();
        break;
    }
  }

  ok() {
    this.dialogRef.close(this.fee);
  }
}
