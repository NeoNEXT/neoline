import {
  Component,
  OnInit,
  Output,
  EventEmitter,
  OnDestroy,
} from '@angular/core';
import { Asset, NEO } from '@/models/models';
import { AssetState, ChromeService, SettingState } from '@/app/core';
import { forkJoin } from 'rxjs';
import BigNumber from 'bignumber.js';
import { NEO3_CONTRACT, ChainType, STORAGE_NAME, RpcNetwork } from '../../_lib';
import { Store } from '@ngrx/store';
import { AppState } from '@/app/reduers';
import { Unsubscribable } from 'rxjs';

@Component({
  selector: 'app-assets',
  templateUrl: 'assets.component.html',
  styleUrls: ['../asset-item.scss'],
})
export class PopupAssetsComponent implements OnInit, OnDestroy {
  @Output() backAsset = new EventEmitter();
  rateCurrency: string;
  myAssets: Asset[];
  isLoading = false;

  private accountSub: Unsubscribable;
  private chainType: ChainType;
  private address: string;
  private networkId: number;
  private neoXNetwork: RpcNetwork;
  constructor(
    private asset: AssetState,
    private chrome: ChromeService,
    private settingState: SettingState,
    private store: Store<AppState>
  ) {}

  ngOnInit(): void {
    this.settingState.rateCurrencySub.subscribe((res) => {
      this.rateCurrency = res;
    });
    const account$ = this.store.select('account');
    this.accountSub = account$.subscribe((state) => {
      this.chainType = state.currentChainType;
      this.address = state.currentWallet?.accounts[0]?.address;
      switch (this.chainType) {
        case 'Neo2':
          this.networkId = state.n2Networks[state.n2NetworkIndex].id;
          break;
        case 'Neo3':
          this.networkId = state.n3Networks[state.n3NetworkIndex].id;
          break;
        case 'NeoX':
          this.neoXNetwork = state.neoXNetworks[state.neoXNetworkIndex];
          this.networkId = this.neoXNetwork.id;
          break;
      }
      this.getAssets();
    });
  }

  ngOnDestroy(): void {
    this.accountSub?.unsubscribe();
  }

  getAssets() {
    this.myAssets = [];
    this.isLoading = true;
    const getMoneyBalance = this.asset.getAddressBalances(this.address);
    const getWatch = this.chrome.getWatch(
      `${this.chainType}-${this.networkId}`,
      this.address
    );
    forkJoin([getMoneyBalance, getWatch]).subscribe(async (res) => {
      const [moneyAssets, watch] = [...res];
      const showAssets = [...moneyAssets];
      for (const item of watch) {
        const index = showAssets.findIndex((m) => m.asset_id === item.asset_id);
        if (index >= 0) {
          if (item.watching === false) {
            showAssets.splice(index, 1);
          }
        } else {
          if (item.watching === true) {
            const balance = await this.asset.getAddressAssetBalance(
              this.address,
              item.asset_id,
              this.chainType
            );
            if (new BigNumber(balance).comparedTo(0) > 0) {
              item.balance = new BigNumber(balance)
                .shiftedBy(-item.decimals)
                .toFixed();
            }
            showAssets.push(item);
          }
        }
      }
      this.myAssets = showAssets;
      this.getAssetsRate();
      this.isLoading = false;
    });
  }
  async getAssetsRate() {
    let total = new BigNumber(0);
    for (let i = 0; i < this.myAssets.length; i++) {
      const item = this.myAssets[i];
      item.rateBalance = await this.asset.getAssetAmountRate({
        chainType: this.chainType,
        assetId: item.asset_id,
        chainId:
          this.chainType === 'NeoX' ? this.neoXNetwork.chainId : undefined,
        amount: item.balance,
      });
      if (item.rateBalance) {
        total = total.plus(item.rateBalance);
      }
    }
    this.backAsset.emit(total.toFixed());
  }
}
