import { Component, OnInit, OnDestroy } from '@angular/core';
import { Asset } from '@/models/models';
import { ChromeService, GlobalService, NeoAssetService } from '@/app/core';
import { Store } from '@ngrx/store';
import { AppState } from '@/app/reduers';
import { Unsubscribable } from 'rxjs';
import { ChainType } from '../../_lib';
@Component({
  templateUrl: 'add-asset.component.html',
  styleUrls: ['../add-asset.scss'],
})
export class PopupAddAssetComponent implements OnDestroy {
  searchAsset: Asset; // Searched asset
  private watch: Asset[] = []; // User-added assets
  private moneyBalance: Asset[] = [];
  isLoading = false;
  searchValue: string = '';

  private accountSub: Unsubscribable;
  private networkId: number;
  private address: string;
  private chainType: ChainType;
  constructor(
    private neoAssetService: NeoAssetService,
    private chrome: ChromeService,
    private global: GlobalService,
    private store: Store<AppState>
  ) {
    const account$ = this.store.select('account');
    this.accountSub = account$.subscribe((state) => {
      this.address = state.currentWallet?.accounts[0]?.address;
      this.chainType = state.currentChainType;
      switch (state.currentChainType) {
        case 'Neo2':
          this.networkId = state.n2Networks[state.n2NetworkIndex].id;
          break;
        case 'Neo3':
          this.networkId = state.n3Networks[state.n3NetworkIndex].id;
          break;
        case 'NeoX':
          this.networkId = state.neoXNetworks[state.neoXNetworkIndex].id;
          break;
      }
      this.neoAssetService
        .getAddressBalances(this.address)
        .then((res) => (this.moneyBalance = res));
      this.chrome
        .getWatch(`${this.chainType}-${this.networkId}`, this.address)
        .subscribe((res) => (this.watch = res));
    });
  }

  ngOnDestroy(): void {
    this.accountSub?.unsubscribe();
  }

  addAsset() {
    this.searchAsset.watching = true;
    const index = this.watch.findIndex(
      (w) => w.asset_id === this.searchAsset.asset_id
    );
    if (index >= 0) {
      this.watch[index].watching = true;
    } else {
      this.watch.push(this.searchAsset);
    }
    this.chrome.setWatch(
      `${this.chainType}-${this.networkId}`,
      this.address,
      this.watch
    );
    this.global.snackBarTip('addSucc');
  }

  searchCurrency() {
    if (!this.searchValue) {
      return;
    }
    this.isLoading = true;
    this.searchAsset = undefined;
    this.neoAssetService
      .searchAsset(this.searchValue)
      .then((res) => {
        this.searchAsset = res;
        const moneyIndex = this.moneyBalance.findIndex(
          (w) =>
            w.asset_id.includes(res.asset_id) ||
            res.asset_id.includes(w.asset_id)
        );
        const index = this.watch.findIndex((w) => w.asset_id === res.asset_id);
        if (index >= 0) {
          this.searchAsset.watching = this.watch[index].watching;
        } else {
          this.searchAsset.watching = moneyIndex >= 0 ? true : false;
        }
        this.isLoading = false;
      })
      .catch(() => {
        this.isLoading = false;
      });
  }
}
