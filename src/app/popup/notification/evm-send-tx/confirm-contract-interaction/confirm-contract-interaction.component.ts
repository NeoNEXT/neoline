import { Component, Input, OnDestroy, OnInit } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import {
  ChromeService,
  LedgerService,
  AssetEVMState,
  DappEVMState,
} from '@/app/core';
import { MatDialog } from '@angular/material/dialog';
import { Store } from '@ngrx/store';
import { AppState } from '@/app/reduers';
import { Unsubscribable } from 'rxjs';
import { ERRORS } from '@/models/dapi';
import { requestTargetEVM } from '@/models/evm';
import { ETH_SOURCE_ASSET_HASH, EvmWalletJSON } from '@/app/popup/_lib/evm';
import { EvmTransactionParams, RpcNetwork } from '@/app/popup/_lib';
import { NeoXFeeInfoProp } from '@/app/popup/transfer/create/interface';

type TabType = 'details' | 'data';

@Component({
  selector: 'confirm-contract-interaction',
  templateUrl: './confirm-contract-interaction.component.html',
  styleUrls: ['./confirm-contract-interaction.component.scss'],
})
export class PopupNoticeEvmConfirmContractInteractionComponent
  implements OnInit, OnDestroy
{
  @Input() messageID: string;
  @Input() locationOrigin: string;
  @Input() txParams: EvmTransactionParams;
  @Input() amount: string;
  @Input() neoXFeeInfo: NeoXFeeInfoProp;
  @Input() signAddressGasBalance: string;

  ETH_SOURCE_ASSET_HASH = ETH_SOURCE_ASSET_HASH;
  tabType: TabType = 'details';
  loading = false;
  canSend = false;
  tokenData;

  private accountSub: Unsubscribable;
  neoXWalletArr: EvmWalletJSON[];
  neoXNetwork: RpcNetwork;
  constructor(
    private aRoute: ActivatedRoute,
    private chrome: ChromeService,
    private dialog: MatDialog,
    private ledger: LedgerService,
    private assetEVMState: AssetEVMState,
    private dappEVMState: DappEVMState,
    private store: Store<AppState>
  ) {
    const account$ = this.store.select('account');
    this.accountSub = account$.subscribe((state) => {
      this.neoXWalletArr = state.neoXWalletArr;
      this.neoXNetwork = state.neoXNetworks[state.neoXNetworkIndex];
    });
  }

  ngOnInit(): void {
    this.tokenData = this.dappEVMState.parseStandardTokenTransactionData(
      this.txParams.data
    );
    console.log(this.tokenData);
  }

  ngOnDestroy(): void {
    this.accountSub?.unsubscribe();
  }

  updateEvmFee($event) {
    this.neoXFeeInfo = $event;
  }

  exit() {
    this.chrome.windowCallback(
      {
        error: ERRORS.CANCELLED,
        return: requestTargetEVM.request,
        ID: this.messageID,
      },
      true
    );
  }

  confirm() {}
}
