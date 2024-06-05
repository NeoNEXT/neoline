import { Component, OnInit, OnDestroy } from '@angular/core';
import { NftState, ChromeService } from '@/app/core';
import { ActivatedRoute } from '@angular/router';
import { NftAsset } from '@/models/models';
import { Store } from '@ngrx/store';
import { AppState } from '@/app/reduers';
import { Unsubscribable } from 'rxjs';
import { ChainType, RpcNetwork } from '../../_lib';

@Component({
  templateUrl: 'nft-detail.component.html',
  styleUrls: ['nft-detail.component.scss'],
})
export class PopupNftDetailComponent implements OnDestroy {
  nftContract: string;
  nft: NftAsset;
  selectedIndex = 0;
  // 菜单
  showMenu = false;

  private accountSub: Unsubscribable;
  private address: string;
  private n3Network: RpcNetwork;
  private neoXNetwork: RpcNetwork;
  private chainType: ChainType;
  constructor(
    private aRouter: ActivatedRoute,
    private nftState: NftState,
    private chrome: ChromeService,
    private store: Store<AppState>
  ) {
    const account$ = this.store.select('account');
    this.accountSub = account$.subscribe((state) => {
      this.chainType = state.currentChainType;
      this.address = state.currentWallet?.accounts[0]?.address;
      this.n3Network = state.n3Networks[state.n3NetworkIndex];
      this.neoXNetwork = state.neoXNetworks[state.neoXNetworkIndex];
      this.initData();
    });
  }

  initData() {
    this.aRouter.params.subscribe(async (params: any) => {
      this.nftContract = params.contract;
      this.getData();
    });
  }

  ngOnDestroy(): void {
    this.accountSub?.unsubscribe();
  }

  getData() {
    if (this.chainType === 'NeoX') {
      this.chrome
        .getNftWatch(`${this.chainType}-${this.neoXNetwork.id}`, this.address)
        .subscribe((res) => {
          this.nft = res.find((m) => m.assethash === this.nftContract);
        });
      return;
    }
    this.nftState.getNftTokens(this.address, this.nftContract).then((res) => {
      this.nft = res;
      if (!this.nft) {
        this.chrome
          .getNftWatch(`${this.chainType}-${this.n3Network.id}`, this.address)
          .subscribe((res2) => {
            this.nft = res2.find((m) => m.assethash === this.nftContract);
          });
      }
    });
  }

  toWeb() {
    this.showMenu = false;
    if (this.chainType === 'Neo3') {
      if (this.n3Network.explorer) {
        window.open(`${this.n3Network.explorer}tokens/nft/${this.nftContract}`);
      }
    }
  }
}
