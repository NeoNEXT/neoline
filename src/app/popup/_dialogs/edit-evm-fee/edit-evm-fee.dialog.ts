import { Component, Inject } from '@angular/core';
import { MatDialogRef, MAT_DIALOG_DATA } from '@angular/material/dialog';
import {
  AbstractControl,
  FormBuilder,
  FormGroup,
  ValidatorFn,
  Validators,
} from '@angular/forms';
import { NeoXFeeInfoProp } from '../../transfer/create/interface';
import BigNumber from 'bignumber.js';
import { debounceTime, distinctUntilChanged } from 'rxjs/operators';

@Component({
  templateUrl: 'edit-evm-fee.dialog.html',
  styleUrls: ['edit-evm-fee.dialog.scss'],
})
export class PopupEditEvmFeeDialogComponent {
  editEvmFeeForm: FormGroup;
  baseFeePerGasIsLow = false;
  maxPriorityFeeIsLow = false;

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
        baseFeePerGas: [
          this.getValueByGWEI(this.data.customNeoXFeeInfo.baseFeePerGas),
          [Validators.required, Validators.min(0), this.checkBaseFeePerGas()],
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
      this.listenBaseFeePerGas();
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

  private listenBaseFeePerGas() {
    this.editEvmFeeForm.controls.baseFeePerGas.valueChanges
      .pipe(debounceTime(400), distinctUntilChanged())
      .subscribe((query) => {
        this.custom = true;
        this.getCustomEstimateFee();
        const baseFeePerGasGWEI = this.getValueByGWEI(
          this.data.sourceNeoXFeeInfo.baseFeePerGas
        );
        if (new BigNumber(query).comparedTo(baseFeePerGasGWEI) < 0) {
          this.baseFeePerGasIsLow = true;
        } else {
          this.baseFeePerGasIsLow = false;
        }
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

  private checkBaseFeePerGas(): ValidatorFn {
    return (control: AbstractControl): { [key: string]: any } | null => {
      const baseFeePerGas = control.value;
      if (!baseFeePerGas && baseFeePerGas !== 0) {
        return null;
      }
      let valid = true;
      if (
        new BigNumber(baseFeePerGas || 0).comparedTo(
          this.editEvmFeeForm?.value?.maxPriorityFeePerGas || 0
        ) < 0
      ) {
        valid = false;
      }
      return valid === false
        ? { errorLowPriorityFee: { value: control.value } }
        : null;
    };
  }

  private getCustomEstimateFee() {
    if (this.editEvmFeeForm.valid) {
      if (this.isEIP1559) {
        this.data.customNeoXFeeInfo.maxFeePerGas = new BigNumber(
          this.editEvmFeeForm.value.baseFeePerGas
        )
          .times(2)
          .plus(this.editEvmFeeForm.value.maxPriorityFeePerGas)
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
    this.data.customNeoXFeeInfo.gasLimit = this.editEvmFeeForm.value.gasLimit;

    if (this.isEIP1559) {
      this.data.customNeoXFeeInfo.baseFeePerGas = new BigNumber(
        this.editEvmFeeForm.value.baseFeePerGas
      )
        .shiftedBy(-9)
        .toFixed();
      this.data.customNeoXFeeInfo.maxPriorityFeePerGas = new BigNumber(
        this.editEvmFeeForm.value.maxPriorityFeePerGas
      )
        .shiftedBy(-9)
        .toFixed();
      if (
        this.data.customNeoXFeeInfo.baseFeePerGas !==
          this.data.sourceNeoXFeeInfo.baseFeePerGas ||
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
        .toFixed();
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
