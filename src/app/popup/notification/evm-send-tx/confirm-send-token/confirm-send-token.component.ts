import { Component, EventEmitter, Input, OnInit, Output } from '@angular/core';
import { EvmDappService, RateState } from '@/app/core';
import { ETH_SOURCE_ASSET_HASH } from '@/app/popup/_lib/evm';
import {
  AddressNonceInfo,
  EvmTransactionParams,
  RpcNetwork,
} from '@/app/popup/_lib';
import { NeoXFeeInfoProp } from '@/app/popup/transfer/create/interface';
import { RateType } from '../evm-send-tx.component';
import {
  detectContractSecurityToThirdPartySite,
  getHexDataLength,
} from '@/app/core/utils/evm';

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
    private evmDappService: EvmDappService,
    private rateState: RateState
  ) {}

  ngOnInit(): void {
    this.hexDataLength = getHexDataLength(this.txParams.data);
    this.tokenData = this.evmDappService.parseStandardTokenTransactionData(
      this.txParams.data
    );

    this.fromWalletName = this.evmDappService.getWalletName(this.txParams.from);
    this.evmDappService
      .getAssetDetails(
        this.txParams.to,
        this.txParams.from,
        this.txParams.data,
        null
      )
      .then((res) => {
        this.assetDetails = res;
        if (this.assetDetails?.toAddress) {
          this.toWalletName = this.evmDappService.getWalletName(
            this.assetDetails.toAddress
          );
        }
        this.returnAssetDetail.emit(this.assetDetails);

        this.rateState
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
    detectContractSecurityToThirdPartySite(
      this.neoXNetwork.chainId,
      this.txParams.to
    );
  }
}
