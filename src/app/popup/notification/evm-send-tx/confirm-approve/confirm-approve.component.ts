import { Component, EventEmitter, Input, OnInit, Output } from '@angular/core';
import { EvmAssetService, EvmDappService, EvmTxService } from '@/app/core';
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
import {
  detectContractSecurityToThirdPartySite,
  getHexDataLength,
} from '@/app/core/utils/evm';

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
    private evmDappService: EvmDappService,
    private evmTxService: EvmTxService,
    private evmAssetService: EvmAssetService,
    private dialog: MatDialog
  ) {}

  ngOnInit(): void {
    this.hexDataLength = getHexDataLength(this.txParams.data);
    this.tokenData = this.evmDappService.parseStandardTokenTransactionData(
      this.txParams.data
    );
    this.evmDappService
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
        this.evmAssetService
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
          const newData = this.evmTxService.getApproveERC20Data({
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

  detectContractSecurity() {
    detectContractSecurityToThirdPartySite(
      this.neoXNetwork.chainId,
      this.txParams.to
    );
  }
}
