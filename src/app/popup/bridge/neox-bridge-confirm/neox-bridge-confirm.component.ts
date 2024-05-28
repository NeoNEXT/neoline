import {
  Component,
  Input,
  Output,
  EventEmitter,
  OnDestroy,
  OnInit,
} from '@angular/core';
import { GlobalService, LedgerService, UtilServiceState } from '@/app/core';
import { BigNumber } from 'bignumber.js';
import { Asset } from '@/models/models';
import { EvmTransactionParams } from '../../_lib';
import { Wallet as Wallet3 } from '@cityofzion/neon-core-neo3/lib/wallet';
import { Wallet as Wallet2 } from '@cityofzion/neon-core/lib/wallet';
import { EvmWalletJSON } from '@/app/popup/_lib/evm';
import { NeoXFeeInfoProp } from '../../transfer/create/interface';

export type TabType = 'details' | 'data';

@Component({
  selector: 'neox-bridge-confirm',
  templateUrl: 'neox-bridge-confirm.component.html',
  styleUrls: ['neox-bridge-confirm.component.scss'],
})
export class NeoXBridgeConfirmComponent implements OnInit, OnDestroy {
  @Input() bridgeAsset: Asset;
  @Input() bridgeAmount: string;
  @Input() toAddress: string;
  @Input() currentWallet: Wallet2 | Wallet3 | EvmWalletJSON;
  @Input() neoXFeeInfo: NeoXFeeInfoProp;
  @Input() txParams: EvmTransactionParams;

  @Output() backAmount = new EventEmitter();

  tabType: TabType = 'details';
  totalAmount: string;
  hexDataLength: number;

  loading = false;
  loadingMsg: string;
  getStatusInterval;

  constructor(
    private global: GlobalService,
    private ledger: LedgerService,
    private util: UtilServiceState
  ) {}

  ngOnInit(): void {
    this.calculateTotalAmount();
    this.hexDataLength = this.util.getHexDataLength(this.txParams.data);
  }

  private calculateTotalAmount() {
    this.totalAmount = new BigNumber(this.bridgeAmount)
      .plus(this.neoXFeeInfo.estimateGas)
      .toFixed();
  }

  ngOnDestroy(): void {
    this.getStatusInterval?.unsubscribe();
  }

  back() {
    this.backAmount.emit();
  }

  cancel() {
    history.go(-1);
  }

  updateEvmFee($event) {
    this.neoXFeeInfo = $event;
    this.calculateTotalAmount();
  }

  confirm() {}
}
