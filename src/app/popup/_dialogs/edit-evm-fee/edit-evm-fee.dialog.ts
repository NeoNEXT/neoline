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

  baseFeePerGasGWEI: string;
  maxPriorityFeeGWEI: string;

  constructor(
    private dialogRef: MatDialogRef<PopupEditEvmFeeDialogComponent>,
    @Inject(MAT_DIALOG_DATA)
    public data: {
      neoXFeeInfo: NeoXFeeInfoProp;
      customNeoXFeeInfo: NeoXFeeInfoProp;
      symbol: string;
    },
    private fb: FormBuilder
  ) {
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
    this.baseFeePerGasGWEI = this.getValueByGWEI(
      this.data.neoXFeeInfo.baseFeePerGas
    );
    this.maxPriorityFeeGWEI = this.getValueByGWEI(
      this.data.neoXFeeInfo.maxPriorityFeePerGas
    );
    this.editEvmFeeForm.controls.baseFeePerGas.valueChanges
      .pipe(debounceTime(400), distinctUntilChanged())
      .subscribe((query) => {
        this.getCustomEstimateFee();
        if (new BigNumber(query).comparedTo(this.baseFeePerGasGWEI) < 0) {
          this.baseFeePerGasIsLow = true;
        } else {
          this.baseFeePerGasIsLow = false;
        }
      });
    this.editEvmFeeForm.controls.maxPriorityFeePerGas.valueChanges
      .pipe(debounceTime(400), distinctUntilChanged())
      .subscribe((query) => {
        this.getCustomEstimateFee();
        if (new BigNumber(query).comparedTo(this.maxPriorityFeeGWEI) < 0) {
          this.maxPriorityFeeIsLow = true;
        } else {
          this.maxPriorityFeeIsLow = false;
        }
      });
    this.editEvmFeeForm.controls.gasLimit.valueChanges
      .pipe(debounceTime(400), distinctUntilChanged())
      .subscribe(() => {
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
      this.data.customNeoXFeeInfo.maxFeePerGas = '';
      this.data.customNeoXFeeInfo.estimateGas = '';
    }
  }

  confirm() {
    this.data.customNeoXFeeInfo.baseFeePerGas = new BigNumber(
      this.editEvmFeeForm.value.baseFeePerGas
    )
      .shiftedBy(-9)
      .toString();
    this.data.customNeoXFeeInfo.maxPriorityFeePerGas = new BigNumber(
      this.editEvmFeeForm.value.maxPriorityFeePerGas
    )
      .shiftedBy(-9)
      .toString();
    this.data.customNeoXFeeInfo.gasLimit = this.editEvmFeeForm.value.gasLimit;
    this.dialogRef.close(this.data.customNeoXFeeInfo);
  }

  private getValueByGWEI(value: string) {
    return new BigNumber(value).shiftedBy(9).toFixed();
  }
}
