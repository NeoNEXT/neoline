import { Component, OnInit, OnDestroy } from '@angular/core';
import { NftAsset } from '@/models/models';
import { ChromeService, NftState, GlobalService } from '@/app/core';
import { Store } from '@ngrx/store';
import { AppState } from '@/app/reduers';
import { Unsubscribable } from 'rxjs';

@Component({
  templateUrl: 'my-nfts.component.html',
  styleUrls: ['../../add-asset/my-assets/my-assets.component.scss'],
})
export class PopupMyNftsComponent implements OnInit, OnDestroy {
  nfts: NftAsset[];
  watchNfts: NftAsset[];
  public isLoading = false;

  private accountSub: Unsubscribable;
  private address: string;
  private n3NetworkId: number;
  constructor(
    private chrome: ChromeService,
    private nftState: NftState,
    private global: GlobalService,
    private store: Store<AppState>
  ) {
    const account$ = this.store.select('account');
    this.accountSub = account$.subscribe((state) => {
      this.address = state.currentWallet.accounts[0].address;
      this.n3NetworkId = state.n3Networks[state.n3NetworkIndex].id;
      this.getNfts();
    });
  }

  ngOnInit(): void {}

  ngOnDestroy(): void {
    this.accountSub?.unsubscribe();
  }

  getNfts() {
    this.isLoading = true;
    const getWatch = this.chrome
      .getNftWatch(this.n3NetworkId, this.address)
      .toPromise();
    const getNfts = this.nftState.getAddressNfts(this.address);
    Promise.all([getNfts, getWatch]).then((res) => {
      this.watchNfts = res[1];
      const target = [...res[0]];
      res[1].forEach((item) => {
        const index = target.findIndex((m) => m.assethash === item.assethash);
        if (index >= 0) {
          if (item.watching === false) {
            target[index].watching = false;
          }
        } else {
          if (item.watching === true) {
            target.push(item);
          }
        }
      });
      this.nfts = target;
      this.isLoading = false;
    });
  }

  addAsset(index: number) {
    const asset = { ...this.nfts[index], watching: true };
    const i = this.watchNfts.findIndex((m) => m.assethash === asset.assethash);
    if (i >= 0) {
      this.watchNfts[i].watching = true;
    } else {
      this.watchNfts.push(asset);
    }
    this.chrome.setNftWatch(this.n3NetworkId, this.address, this.watchNfts);
    this.nfts[index].watching = true;
    this.global.snackBarTip('addSucc');
  }

  removeAsset(index: number) {
    const asset = { ...this.nfts[index], watching: false };
    const i = this.watchNfts.findIndex((m) => m.assethash === asset.assethash);
    if (i >= 0) {
      this.watchNfts[i].watching = false;
    } else {
      this.watchNfts.push(asset);
    }
    this.chrome.setNftWatch(this.n3NetworkId, this.address, this.watchNfts);
    this.nfts[index].watching = false;
    this.global.snackBarTip('hiddenSucc');
  }
}
