import { Component, EventEmitter, Input, Output } from '@angular/core';
import { ETH_SOURCE_ASSET_HASH } from '@/app/popup/_lib/evm';
import { AddressNonceInfo, EvmTransactionParams, RpcNetwork } from '@/app/popup/_lib';
import { NeoXFeeInfoProp } from '@/app/popup/transfer/create/interface';
import BigNumber from 'bignumber.js';
import { DappEVMState } from '@/app/core';

@Component({
  selector: 'confirm-send-ether',
  templateUrl: './confirm-send-ether.component.html',
  styleUrls: ['../send-common.scss'],
})
export class PopupNoticeEvmConfirmSendEtherComponent {
  @Input() locationOrigin: string;
  @Input() txParams: EvmTransactionParams;
  @Input() amount: string;
  @Input() neoXFeeInfo: NeoXFeeInfoProp;
  @Input() signAddressGasBalance: string;
  @Input() estimateGasError: boolean;
  @Input() insufficientFunds: boolean;
  @Input() nonceInfo: AddressNonceInfo;

  @Input() neoXNetwork: RpcNetwork;
  @Output() closeEvent = new EventEmitter();
  @Output() updateFeeEvent = new EventEmitter<NeoXFeeInfoProp>();
  @Output() confirmEvent = new EventEmitter();

  ETH_SOURCE_ASSET_HASH = ETH_SOURCE_ASSET_HASH;

  constructor(private dappEVMState: DappEVMState) {}

  updateEvmFee($event) {
    this.neoXFeeInfo = $event;
    this.updateFeeEvent.emit($event);
  }

  exit() {
    this.closeEvent.emit();
  }

  confirm() {
    this.confirmEvent.emit();
  }

  getShowAmount() {
    if (!!this.amount) {
      const newAmount = new BigNumber(this.amount).dp(8, 1).toFixed();
      if (newAmount === '0') {
        return '< 0.0000001';
      }
      return newAmount;
    }
  }

  getEvmTotalData() {
    if (!!this.amount && !!this.neoXFeeInfo?.estimateGas) {
      return new BigNumber(this.amount)
        .plus(this.neoXFeeInfo.estimateGas)
        .dp(8, 1)
        .toFixed();
    }
  }
}
