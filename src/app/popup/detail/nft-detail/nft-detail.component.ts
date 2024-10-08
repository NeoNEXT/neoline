import { Component, OnDestroy } from '@angular/core';
import {
  NftState,
  ChromeService,
  EvmNFTState,
  GlobalService,
  UtilServiceState,
} from '@/app/core';
import { ActivatedRoute, Router } from '@angular/router';
import { NftAsset, NftToken } from '@/models/models';
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
  ownerNft: NftToken[];
  previouslyOwnedNft: NftToken[] = [];
  neoXNftsOfAddress: NftAsset[];
  selectedTab: 'tokens' | 'previouslyOwned' | 'transactions' = 'tokens';
  // 菜单
  showMenu = false;

  private accountSub: Unsubscribable;
  private address: string;
  currentNetwork: RpcNetwork;
  currentNetworkIndex: number;
  chainType: ChainType;
  constructor(
    private aRouter: ActivatedRoute,
    private nftState: NftState,
    private router: Router,
    private evmNFTState: EvmNFTState,
    private chrome: ChromeService,
    private global: GlobalService,
    private util: UtilServiceState,
    private store: Store<AppState>
  ) {
    const account$ = this.store.select('account');
    this.accountSub = account$.subscribe((state) => {
      this.chainType = state.currentChainType;
      this.address = state.currentWallet?.accounts[0]?.address;
      switch (this.chainType) {
        case 'Neo3':
          this.currentNetworkIndex = state.n3NetworkIndex;
          this.currentNetwork = state.n3Networks[state.n3NetworkIndex];
          break;
        case 'NeoX':
          this.currentNetworkIndex = state.neoXNetworkIndex;
          this.currentNetwork = state.neoXNetworks[state.neoXNetworkIndex];
          break;
      }
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
        .getNftWatch(
          `${this.chainType}-${this.currentNetwork.id}`,
          this.address
        )
        .subscribe((res) => {
          this.neoXNftsOfAddress = res;
          this.nft = res.find((m) => m.assethash === this.nftContract);
          this.handleToken();
        });
      return;
    }
    this.nftState.getNftTokens(this.address, this.nftContract).then((res) => {
      this.nft = res;
      if (!this.nft) {
        this.chrome
          .getNftWatch(
            `${this.chainType}-${this.currentNetwork.id}`,
            this.address
          )
          .subscribe((res2) => {
            this.nft = res2.find((m) => m.assethash === this.nftContract);
            this.handleToken();
          });
      } else {
        this.handleToken();
      }
    });
  }

  private handleToken() {
    this.ownerNft = this.nft.tokens.filter((item) => item.isOwner !== false);
    this.previouslyOwnedNft = this.nft.tokens.filter(
      (item) => item.isOwner === false
    );
  }

  async sendNFT() {
    if (this.chainType === 'Neo3') {
      this.router.navigateByUrl(
        `/popup/transfer/create/nft/${this.nftContract}`
      );
      return;
    }
    let haveOwnerNFT = false;
    for (let i = 0; i < this.nft.tokens.length; i++) {
      const isOwner = await this.evmNFTState.isNftOwner(
        this.address,
        this.nftContract,
        this.nft.tokens[i].tokenid,
        this.nft.standard
      );
      if (isOwner) {
        haveOwnerNFT = true;
      }
      this.nft.tokens[i].isOwner = isOwner;
    }
    const index = this.neoXNftsOfAddress.findIndex(
      (item) => item.assethash === this.nftContract
    );
    this.handleToken();

    this.neoXNftsOfAddress[index] = this.nft;
    this.chrome.setNftWatch(
      `${this.chainType}-${this.currentNetwork.id}`,
      this.address,
      this.neoXNftsOfAddress
    );
    if (haveOwnerNFT) {
      this.router.navigateByUrl(
        `/popup/transfer/create/nft/${this.nftContract}`
      );
    } else {
      this.global.snackBarTip('The current account does not hold this NFT');
    }
  }

  toWeb() {
    this.showMenu = false;
    this.util.toExplorer({
      chain: this.chainType,
      network: this.currentNetwork,
      networkIndex: this.currentNetworkIndex,
      type: 'NFT',
      value: this.nftContract,
    });
  }
}
