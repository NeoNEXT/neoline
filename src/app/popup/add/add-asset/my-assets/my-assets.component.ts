import { Component, OnInit, OnDestroy } from '@angular/core';
import { Asset, NEO, GAS } from '@/models/models';
import { ChromeService, GlobalService, NeoAssetService } from '@/app/core';
import { forkJoin } from 'rxjs';
import { Store } from '@ngrx/store';
import { AppState } from '@/app/reduers';
import { Unsubscribable } from 'rxjs';
import { NEO3_CONTRACT, GAS3_CONTRACT, ChainType } from '../../../_lib';
import { ETH_SOURCE_ASSET_HASH } from '@/app/popup/_lib/evm';

@Component({
  templateUrl: 'my-assets.component.html',
  styleUrls: ['../../my-assets.scss'],
})
export class PopupMyAssetsComponent implements OnDestroy {
  myAssets: Array<Asset> = []; // 所有的资产
  private watch: Asset[] = []; // 用户添加的资产
  private moneyAssets: Asset[] = []; // 有钱的资产
  isLoading = false;

  private accountSub: Unsubscribable;
  networkId: number;
  private address: string;
  chainType: ChainType;
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
      this.initData();
    });
  }

  private initData() {
    const getMoneyBalance = this.neoAssetService.getAddressBalances(
      this.address
    );
    const getWatch = this.chrome.getWatch(
      `${this.chainType}-${this.networkId}`,
      this.address
    );
    forkJoin([getMoneyBalance, getWatch]).subscribe((res) => {
      [this.moneyAssets, this.watch] = [...res];
      const showAssets = [...this.moneyAssets];
      this.watch.forEach((item) => {
        const index = showAssets.findIndex((m) => m.asset_id === item.asset_id);
        if (index >= 0) {
          if (item.watching === false) {
            showAssets[index].watching = false;
          }
        } else {
          if (item.watching === true) {
            showAssets.push(item);
          }
        }
      });
      this.myAssets = showAssets;
    });
  }

  ngOnDestroy(): void {
    this.accountSub?.unsubscribe();
  }

  showOperate(asset: Asset) {
    return [
      NEO,
      GAS,
      NEO3_CONTRACT,
      GAS3_CONTRACT,
      ETH_SOURCE_ASSET_HASH,
    ].indexOf(asset.asset_id) >= 0
      ? false
      : true;
  }

  addAsset(index: number) {
    const asset = { ...this.myAssets[index], watching: true };
    const i = this.watch.findIndex((m) => m.asset_id === asset.asset_id);
    if (i >= 0) {
      this.watch[i].watching = true;
    } else {
      this.watch.push(asset);
    }
    this.chrome.setWatch(
      `${this.chainType}-${this.networkId}`,
      this.address,
      this.watch
    );
    this.myAssets[index].watching = true;
    this.global.snackBarTip('addSucc');
  }

  removeAsset(index: number) {
    const asset = { ...this.myAssets[index], watching: false };
    const i = this.watch.findIndex((m) => m.asset_id === asset.asset_id);
    if (i >= 0) {
      this.watch[i].watching = false;
    } else {
      this.watch.push(asset);
    }
    this.chrome.setWatch(
      `${this.chainType}-${this.networkId}`,
      this.address,
      this.watch
    );
    this.myAssets[index].watching = false;
    this.global.snackBarTip('hiddenSucc');
  }
}
