import { Component, EventEmitter, Input, OnInit, Output } from '@angular/core';
import { DappEVMState, AssetEVMState } from '@/app/core';
import { ETH_SOURCE_ASSET_HASH, EvmWalletJSON } from '@/app/popup/_lib/evm';
import { AddressNonceInfo, EvmTransactionParams, RpcNetwork } from '@/app/popup/_lib';
import { NeoXFeeInfoProp } from '@/app/popup/transfer/create/interface';
import { ethers } from 'ethers';
import BigNumber from 'bignumber.js';
import { Unsubscribable, timer } from 'rxjs';

@Component({
  selector: 'confirm-approve',
  templateUrl: './confirm-approve.component.html',
  styleUrls: ['./confirm-approve.component.scss'],
})
export class PopupNoticeEvmConfirmApproveComponent implements OnInit {
  @Input() lang = 'en';
  @Input() locationOrigin: string;
  @Input() iconSrc: string;
  @Input() txParams: EvmTransactionParams;
  @Input() neoXFeeInfo: NeoXFeeInfoProp;
  @Input() signAddressGasBalance: string;
  @Input() encryptWallet: EvmWalletJSON;
  @Input() estimateGasError: boolean;
  @Input() insufficientFunds: boolean;
  @Input() nonceInfo: AddressNonceInfo;

  @Input() neoXNetwork: RpcNetwork;
  @Output() closeEvent = new EventEmitter();
  @Output() updateFeeEvent = new EventEmitter<NeoXFeeInfoProp>();
  @Output() updateApproveAmountEvent = new EventEmitter<EvmTransactionParams>();
  @Output() confirmEvent = new EventEmitter();

  customNonce: number;
  ETH_SOURCE_ASSET_HASH = ETH_SOURCE_ASSET_HASH;
  assetDetails;
  tokenData;
  showDetail = false;
  isEdit = true;
  inputAmount = '';
  inputAmountIsBig = true;
  initTip = true;
  newTxParams: EvmTransactionParams;
  private inputAmountSub: Unsubscribable;
  approveAssetBalance: string;
  constructor(
    private dappEVMState: DappEVMState,
    private assetEVMState: AssetEVMState
  ) {}

  ngOnInit(): void {
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
        this.inputAmount = this.assetDetails.tokenAmount;
        this.assetEVMState
          .getNeoXAddressAssetBalance(this.txParams.from, this.txParams.to)
          .then((res) => {
            this.approveAssetBalance = ethers.formatUnits(
              res,
              this.assetDetails.decimals
            );
            this.checkInputAmountIsBig();
          });
      });
  }

  useDappApproveAmount() {
    this.inputAmount = this.assetDetails.tokenAmount;
    this.checkInputAmountIsBig();
    this.initTip = false;
  }

  useMaxApproveAmount() {
    this.inputAmount = this.approveAssetBalance;
    this.inputAmountIsBig = false;
    this.initTip = false;
  }

  handleInputAmountChange() {
    this.inputAmountSub?.unsubscribe();
    this.inputAmountSub = timer(500).subscribe(() => {
      this.checkInputAmountIsBig();
      this.initTip = false;
    });
  }

  toExplorer() {
    window.open(`${this.neoXNetwork.explorer}/address/${this.txParams.to}`);
  }

  updateEvmFee($event) {
    this.neoXFeeInfo = $event;
    this.updateFeeEvent.emit($event);
  }

  exit() {
    this.closeEvent.emit();
  }

  confirm() {
    if (this.isEdit) {
      this.isEdit = false;
      const newData = this.assetEVMState.getApproveERC20Data({
        assetAddress: this.txParams.to,
        toAddress: this.assetDetails.toAddress,
        approveAmount: ethers.parseUnits(
          this.inputAmount,
          this.assetDetails.decimals
        ),
      });
      this.newTxParams = Object.assign({}, this.txParams, { data: newData });
      this.updateApproveAmountEvent.emit(this.newTxParams);
    } else {
      this.confirmEvent.emit(this.customNonce);
    }
  }

  private checkInputAmountIsBig() {
    this.inputAmountIsBig =
      new BigNumber(this.inputAmount).comparedTo(this.approveAssetBalance) > 0
        ? true
        : false;
  }
}
