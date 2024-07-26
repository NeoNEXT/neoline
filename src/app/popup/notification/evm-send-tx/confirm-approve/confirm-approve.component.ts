import { Component, EventEmitter, Input, OnInit, Output } from '@angular/core';
import { DappEVMState, AssetEVMState } from '@/app/core';
import { ETH_SOURCE_ASSET_HASH, EvmWalletJSON } from '@/app/popup/_lib/evm';
import { EvmTransactionParams, RpcNetwork } from '@/app/popup/_lib';
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

  @Input() neoXNetwork: RpcNetwork;
  @Output() closeEvent = new EventEmitter();
  @Output() updateFeeEvent = new EventEmitter<NeoXFeeInfoProp>();
  @Output() updateApproveAmountEvent = new EventEmitter<EvmTransactionParams>();
  @Output() confirmEvent = new EventEmitter();

  ETH_SOURCE_ASSET_HASH = ETH_SOURCE_ASSET_HASH;
  assetDetails;
  tokenData;
  showDetail = false;
  isEdit = true;
  inputAmount = '';
  inputAmountIsBig = true;
  inputAmountTip;
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
        this.getInputTip(true);
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
    this.getInputTip();
  }

  useMaxApproveAmount() {
    this.inputAmount = this.approveAssetBalance;
    this.inputAmountIsBig = false;
    this.getInputTip();
  }

  handleInputAmountChange() {
    this.inputAmountSub?.unsubscribe();
    this.inputAmountSub = timer(500).subscribe(() => {
      this.checkInputAmountIsBig();
      this.getInputTip();
    });
  }

  toExplorer() {
    window.open(`${this.neoXNetwork.explorer}/address/${this.txParams.to}`);
  }

  updateEvmFee($event) {
    this.neoXFeeInfo = $event;
    this.updateFeeEvent.emit($event);
  }

  getTranslate() {
    return this.dappEVMState.getInsufficientGasTranslate(
      this.lang,
      this.neoXNetwork.name,
      this.neoXNetwork.symbol
    );
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
      this.confirmEvent.emit();
    }
  }

  private checkInputAmountIsBig() {
    this.inputAmountIsBig =
      new BigNumber(this.inputAmount).comparedTo(this.approveAssetBalance) > 0
        ? true
        : false;
  }

  private getInputTip(init = false): void {
    let type: 'init' | 'big' | 'normal' = 'init';
    if (!init) {
      type = this.inputAmountIsBig ? 'big' : 'normal';
    }
    switch (type) {
      case 'init':
        this.inputAmountTip =
          this.lang === 'en'
            ? `This action allows a third party to spend ${this.assetDetails?.symbol} from your current balance.`
            : `此操作允许第三方从您的当前余额中支出 ${this.assetDetails?.symbol}。`;
        break;
      case 'big':
        this.inputAmountTip =
          this.lang === 'en'
            ? `This allows the third party to spend all your token balance until it reaches the cap or you revoke the spending cap. If this is not intended, consider setting a lower spending cap.`
            : `此操作允许第三方支出您所有的代币余额，直到达到上限或您撤销支出上限为止。如果不是有意为之，请考虑设置较低的支出上限。`;
        break;
      case 'normal':
        this.inputAmountTip =
          this.lang === 'en'
            ? `This allows the third party to spend  ${this.inputAmount} ${this.assetDetails?.symbol} from your current balance.`
            : `此操作允许第三方从您的当前余额中支出 ${this.inputAmount} ${this.assetDetails?.symbol}。`;
        break;
    }
  }
}
