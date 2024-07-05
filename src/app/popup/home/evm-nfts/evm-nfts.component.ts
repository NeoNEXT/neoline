import { Component, OnInit, OnDestroy } from '@angular/core';
import { GlobalService, ChromeService } from '@/app/core';
import { NftAsset } from '@/models/models';
import { Store } from '@ngrx/store';
import { AppState } from '@/app/reduers';
import { Unsubscribable } from 'rxjs';
import { ChainType, RpcNetwork } from '../../_lib';

@Component({
  selector: 'app-evm-nfts',
  templateUrl: 'evm-nfts.component.html',
  styleUrls: ['../asset-item.scss'],
})
export class PopupEvmNftsComponent implements OnInit, OnDestroy {
  isLoading = false;
  nfts: NftAsset[];

  private accountSub: Unsubscribable;
  private address: string;
  neoXNetwork: RpcNetwork;
  chainType: ChainType;
  constructor(
    public global: GlobalService,
    private chrome: ChromeService,
    private store: Store<AppState>
  ) {}

  ngOnInit(): void {
    const account$ = this.store.select('account');
    this.accountSub = account$.subscribe((state) => {
      this.address = state.currentWallet?.accounts[0]?.address;
      this.chainType = state.currentChainType;
      this.neoXNetwork = state.neoXNetworks[state.neoXNetworkIndex];
      if (state.currentChainType === 'NeoX') {
        this.init();
      }
    });
  }

  ngOnDestroy(): void {
    this.accountSub?.unsubscribe();
  }

  init() {
    this.nfts = [];
    this.isLoading = true;
    this.chrome
      .getNftWatch(`${this.chainType}-${this.neoXNetwork.id}`, this.address)
      .subscribe((watch) => {
        this.nfts = watch;
        this.isLoading = false;
      });
  }
}
