import { Component, EventEmitter, Input, OnInit, Output } from '@angular/core';
import { DappEVMState, UtilServiceState } from '@/app/core';
import { ETH_SOURCE_ASSET_HASH } from '@/app/popup/_lib/evm';
import { EvmTransactionParams, RpcNetwork } from '@/app/popup/_lib';
import { NeoXFeeInfoProp } from '@/app/popup/transfer/create/interface';

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
  assetDetails;
  tokenData;
  hexDataLength: number;
  constructor(
    private dappEVMState: DappEVMState,
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
        console.log(res);
        this.assetDetails = res;
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
    this.confirmEvent.emit();
  }
}
