import { Component, OnInit, OnDestroy } from '@angular/core';
import { GlobalService, NeoNFTService, ChromeService } from '@/app/core';
import { NftAsset } from '@/models/models';
import { Store } from '@ngrx/store';
import { AppState } from '@/app/reduers';
import { Unsubscribable } from 'rxjs';
import { ChainType, RpcNetwork } from '../../_lib';

@Component({
  selector: 'app-nfts',
  templateUrl: 'nfts.component.html',
  styleUrls: ['../asset-item.scss'],
})
export class PopupNftsComponent implements OnInit, OnDestroy {
  isLoading = false;
  nfts: NftAsset[];

  private accountSub: Unsubscribable;
  private address: string;
  private n3Network: RpcNetwork;
  private chainType: ChainType;
  constructor(
    public global: GlobalService,
    private neoNFTService: NeoNFTService,
    private chrome: ChromeService,
    private store: Store<AppState>
  ) {}

  ngOnInit(): void {
    const account$ = this.store.select('account');
    this.accountSub = account$.subscribe((state) => {
      this.address = state.currentWallet?.accounts[0]?.address;
      this.chainType = state.currentChainType;
      this.n3Network = state.n3Networks[state.n3NetworkIndex];
      if (state.currentChainType === 'Neo3') {
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
    const getWatch = this.chrome
      .getNftWatch(`${this.chainType}-${this.n3Network.id}`, this.address)
      .toPromise();
    const getNfts = this.neoNFTService.getAddressNfts(this.address);
    Promise.all([getNfts, getWatch]).then(([moneyAssets, watch]) => {
      let showAssets = [...moneyAssets];
      watch.forEach((item) => {
        const index = showAssets.findIndex(
          (m) => m.assethash === item.assethash
        );
        if (index >= 0) {
          if (item.watching === false) {
            showAssets.splice(index, 1);
          }
        } else {
          if (item.watching === true) {
            showAssets.push(item);
          }
        }
      });
      this.nfts = showAssets;
      this.isLoading = false;
    });
  }
}
