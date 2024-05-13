import { AssetEVMState } from '@/app/core';
import { PopupEditEvmFeeDialogComponent } from '@/app/popup/_dialogs';
import { Asset } from '@/models/models';
import {
  Component,
  EventEmitter,
  Input,
  OnChanges,
  OnDestroy,
  OnInit,
  Output,
  SimpleChanges,
} from '@angular/core';
import { MatDialog, MatDialogRef } from '@angular/material/dialog';
import { NeoXFeeInfoProp } from '../../../popup/transfer/create/interface';
import { timer } from 'rxjs';

@Component({
  selector: 'evm-fee',
  templateUrl: 'evm-fee.component.html',
  styleUrls: ['evm-fee.component.scss'],
})
export class EvmFeeComponent implements OnDestroy, OnChanges, OnInit {
  @Input() transferAsset?: Asset;
  @Input() transferToAddress: string;
  @Input() fromAddress: string;
  @Input() transferAmount: string;
  @Input() symbol: string;
  @Input() customNeoXFeeInfo: NeoXFeeInfoProp;
  @Input() place: 'amount' | 'confirm' | 'dapp' = 'amount';
  @Output() returnFee = new EventEmitter<NeoXFeeInfoProp>();

  sourceNeoXFeeInfo: NeoXFeeInfoProp;

  getEstimateFeeInterval;
  showEstimateFeeAnimate = false;
  editEvmFeeDialogRef: MatDialogRef<PopupEditEvmFeeDialogComponent>;

  constructor(
    private assetEVMState: AssetEVMState,
    private dialog: MatDialog
  ) {}

  ngOnInit(): void {
    if (this.customNeoXFeeInfo) {
      this.sourceNeoXFeeInfo = this.customNeoXFeeInfo;
    }
  }

  ngOnChanges(changes: SimpleChanges): void {
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
    if (!this.sourceNeoXFeeInfo) return;
    this.editEvmFeeDialogRef = this.dialog.open(
      PopupEditEvmFeeDialogComponent,
      {
        panelClass: 'custom-dialog-panel',
        data: {
          sourceNeoXFeeInfo: this.sourceNeoXFeeInfo,
          customNeoXFeeInfo:
            this.customNeoXFeeInfo ?? Object.assign({}, this.sourceNeoXFeeInfo),
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
    this.sourceNeoXFeeInfo = undefined;
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
            this.sourceNeoXFeeInfo = res;
            if (!this.customNeoXFeeInfo?.custom) {
              this.returnFee.emit(this.sourceNeoXFeeInfo);
            }
            if (this.editEvmFeeDialogRef?.componentInstance) {
              this.editEvmFeeDialogRef.componentInstance.data.sourceNeoXFeeInfo =
                res;
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
