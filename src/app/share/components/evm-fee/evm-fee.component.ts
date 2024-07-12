import { AssetEVMState, EvmNFTState } from '@/app/core';
import { PopupEditEvmFeeDialogComponent } from '@/app/popup/_dialogs';
import { Asset, NftAsset, NftToken } from '@/models/models';
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
  @Input() txParams?;
  @Input() transferAsset?: Asset;
  @Input() nftAsset?: NftAsset;
  @Input() transferNFT?: NftToken;
  @Input() transferToAddress?: string;
  @Input() fromAddress?: string;
  @Input() transferAmount?: string;
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
    private evmNFTState: EvmNFTState,
    private dialog: MatDialog
  ) {}

  ngOnInit(): void {
    if (this.customNeoXFeeInfo) {
      this.sourceNeoXFeeInfo = Object.assign({}, this.customNeoXFeeInfo);
    }
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (
      (changes.transferAsset &&
        changes.transferAsset.currentValue !==
          changes.transferAsset.previousValue) ||
      (changes.transferToAddress &&
        changes.transferToAddress.currentValue !==
          changes.transferToAddress.previousValue) ||
      (changes.txParams &&
        changes.txParams.currentValue !== changes.txParams.previousValue)
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
        backdropClass: 'custom-dialog-backdrop',
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
    if (
      (this.transferAsset && this.transferToAddress) ||
      (this.transferNFT && this.transferToAddress) ||
      this.place === 'dapp'
    ) {
      this.getEstimateFeeInterval = timer(0, 10000).subscribe(async () => {
        let networkGasLimit: bigint;
        try {
          if (this.place === 'dapp') {
            networkGasLimit = await this.assetEVMState.estimateGas(
              this.txParams
            );
          } else if (this.transferNFT) {
            networkGasLimit = await this.evmNFTState.estimateGasOfTransfer({
              asset: this.nftAsset,
              token: this.transferNFT,
              fromAddress: this.fromAddress,
              toAddress: this.transferToAddress,
            });
          } else {
            networkGasLimit = await this.assetEVMState.estimateGasOfTransfer({
              asset: this.transferAsset,
              fromAddress: this.fromAddress,
              toAddress: this.transferToAddress,
              transferAmount: this.transferAmount || '1',
            });
          }
        } catch {
          networkGasLimit = BigInt(42750000);
        }
        this.assetEVMState.getGasInfo(networkGasLimit).then((res) => {
          this.sourceNeoXFeeInfo = res;
          if (!this.customNeoXFeeInfo?.custom) {
            this.returnFee.emit(Object.assign({}, res));
            this.showEstimateFeeAnimate = true;
            timer(1500).subscribe(() => {
              this.showEstimateFeeAnimate = false;
            });
          }
          if (this.editEvmFeeDialogRef?.componentInstance) {
            this.editEvmFeeDialogRef.componentInstance.data.sourceNeoXFeeInfo =
              res;
          }
        });
      });
    }
  }
}
