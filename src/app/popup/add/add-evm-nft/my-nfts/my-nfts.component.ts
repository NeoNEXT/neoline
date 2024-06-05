import { Component, OnDestroy } from '@angular/core';
import { NftAsset } from '@/models/models';
import { ChromeService, GlobalService } from '@/app/core';
import { Store } from '@ngrx/store';
import { AppState } from '@/app/reduers';
import { Unsubscribable } from 'rxjs';
import { ChainType } from '@/app/popup/_lib';

@Component({
  templateUrl: 'my-nfts.component.html',
  styleUrls: ['../../my-assets.scss'],
})
export class PopupMyNftsComponent implements OnDestroy {
  watchNfts: NftAsset[];
  public isLoading = false;

  private accountSub: Unsubscribable;
  private address: string;
  private neoXNetworkId: number;
  private chainType: ChainType;
  constructor(
    private chrome: ChromeService,
    private global: GlobalService,
    private store: Store<AppState>
  ) {
    const account$ = this.store.select('account');
    this.accountSub = account$.subscribe((state) => {
      this.address = state.currentWallet?.accounts[0]?.address;
      this.chainType = state.currentChainType;
      this.neoXNetworkId = state.neoXNetworks[state.neoXNetworkIndex].id;
      this.chrome
        .getNftWatch(`${this.chainType}-${this.neoXNetworkId}`, this.address)
        .subscribe((res) => {
          this.watchNfts = res;
        });
    });
  }

  ngOnDestroy(): void {
    this.accountSub?.unsubscribe();
  }

  addAsset(index: number) {
    this.watchNfts[index].watching = true;
    this.chrome.setNftWatch(
      `${this.chainType}-${this.neoXNetworkId}`,
      this.address,
      this.watchNfts
    );
    this.global.snackBarTip('addSucc');
  }

  removeAsset(index: number) {
    this.watchNfts[index].watching = false;
    this.chrome.setNftWatch(
      `${this.chainType}-${this.neoXNetworkId}`,
      this.address,
      this.watchNfts
    );
    this.global.snackBarTip('hiddenSucc');
  }
}
