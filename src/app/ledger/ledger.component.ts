import { Component, OnInit } from '@angular/core';
import { NeonService, GlobalService } from '@app/core';
import { ChainType, RpcNetwork } from '../popup/_lib';

enum STATUS_ENUM {
  CHAIN_PICK,
  ADDRESS_SELECTOR,
  ACCOUNT_NAME,
  IMPORT_SUCCESS,
}

@Component({
  templateUrl: 'ledger.component.html',
  styleUrls: ['ledger.component.scss'],
})
export class LedgerComponent implements OnInit {
  STATUS_ENUM = STATUS_ENUM;
  status = STATUS_ENUM.CHAIN_PICK;
  chainType: ChainType;
  selectAccountData;

  public address: string;
  public networks: RpcNetwork[];
  public selectedNetworkIndex: number;
  constructor(private neon: NeonService, private global: GlobalService) {
    this.address = this.neon.address;
    this.networks =
      this.neon.currentWalletChainType === 'Neo2'
        ? this.global.n2Networks
        : this.global.n3Networks;
    this.selectedNetworkIndex =
      this.neon.currentWalletChainType === 'Neo2'
        ? this.global.n2SelectedNetworkIndex
        : this.global.n3SelectedNetworkIndex;
  }

  ngOnInit(): void {}

  selectChain(chainType: ChainType) {
    this.chainType = chainType;
    this.status = STATUS_ENUM.ADDRESS_SELECTOR;
  }

  selectAccount(data) {
    this.selectAccountData = data;
    this.status = STATUS_ENUM.ACCOUNT_NAME;
  }
}
