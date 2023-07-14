import { Component, OnInit, OnDestroy } from '@angular/core';
import { ChainType, RpcNetwork } from '../popup/_lib';
import { Store } from '@ngrx/store';
import { AppState } from '@/app/reduers';
import { Unsubscribable } from 'rxjs';

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
export class LedgerComponent implements OnDestroy {
  STATUS_ENUM = STATUS_ENUM;
  status = STATUS_ENUM.CHAIN_PICK;
  chainType: ChainType;
  selectAccountData;

  private accountSub: Unsubscribable;
  public address: string;
  public networks: RpcNetwork[];
  public selectedNetworkIndex: number;
  constructor(private store: Store<AppState>) {
    const account$ = this.store.select('account');
    this.accountSub = account$.subscribe((state) => {
      const chain = state.currentChainType;
      this.address = state.currentWallet?.accounts[0]?.address;
      this.networks = chain === 'Neo2' ? state.n2Networks : state.n3Networks;
      this.selectedNetworkIndex =
        chain === 'Neo2' ? state.n2NetworkIndex : state.n3NetworkIndex;
    });
  }

  ngOnDestroy(): void {
    this.accountSub?.unsubscribe();
  }

  selectChain(chainType: ChainType) {
    this.chainType = chainType;
    this.status = STATUS_ENUM.ADDRESS_SELECTOR;
  }

  selectAccount(data) {
    this.selectAccountData = data;
    this.status = STATUS_ENUM.ACCOUNT_NAME;
  }
}
