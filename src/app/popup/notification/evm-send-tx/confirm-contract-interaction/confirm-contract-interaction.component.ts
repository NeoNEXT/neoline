import { Component, EventEmitter, Input, OnInit, Output } from '@angular/core';
import { DappEVMState } from '@/app/core';
import { ETH_SOURCE_ASSET_HASH } from '@/app/popup/_lib/evm';
import { EvmTransactionParams, RpcNetwork } from '@/app/popup/_lib';
import { NeoXFeeInfoProp } from '@/app/popup/transfer/create/interface';
import BigNumber from 'bignumber.js';

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
  @Input() neoXFeeInfo: NeoXFeeInfoProp;
  @Input() signAddressGasBalance: string;
  @Input() estimateGasError: boolean;
  @Input() insufficientFunds: boolean;

  @Input() neoXNetwork: RpcNetwork;
  @Output() closeEvent = new EventEmitter();
  @Output() updateFeeEvent = new EventEmitter<NeoXFeeInfoProp>();
  @Output() confirmEvent = new EventEmitter();

  ETH_SOURCE_ASSET_HASH = ETH_SOURCE_ASSET_HASH;
  tabType: TabType = 'details';
  contractMethodData: { fourByteSig: string; name: string; params: any[] };
  constructor(private dappEVMState: DappEVMState) {}

  ngOnInit(): void {
    this.dappEVMState
      .getContractMethodData(this.txParams.data)
      .subscribe((res) => {
        this.contractMethodData = res;
      });
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
}
