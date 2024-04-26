import { AssetEVMState } from '@/app/core';
import { PopupEditEvmFeeDialogComponent } from '@/app/popup/_dialogs';
import { Asset } from '@/models/models';
import {
  Component,
  EventEmitter,
  Input,
  OnChanges,
  OnDestroy,
  Output,
  SimpleChanges,
} from '@angular/core';
import { MatDialog, MatDialogRef } from '@angular/material/dialog';
import { NeoXFeeInfoProp } from '../interface';
import { timer } from 'rxjs';

@Component({
  selector: 'evm-fee',
  templateUrl: 'evm-fee.component.html',
  styleUrls: ['evm-fee.component.scss'],
})
export class EvmFeeComponent implements OnDestroy, OnChanges {
  @Input() transferAsset: Asset;
  @Input() transferToAddress: string;
  @Input() fromAddress: string;
  @Input() transferAmount: string;
  @Input() symbol: string;
  @Input() customNeoXFeeInfo: NeoXFeeInfoProp;
  @Output() returnFee = new EventEmitter<NeoXFeeInfoProp>();

  neoXFeeInfo: NeoXFeeInfoProp;

  getEstimateFeeInterval;
  showEstimateFeeAnimate = false;
  editEvmFeeDialogRef: MatDialogRef<PopupEditEvmFeeDialogComponent>;

  constructor(
    private assetEVMState: AssetEVMState,
    private dialog: MatDialog
  ) {}

  ngOnChanges(changes: SimpleChanges): void {
    console.log(changes);

    if (
      (changes.transferAsset &&
        changes.transferAsset.currentValue !==
          changes.transferAsset.previousValue) ||
      (changes.transferToAddress &&
        changes.transferToAddress.currentValue !==
          changes.transferToAddress.previousValue)
    ) {
      this.getEvmEstimateFee();
    }
  }

  ngOnDestroy(): void {
    this.getEstimateFeeInterval?.unsubscribe();
  }

  editEvmFee() {
    if (!this.neoXFeeInfo) return;
    this.editEvmFeeDialogRef = this.dialog.open(
      PopupEditEvmFeeDialogComponent,
      {
        panelClass: 'custom-dialog-panel',
        data: {
          neoXFeeInfo: this.neoXFeeInfo,
          customNeoXFeeInfo: this.customNeoXFeeInfo ?? this.neoXFeeInfo,
          symbol: this.symbol,
        },
      }
    );
    this.editEvmFeeDialogRef.afterClosed().subscribe((res) => {
      if (res) {
        this.customNeoXFeeInfo = res;
        this.returnFee.emit(this.customNeoXFeeInfo);
      }
    });
  }

  private getEvmEstimateFee() {
    console.log('---');

    this.getEstimateFeeInterval?.unsubscribe();
    if (this.transferAsset && this.transferToAddress) {
      this.getEstimateFeeInterval = timer(0, 10000).subscribe(() => {
        this.assetEVMState
          .getTransferERC20Info({
            asset: this.transferAsset,
            fromAddress: this.fromAddress,
            toAddress: this.transferToAddress,
            transferAmount: this.transferAmount || '1',
          })
          .then((res) => {
            this.neoXFeeInfo = res;
            if (!this.customNeoXFeeInfo) {
              this.returnFee.emit(this.neoXFeeInfo);
            }
            if (this.editEvmFeeDialogRef?.componentInstance) {
              this.editEvmFeeDialogRef.componentInstance.data.neoXFeeInfo = res;
            }
            this.showEstimateFeeAnimate = true;
            timer(1500).subscribe(() => {
              this.showEstimateFeeAnimate = false;
            });
          });
      });
    }
  }
}
