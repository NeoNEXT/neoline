import { Component, EventEmitter, Input, OnInit, Output } from '@angular/core';
import { DappEVMState } from '@/app/core';
import { ETH_SOURCE_ASSET_HASH } from '@/app/popup/_lib/evm';
import {
  AddressNonceInfo,
  EvmTransactionParams,
  RpcNetwork,
} from '@/app/popup/_lib';
import { NeoXFeeInfoProp } from '@/app/popup/transfer/create/interface';
import BigNumber from 'bignumber.js';
import { RateType } from '../evm-send-tx.component';
import {
  detectContractSecurityToThirdPartySite,
  getHexDataLength,
} from '@/app/core/utils/evm';

type TabType = 'details' | 'data';

@Component({
  selector: 'confirm-contract-interaction',
  templateUrl: './confirm-contract-interaction.component.html',
  styleUrls: ['../send-common.scss'],
})
export class PopupNoticeEvmConfirmContractInteractionComponent
  implements OnInit
{
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

  customNonce: number;
  ETH_SOURCE_ASSET_HASH = ETH_SOURCE_ASSET_HASH;
  tabType: TabType = 'details';
  contractMethodData: { fourByteSig: string; name: string; params: any[] };
  hexDataLength: number;
  neoXFeeInfo: NeoXFeeInfoProp;
  fromWalletName: string;
  decodeData;
  contractName: string;
  contractIsRisk = false;

  constructor(private dappEVMState: DappEVMState) {}

  ngOnInit(): void {
    this.hexDataLength = getHexDataLength(this.txParams.data);
    this.dappEVMState
      .detectContractSecurity(this.txParams.to)
      .subscribe((res) => {
        this.contractIsRisk = res;
      });
    this.dappEVMState
      .getContractNameAndDecodeData({
        chainId: this.neoXNetwork.chainId,
        inputData: this.txParams.data,
        contract: this.txParams.to,
      })
      .subscribe((res) => {
        this.decodeData = res.decodeData;
        this.contractName = res.contractName;
      });
    this.dappEVMState
      .getContractMethodData(this.txParams.data)
      .subscribe((res) => {
        this.contractMethodData = res;
      });
    this.fromWalletName = this.dappEVMState.getWalletName(this.txParams.from);
  }

  getShowAmount() {
    if (this.amount === '0') {
      return '0';
    }
    if (!!this.amount) {
      const newAmount = new BigNumber(this.amount).dp(8, 1).toFixed();
      if (newAmount === '0') {
        return '< 0.0000001';
      }
      return newAmount;
    }
  }

  getEvmTotalData() {
    if (
      !!this.amount &&
      (!!this.neoXFeeInfo?.estimateGas || !!this.siteNeoXFeeInfo?.estimateGas)
    ) {
      return new BigNumber(this.amount)
        .plus(
          this.neoXFeeInfo?.estimateGas ?? this.siteNeoXFeeInfo?.estimateGas
        )
        .dp(8, 1)
        .toFixed();
    }
  }

  updateEvmFee($event) {
    this.neoXFeeInfo = $event;
    this.updateFeeEvent.emit($event);
  }

  changeNonce($event) {
    this.customNonce = $event;
  }

  exit() {
    this.closeEvent.emit();
  }

  confirm() {
    this.confirmEvent.emit(this.customNonce);
  }

  detectContractSecurity() {
    detectContractSecurityToThirdPartySite(
      this.neoXNetwork.chainId,
      this.txParams.to
    );
  }
}
