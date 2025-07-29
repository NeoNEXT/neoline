import { Component, EventEmitter, Input, Output, OnInit } from '@angular/core';
import { ETH_SOURCE_ASSET_HASH } from '@/app/popup/_lib/evm';
import {
  AddressNonceInfo,
  EvmTransactionParams,
  RpcNetwork,
} from '@/app/popup/_lib';
import { NeoXFeeInfoProp } from '@/app/popup/transfer/create/interface';
import BigNumber from 'bignumber.js';
import { DappEVMState, UtilServiceState } from '@/app/core';
import { RateType } from '../evm-send-tx.component';

type TabType = 'details' | 'data';

@Component({
  selector: 'confirm-send-ether',
  templateUrl: './confirm-send-ether.component.html',
  styleUrls: ['../send-common.scss'],
})
export class PopupNoticeEvmConfirmSendEtherComponent implements OnInit {
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

  ETH_SOURCE_ASSET_HASH = ETH_SOURCE_ASSET_HASH;
  tabType: TabType = 'details';
  hexDataLength: number;
  customNonce: number;
  neoXFeeInfo: NeoXFeeInfoProp;
  fromWalletName: string;
  toWalletName: string;

  constructor(
    private dappEVMState: DappEVMState,
    private util: UtilServiceState
  ) {}

  ngOnInit(): void {
    this.fromWalletName = this.dappEVMState.getWalletName(this.txParams.from);
    this.toWalletName = this.dappEVMState.getWalletName(this.txParams.to);
    this.hexDataLength = this.util.getHexDataLength(this.txParams.data);
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
}
