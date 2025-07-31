import { Component, EventEmitter, Input, OnInit, Output } from '@angular/core';
import { DappEVMState, AssetEVMState, UtilServiceState } from '@/app/core';
import { EvmWalletJSON } from '@/app/popup/_lib/evm';
import {
  AddressNonceInfo,
  EvmTransactionParams,
  RpcNetwork,
} from '@/app/popup/_lib';
import { NeoXFeeInfoProp } from '@/app/popup/transfer/create/interface';
import { ethers } from 'ethers';
import { RateType } from '../evm-send-tx.component';
import { PopupEditApproveCapDialogComponent } from '@/app/popup/_dialogs';
import { MatDialog } from '@angular/material/dialog';

type TabType = 'details' | 'data';

@Component({
  selector: 'confirm-approve',
  templateUrl: './confirm-approve.component.html',
  styleUrls: ['../send-common.scss', './confirm-approve.component.scss'],
})
export class PopupNoticeEvmConfirmApproveComponent implements OnInit {
  @Input() lang = 'en';
  @Input() locationOrigin: string;
  @Input() iconSrc: string;
  @Input() txParams: EvmTransactionParams;
  @Input() siteNeoXFeeInfo: NeoXFeeInfoProp;
  @Input() signAddressGasBalance: string;
  @Input() encryptWallet: EvmWalletJSON;
  @Input() estimateGasError: boolean;
  @Input() insufficientFunds: boolean;
  @Input() nonceInfo: AddressNonceInfo;
  @Input() rate: RateType;

  @Input() neoXNetwork: RpcNetwork;
  @Output() closeEvent = new EventEmitter();
  @Output() updateFeeEvent = new EventEmitter<NeoXFeeInfoProp>();
  @Output() updateApproveAmountEvent = new EventEmitter<EvmTransactionParams>();
  @Output() confirmEvent = new EventEmitter();
  @Output() returnAssetDetail = new EventEmitter();

  customNonce: number;
  tabType: TabType = 'details';
  hexDataLength: number;
  assetDetails;
  tokenData;
  approveAmount = '';
  newTxParams: EvmTransactionParams;
  approveAssetBalance: string;
  neoXFeeInfo: NeoXFeeInfoProp;
  constructor(
    private dappEVMState: DappEVMState,
    private assetEVMState: AssetEVMState,
    private dialog: MatDialog,
    private util: UtilServiceState
  ) {}

  ngOnInit(): void {
    this.hexDataLength = this.util.getHexDataLength(this.txParams.data);
    this.tokenData = this.dappEVMState.parseStandardTokenTransactionData(
      this.txParams.data
    );
    this.dappEVMState
      .getAssetDetails(
        this.txParams.to,
        this.txParams.from,
        this.txParams.data,
        null
      )
      .then((res) => {
        this.assetDetails = res;
        this.returnAssetDetail.emit(this.assetDetails);

        this.approveAmount = this.assetDetails.tokenAmount;
        this.assetEVMState
          .getNeoXAddressAssetBalance(this.txParams.from, this.txParams.to)
          .then((res) => {
            this.approveAssetBalance = ethers.formatUnits(
              res,
              this.assetDetails.decimals
            );
          });
      });
  }

  openEditApproveCapDialog() {
    this.dialog
      .open(PopupEditApproveCapDialogComponent, {
        panelClass: 'custom-dialog-panel',
        backdropClass: 'custom-dialog-backdrop',
        data: {
          approveAssetBalance: this.approveAssetBalance,
          approveAmount: this.approveAmount,
        },
      })
      .afterClosed()
      .subscribe((res) => {
        if (res) {
          this.approveAmount = res;
          const newData = this.assetEVMState.getApproveERC20Data({
            assetAddress: this.txParams.to,
            toAddress: this.assetDetails.toAddress,
            approveAmount: ethers.parseUnits(
              this.approveAmount,
              this.assetDetails.decimals
            ),
          });
          this.newTxParams = Object.assign({}, this.txParams, {
            data: newData,
          });
          this.updateApproveAmountEvent.emit(this.newTxParams);
        }
      });
  }

  updateEvmFee($event) {
    this.neoXFeeInfo = $event;
    this.updateFeeEvent.emit($event);
  }

  exit() {
    this.closeEvent.emit();
  }

  confirm() {
    this.confirmEvent.emit(this.customNonce);
  }

  changeNonce($event) {
    this.customNonce = $event;
  }
}
