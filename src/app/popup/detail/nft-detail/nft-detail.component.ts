import { Component, OnInit, OnDestroy } from '@angular/core';
import {
  NftState,
  ChromeService,
  EvmNFTState,
  GlobalService,
} from '@/app/core';
import { ActivatedRoute, Router } from '@angular/router';
import { NftAsset, NftToken } from '@/models/models';
import { Store } from '@ngrx/store';
import { AppState } from '@/app/reduers';
import { Unsubscribable } from 'rxjs';
import { ChainType, RpcNetwork } from '../../_lib';
import { MatDialog } from '@angular/material/dialog';
import { PopupAddNetworkDialogComponent } from '../../_dialogs';

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
  private n3Network: RpcNetwork;
  private n3NetworkIndex: number;
  neoXNetwork: RpcNetwork;
  private neoXNetworkIndex: number;
  chainType: ChainType;
  constructor(
    private aRouter: ActivatedRoute,
    private nftState: NftState,
    private router: Router,
    private evmNFTState: EvmNFTState,
    private chrome: ChromeService,
    private global: GlobalService,
    private dialog: MatDialog,
    private store: Store<AppState>
  ) {
    const account$ = this.store.select('account');
    this.accountSub = account$.subscribe((state) => {
      this.chainType = state.currentChainType;
      this.address = state.currentWallet?.accounts[0]?.address;
      this.n3Network = state.n3Networks[state.n3NetworkIndex];
      this.n3NetworkIndex = state.n3NetworkIndex;
      this.neoXNetwork = state.neoXNetworks[state.neoXNetworkIndex];
      this.neoXNetworkIndex = state.neoXNetworkIndex;
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
          .getNftWatch(`${this.chainType}-${this.n3Network.id}`, this.address)
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
      `${this.chainType}-${this.neoXNetwork.id}`,
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
    if (this.chainType === 'Neo3') {
      if (this.n3Network.explorer) {
        window.open(`${this.n3Network.explorer}tokens/nft/${this.nftContract}`);
      } else {
        this.dialog.open(PopupAddNetworkDialogComponent, {
          panelClass: 'custom-dialog-panel',
          backdropClass: 'custom-dialog-backdrop',
          data: {
            addChainType: this.chainType,
            index: this.n3NetworkIndex,
            editNetwork: this.n3Network,
            addExplorer: true,
          },
        });
      }
    } else {
      if (this.neoXNetwork.explorer) {
        window.open(`${this.neoXNetwork.explorer}/address/${this.address}`);
      } else {
        this.dialog.open(PopupAddNetworkDialogComponent, {
          panelClass: 'custom-dialog-panel',
          backdropClass: 'custom-dialog-backdrop',
          data: {
            addChainType: this.chainType,
            index: this.neoXNetworkIndex,
            editNetwork: this.neoXNetwork,
            addExplorer: true,
          },
        });
      }
    }
  }
}
