import { EvmGasService, EvmNFTService } from '@/app/core';
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
import {
  EvmGasEstimateResult,
  NeoXFeeInfoProp,
} from '../../../popup/transfer/create/interface';
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
  @Input() siteNeoXFeeInfo?: NeoXFeeInfoProp;
  @Input() place: 'amount' | 'confirm' | 'dapp' = 'amount';
  @Output() returnFee = new EventEmitter<NeoXFeeInfoProp>();

  sourceNeoXFeeInfo: NeoXFeeInfoProp;
  networkError = false;

  getEstimateFeeInterval;
  showEstimateFeeAnimate = false;
  editEvmFeeDialogRef: MatDialogRef<PopupEditEvmFeeDialogComponent>;

  isUseSiteFee = true;

  constructor(
    private evmNFTService: EvmNFTService,
    private dialog: MatDialog,
    private evmGasService: EvmGasService
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
          siteNeoXFeeInfo: this.siteNeoXFeeInfo,
          symbol: this.symbol,
        },
      }
    );
    this.editEvmFeeDialogRef.afterClosed().subscribe((res) => {
      if (res?.useSite) {
        this.isUseSiteFee = true;
        this.returnFee.emit(this.siteNeoXFeeInfo);
      } else if (res) {
        this.isUseSiteFee = false;
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
      (this.place === 'dapp' && this.txParams)
    ) {
      this.getEstimateFeeInterval = timer(0, 10000).subscribe(async () => {
        let estimate: EvmGasEstimateResult;
        let res: NeoXFeeInfoProp;
        // Only the RPC calls belong in the try: a failure here means a network
        // error. Post-processing (emit, dialog updates) runs afterwards so its
        // exceptions aren't misreported as an estimate/network failure.
        try {
          if (this.place === 'dapp') {
            estimate = await this.evmGasService.estimateGas(this.txParams);
          } else if (this.transferNFT) {
            estimate = await this.evmNFTService.estimateGasOfTransfer({
              asset: this.nftAsset,
              token: this.transferNFT,
              fromAddress: this.fromAddress,
              toAddress: this.transferToAddress,
            });
          } else {
            estimate = await this.evmGasService.estimateGasOfTransfer({
              asset: this.transferAsset,
              fromAddress: this.fromAddress,
              toAddress: this.transferToAddress,
              transferAmount: this.transferAmount || '1',
            });
          }
          res = await this.evmGasService.getGasInfo(
            estimate.gasLimit,
            estimate.block
          );
        } catch {
          // RPC failure: the block itself couldn't be fetched, so there is no basis
          // for an estimate. Surface a network error instead of a fabricated value.
          this.networkError = true;
          this.sourceNeoXFeeInfo = undefined;
          return;
        }
        res.estimateGasError = estimate.simulationFailed;
        this.networkError = false;
        this.sourceNeoXFeeInfo = res;
        if (
          !this.customNeoXFeeInfo?.custom &&
          (!this.isUseSiteFee || (this.isUseSiteFee && !this.siteNeoXFeeInfo))
        ) {
          this.returnFee.emit(Object.assign({}, res));
          this.showEstimateFeeAnimate = true;
          timer(1500).subscribe(() => {
            this.showEstimateFeeAnimate = false;
          });
        }
        if (this.editEvmFeeDialogRef?.componentInstance) {
          this.editEvmFeeDialogRef.componentInstance.data.sourceNeoXFeeInfo = res;
        }
      });
    }
  }
}
