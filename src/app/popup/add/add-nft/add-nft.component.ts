import { Component, OnInit, OnDestroy } from '@angular/core';
import { ChromeService, GlobalService, NeoNFTService } from '@/app/core';
import { NftAsset } from '@/models/models';
import { Store } from '@ngrx/store';
import { AppState } from '@/app/reduers';
import { Unsubscribable } from 'rxjs';
import { ChainType } from '../../_lib';

@Component({
  templateUrl: 'add-nft.component.html',
  styleUrls: ['../add-asset.scss'],
})
export class PopupAddNftComponent implements OnDestroy {
  public watch: NftAsset[] = []; // 用户添加的资产
  private moneyNft: NftAsset[] = [];

  public isLoading = false;
  public searchValue: string = '';
  public searchNft;

  private accountSub: Unsubscribable;
  private address: string;
  private n3NetworkId: number;
  private chainType: ChainType;
  constructor(
    private neoNFTService: NeoNFTService,
    private chrome: ChromeService,
    private global: GlobalService,
    private store: Store<AppState>
  ) {
    const account$ = this.store.select('account');
    this.accountSub = account$.subscribe((state) => {
      this.address = state.currentWallet?.accounts[0]?.address;
      this.chainType = state.currentChainType;
      this.n3NetworkId = state.n3Networks[state.n3NetworkIndex].id;
      this.chrome
        .getNftWatch(`${this.chainType}-${this.n3NetworkId}`, this.address)
        .subscribe((res) => {
          this.watch = res;
        });
      this.neoNFTService
        .getAddressNfts(this.address)
        .then((res) => (this.moneyNft = res));
    });
  }

  ngOnDestroy(): void {
    this.accountSub?.unsubscribe();
  }

  public searchCurrency() {
    this.isLoading = true;
    this.neoNFTService.searchNft(this.searchValue).then(
      (res) => {
        this.searchNft = res;
        const moneyIndex = this.moneyNft.findIndex(
          (w) =>
            w.assethash.includes(res.assethash) ||
            res.assethash.includes(w.assethash)
        );
        const index = this.watch.findIndex(
          (item) => item.assethash === res.assethash
        );
        if (index >= 0) {
          this.searchNft.watching = this.watch[index].watching;
        } else {
          this.searchNft.watching = moneyIndex >= 0 ? true : false;
        }
        this.isLoading = false;
      },
      () => {
        this.searchNft = {};
        this.isLoading = false;
      }
    );
  }

  addNft() {
    this.searchNft.watching = true;
    const index = this.watch.findIndex(
      (w) => w.assethash === this.searchNft.assethash
    );
    if (index >= 0) {
      this.watch[index].watching = true;
    } else {
      this.watch.push(this.searchNft);
    }
    this.chrome.setNftWatch(
      `${this.chainType}-${this.n3NetworkId}`,
      this.address,
      this.watch
    );
    this.global.snackBarTip('addSucc');
  }
}
