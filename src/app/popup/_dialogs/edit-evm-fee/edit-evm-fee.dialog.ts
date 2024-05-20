import { Component, Inject } from '@angular/core';
import { MatDialogRef, MAT_DIALOG_DATA } from '@angular/material/dialog';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { NeoXFeeInfoProp } from '../../transfer/create/interface';
import BigNumber from 'bignumber.js';
import { debounceTime, distinctUntilChanged } from 'rxjs/operators';

@Component({
  templateUrl: 'edit-evm-fee.dialog.html',
  styleUrls: ['edit-evm-fee.dialog.scss'],
})
export class PopupEditEvmFeeDialogComponent {
  editEvmFeeForm: FormGroup;
  maxFeePerGasIsLow = false;
  maxPriorityFeeIsLow = false;
  maxFeeIsLowPriorityFee = false;

  gasPriceIsLow = false;

  private custom = false;
  isEIP1559 = true;

  constructor(
    private dialogRef: MatDialogRef<PopupEditEvmFeeDialogComponent>,
    @Inject(MAT_DIALOG_DATA)
    public data: {
      sourceNeoXFeeInfo: NeoXFeeInfoProp;
      customNeoXFeeInfo: NeoXFeeInfoProp;
      symbol: string;
    },
    private fb: FormBuilder
  ) {
    if (this.data.customNeoXFeeInfo.maxFeePerGas) {
      this.isEIP1559 = true;
      this.editEvmFeeForm = this.fb.group({
        maxFeePerGas: [
          this.getValueByGWEI(this.data.customNeoXFeeInfo.maxFeePerGas),
          [Validators.required, Validators.min(0)],
        ],
        maxPriorityFeePerGas: [
          this.getValueByGWEI(this.data.customNeoXFeeInfo.maxPriorityFeePerGas),
          [Validators.required, Validators.min(0)],
        ],
        gasLimit: [
          this.data.customNeoXFeeInfo.gasLimit,
          [Validators.required, Validators.max(7920027), Validators.min(21000)],
        ],
      });
      this.listenMaxFeePerGas();
      this.listenMaxPriorityFeePerGas();
    } else {
      this.isEIP1559 = false;
      this.editEvmFeeForm = this.fb.group({
        gasPrice: [
          this.getValueByGWEI(this.data.customNeoXFeeInfo.gasPrice),
          [Validators.required, Validators.min(0)],
        ],
        gasLimit: [
          this.data.customNeoXFeeInfo.gasLimit,
          [Validators.required, Validators.max(7920027), Validators.min(21000)],
        ],
      });
      this.listenGasprice();
    }
    this.listenGasLimit();
  }

  private listenMaxFeePerGas() {
    this.editEvmFeeForm.controls.maxFeePerGas.valueChanges
      .pipe(debounceTime(400), distinctUntilChanged())
      .subscribe((query) => {
        this.custom = true;
        this.getCustomEstimateFee();
        const maxFeePerGasGWEI = this.getValueByGWEI(
          this.data.sourceNeoXFeeInfo.maxFeePerGas
        );
        if (new BigNumber(query).comparedTo(maxFeePerGasGWEI) < 0) {
          this.maxFeePerGasIsLow = true;
        } else {
          this.maxFeePerGasIsLow = false;
        }
        this.checkMaxFeeIsLowPriorityFee();
      });
  }
  private listenMaxPriorityFeePerGas() {
    this.editEvmFeeForm.controls.maxPriorityFeePerGas.valueChanges
      .pipe(debounceTime(400), distinctUntilChanged())
      .subscribe((query) => {
        this.custom = true;
        this.getCustomEstimateFee();
        const maxPriorityFeeGWEI = this.getValueByGWEI(
          this.data.sourceNeoXFeeInfo.maxPriorityFeePerGas
        );
        if (new BigNumber(query).comparedTo(maxPriorityFeeGWEI) < 0) {
          this.maxPriorityFeeIsLow = true;
        } else {
          this.maxPriorityFeeIsLow = false;
        }
        this.checkMaxFeeIsLowPriorityFee();
      });
  }
  private listenGasprice() {
    this.editEvmFeeForm.controls.gasPrice.valueChanges
      .pipe(debounceTime(400), distinctUntilChanged())
      .subscribe((query) => {
        this.custom = true;
        this.getCustomEstimateFee();
        const gasPriceGWEI = this.getValueByGWEI(
          this.data.sourceNeoXFeeInfo.gasPrice
        );
        if (new BigNumber(query).comparedTo(gasPriceGWEI) < 0) {
          this.gasPriceIsLow = true;
        } else {
          this.gasPriceIsLow = false;
        }
      });
  }
  private listenGasLimit() {
    this.editEvmFeeForm.controls.gasLimit.valueChanges
      .pipe(debounceTime(400), distinctUntilChanged())
      .subscribe(() => {
        this.custom = true;
        this.getCustomEstimateFee();
      });
  }

