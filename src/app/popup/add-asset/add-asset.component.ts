import { Component, OnInit } from '@angular/core';
import { Asset } from '@/models/models';
import {
  AssetState,
  ChromeService,
  NeonService,
  GlobalService,
} from '@/app/core';
import { MatDialog } from '@angular/material/dialog';

@Component({
  templateUrl: 'add-asset.component.html',
  styleUrls: ['add-asset.component.scss'],
})
export class PopupAddAssetComponent implements OnInit {
  public searchAsset: Asset; // Searched asset
  public watch: Asset[] = []; // User-added assets
  public moneyBalance: Asset[] = [];
  public isLoading = false;
  public searchValue: string = '';

  sourceScrollHeight = 0;

  networkId: number;

  constructor(
    private asset: AssetState,
    private chrome: ChromeService,
    private neon: NeonService,
    private dialog: MatDialog,
    private global: GlobalService
  ) {}

  ngOnInit(): void {
    this.networkId =
      this.neon.currentWalletChainType === 'Neo2'
        ? this.global.n2Network.id
        : this.global.n3Network.id;
    this.asset
      .getAddressBalances(this.neon.address)
      .then((res) => (this.moneyBalance = res));
    this.chrome
      .getWatch(this.networkId, this.neon.address)
      .subscribe((res) => (this.watch = res));
  }

  public addAsset() {
    this.searchAsset.watching = true;
    const index = this.watch.findIndex(
      (w) => w.asset_id === this.searchAsset.asset_id
    );
    if (index >= 0) {
      this.watch[index].watching = true;
    } else {
      this.watch.push(this.searchAsset);
    }
    this.chrome.setWatch(this.networkId, this.neon.address, this.watch);
    this.global.snackBarTip('addSucc');
  }

  public searchCurrency() {
    if (!this.searchValue) {
      return;
    }
    this.isLoading = true;
    this.searchAsset = undefined;
    this.asset
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
