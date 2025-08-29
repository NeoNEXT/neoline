import { Component, EventEmitter, Input, OnInit, Output } from '@angular/core';
import { DappEVMState, UtilServiceState, AssetState } from '@/app/core';
import { ETH_SOURCE_ASSET_HASH } from '@/app/popup/_lib/evm';
import {
  AddressNonceInfo,
  EvmTransactionParams,
  RpcNetwork,
} from '@/app/popup/_lib';
import { NeoXFeeInfoProp } from '@/app/popup/transfer/create/interface';
import { RateType } from '../evm-send-tx.component';

type TabType = 'details' | 'data';

@Component({
  selector: 'confirm-send-token',
  templateUrl: './confirm-send-token.component.html',
  styleUrls: ['../send-common.scss'],
})
export class PopupNoticeEvmConfirmSendTokenComponent implements OnInit {
  @Input() locationOrigin: string;
  @Input() txParams: EvmTransactionParams;
  @Input() amount: string;
  @Input() siteNeoXFeeInfo: NeoXFeeInfoProp;
  @Input() signAddressGasBalance: string;
  @Input() estimateGasError: boolean;
  @Input() insufficientFunds: boolean;
  @Input() nonceInfo: AddressNonceInfo;
  @Input() rate: RateType;

  @Input() neoXNetwork: RpcNetwork;
  @Output() closeEvent = new EventEmitter();
  @Output() updateFeeEvent = new EventEmitter<NeoXFeeInfoProp>();
  @Output() confirmEvent = new EventEmitter();
  @Output() returnAssetDetail = new EventEmitter();

  customNonce: number;
  ETH_SOURCE_ASSET_HASH = ETH_SOURCE_ASSET_HASH;
  tabType: TabType = 'details';
  assetDetails;
  sendAssetRate = '';
  tokenData;
  hexDataLength: number;
  neoXFeeInfo: NeoXFeeInfoProp;
  fromWalletName: string;
  toWalletName: string;
  constructor(
    private dappEVMState: DappEVMState,
    private util: UtilServiceState,
    private assetState: AssetState
  ) {}

  ngOnInit(): void {
    this.hexDataLength = this.util.getHexDataLength(this.txParams.data);
    this.tokenData = this.dappEVMState.parseStandardTokenTransactionData(
      this.txParams.data
    );

    this.fromWalletName = this.dappEVMState.getWalletName(this.txParams.from);
    this.dappEVMState
      .getAssetDetails(
        this.txParams.to,
        this.txParams.from,
        this.txParams.data,
        null
      )
      .then((res) => {
        this.assetDetails = res;
        if (this.assetDetails?.toAddress) {
          this.toWalletName = this.dappEVMState.getWalletName(
            this.assetDetails.toAddress
          );
        }
        this.returnAssetDetail.emit(this.assetDetails);

        this.assetState
          .getAssetAmountRate({
            chainType: 'NeoX',
            assetId: this.txParams.to,
            chainId: this.neoXNetwork.chainId,
            amount: this.assetDetails.tokenAmount,
          })
          .then((res) => {
            this.sendAssetRate = res;
          });
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
    this.util.detectContractSecurity(
      this.neoXNetwork.chainId,
      this.txParams.to
    );
  }
}