  private checkMaxFeeIsLowPriorityFee() {
    if (
      this.editEvmFeeForm?.value?.maxFeePerGas &&
      this.editEvmFeeForm?.value?.maxPriorityFeePerGas &&
      new BigNumber(this.editEvmFeeForm.value.maxFeePerGas).comparedTo(
        this.editEvmFeeForm.value.maxPriorityFeePerGas
      ) < 0
    ) {
      this.maxFeeIsLowPriorityFee = true;
    } else {
      this.maxFeeIsLowPriorityFee = false;
    }
  }

  private getCustomEstimateFee() {
    if (this.editEvmFeeForm.valid) {
      if (this.isEIP1559) {
        this.data.customNeoXFeeInfo.maxFeePerGas = new BigNumber(
          this.editEvmFeeForm.value.maxFeePerGas
        )
          .shiftedBy(-9)
          .toFixed();
        this.data.customNeoXFeeInfo.estimateGas = new BigNumber(
          this.data.customNeoXFeeInfo.maxFeePerGas
        )
          .times(this.editEvmFeeForm.value.gasLimit)
          .toFixed();
      } else {
        this.data.customNeoXFeeInfo.estimateGas = new BigNumber(
          this.editEvmFeeForm.value.gasPrice
        )
          .shiftedBy(-9)
          .times(this.editEvmFeeForm.value.gasLimit)
          .toFixed();
      }
    } else {
      this.data.customNeoXFeeInfo.maxFeePerGas = '';
      this.data.customNeoXFeeInfo.estimateGas = '';
    }
  }

  confirm() {
    if (!this.custom) {
      this.dialogRef.close();
      return;
    }
    this.data.customNeoXFeeInfo.gasLimit = new BigNumber(
      this.editEvmFeeForm.value.gasLimit
    ).toFixed(0, 1);

    if (this.isEIP1559) {
      this.data.customNeoXFeeInfo.maxFeePerGas = new BigNumber(
        this.editEvmFeeForm.value.maxFeePerGas
      )
        .shiftedBy(-9)
        .toFixed(18, 1);
      this.data.customNeoXFeeInfo.maxPriorityFeePerGas = new BigNumber(
        this.editEvmFeeForm.value.maxPriorityFeePerGas
      )
        .shiftedBy(-9)
        .toFixed(18, 1);
      if (
        this.data.customNeoXFeeInfo.maxFeePerGas !==
          this.data.sourceNeoXFeeInfo.maxFeePerGas ||
        this.data.customNeoXFeeInfo.maxPriorityFeePerGas !==
          this.data.sourceNeoXFeeInfo.maxPriorityFeePerGas ||
        this.data.customNeoXFeeInfo.gasLimit !==
          this.data.sourceNeoXFeeInfo.gasLimit
      ) {
        this.data.customNeoXFeeInfo.custom = true;
        this.dialogRef.close(this.data.customNeoXFeeInfo);
      } else {
        this.dialogRef.close();
      }
    } else {
      this.data.customNeoXFeeInfo.gasPrice = new BigNumber(
        this.editEvmFeeForm.value.gasPrice
      )
        .shiftedBy(-9)
        .toFixed(18, 1);
      if (
        this.data.customNeoXFeeInfo.gasPrice !==
          this.data.sourceNeoXFeeInfo.gasPrice ||
        this.data.customNeoXFeeInfo.gasLimit !==
          this.data.sourceNeoXFeeInfo.gasLimit
      ) {
        this.data.customNeoXFeeInfo.custom = true;
        this.dialogRef.close(this.data.customNeoXFeeInfo);
      } else {
        this.dialogRef.close();
      }
    }
  }

  getValueByGWEI(value: string) {
    return new BigNumber(value).shiftedBy(9).toFixed();
  }
}
