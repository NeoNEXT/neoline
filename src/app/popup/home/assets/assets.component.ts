import {
  Component,
  OnInit,
  Output,
  EventEmitter,
  OnDestroy,
} from '@angular/core';
import { Asset, NEO } from '@/models/models';
import { AssetState, ChromeService, UtilServiceState } from '@/app/core';
import { forkJoin } from 'rxjs';
import BigNumber from 'bignumber.js';
import { NEO3_CONTRACT, ChainType, STORAGE_NAME } from '../../_lib';
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
  constructor(
    private asset: AssetState,
    private chrome: ChromeService,
    private util: UtilServiceState,
    private store: Store<AppState>
  ) {}

  ngOnInit(): void {
    this.chrome.getStorage(STORAGE_NAME.rateCurrency).subscribe((res) => {
      this.rateCurrency = res;
    });
    const account$ = this.store.select('account');
    this.accountSub = account$.subscribe((state) => {
      this.chainType = state.currentChainType;
      this.address = state.currentWallet?.accounts[0]?.address;
      const network =
        this.chainType === 'Neo2'
          ? state.n2Networks[state.n2NetworkIndex]
          : state.n3Networks[state.n3NetworkIndex];
      this.networkId = network.id;
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
    const getWatch = this.chrome.getWatch(this.networkId, this.address);
    forkJoin([getMoneyBalance, getWatch]).subscribe((res) => {
      const [moneyAssets, watch] = [...res];
      const showAssets = [...moneyAssets];
      watch.forEach(async (item) => {
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
              const decimals = await this.util.getAssetDecimals(
                [item.asset_id],
                this.chainType
              );
              item.balance = new BigNumber(balance)
                .shiftedBy(-decimals[0])
                .toFixed();
            }
            showAssets.push(item);
          }
        }
      });
      this.myAssets = showAssets;
      this.getAssetsRate();
      let neoAsset;
      if (this.chainType === 'Neo2') {
        neoAsset = this.myAssets.find((m) => m.asset_id === NEO);
      } else {
        neoAsset = this.myAssets.find((m) => m.asset_id === NEO3_CONTRACT);
      }
      this.backAsset.emit(neoAsset);
      this.isLoading = false;
    });
  }
  async getAssetsRate() {
    for (let i = 0; i < this.myAssets.length; i++) {
      const item = this.myAssets[i];
      if (new BigNumber(item.balance).comparedTo(0) > 0) {
        const rate = await this.asset.getAssetRate(item.symbol, item.asset_id);
        if (rate) {
          item.rateBalance = new BigNumber(item.balance).times(rate).toFixed();
        }
      }
    }
  }
}
