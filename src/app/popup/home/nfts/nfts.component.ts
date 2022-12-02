import { Component, OnInit, OnDestroy } from '@angular/core';
import {
  GlobalService,
  NftState,
  NeonService,
  ChromeService,
} from '@/app/core';
import { NftAsset } from '@/models/models';
import { Store } from '@ngrx/store';
import { AppState } from '@/app/reduers';
import { Unsubscribable } from 'rxjs';
import { RpcNetwork } from '../../_lib';

@Component({
  selector: 'app-nfts',
  templateUrl: 'nfts.component.html',
  styleUrls: ['../common.scss'],
})
export class PopupNftsComponent implements OnInit, OnDestroy {
  isLoading = false;
  nfts: NftAsset[];

  private accountSub: Unsubscribable;
  private address: string;
  private n3Network: RpcNetwork;
  constructor(
    public global: GlobalService,
    private nftState: NftState,
    private chrome: ChromeService,
    private store: Store<AppState>
  ) {
    const account$ = this.store.select('account');
    this.accountSub = account$.subscribe((state) => {
      this.address = state.currentWallet.accounts[0].address;
      this.n3Network = state.n3Networks[state.n3NetworkIndex];
      this.init();
    });
  }

  ngOnInit(): void {}

  ngOnDestroy(): void {
    this.accountSub?.unsubscribe();
  }

  init() {
    this.isLoading = true;
    const getWatch = this.chrome
      .getNftWatch(this.n3Network.id, this.address)
      .toPromise();
    const getNfts = this.nftState.getAddressNfts(this.address);
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
