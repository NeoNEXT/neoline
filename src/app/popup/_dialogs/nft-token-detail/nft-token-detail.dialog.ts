import { Component, Inject } from '@angular/core';
import { MAT_DIALOG_DATA } from '@angular/material/dialog';
import { NftToken } from '@/models/models';
import {
  OPENSEA_MAINNET_CHAINS,
  OPENSEA_TESTNET_CHAINS,
  OPENSEA_ALL_CHAINS,
  RpcNetwork,
  ChainType,
} from '../../_lib';
import { GlobalService } from '@/app/core';

@Component({
  templateUrl: 'nft-token-detail.dialog.html',
  styleUrls: ['nft-token-detail.dialog.scss'],
})
export class PopupNftTokenDetailDialogComponent {
  OPENSEA_ALL_CHAINS = OPENSEA_ALL_CHAINS;
  constructor(
    private global: GlobalService,
    @Inject(MAT_DIALOG_DATA)
    public data: {
      nftToken: NftToken;
      nftContract: string;
      chainType: ChainType;
      network: RpcNetwork;
      networkIndex: number;
    }
  ) {}

  openImg(url: string) {
    if (url.startsWith('data:')) {
      const w = window.open('about:blank');
      const image = new Image();
      image.src = url;
      setTimeout(function () {
        w.document.getElementsByTagName('body')[0].innerHTML = image.outerHTML;
      }, 0);
    } else {
      window.open(url);
    }
  }

  toNftMarket() {
    let urlPrefix: string;
    let chain: string;
    if (OPENSEA_TESTNET_CHAINS[this.data.network.chainId]) {
      urlPrefix = 'https://testnets.opensea.io/assets';
      chain = OPENSEA_TESTNET_CHAINS[this.data.network.chainId].value;
    }
    if (OPENSEA_MAINNET_CHAINS[this.data.network.chainId]) {
      urlPrefix = 'https://opensea.io/assets';
      chain = OPENSEA_MAINNET_CHAINS[this.data.network.chainId].value;
    }
    if (urlPrefix && chain) {
      window.open(
        `${urlPrefix}/${chain}/${this.data.nftContract}/${this.data.nftToken.tokenid}`
      );
    }
  }

  toWeb(contract: string) {
    this.global.toExplorer({
      chain: this.data.chainType,
      network: this.data.network,
      networkIndex: this.data.networkIndex,
      type: 'NFT',
      value: contract,
    });
  }
}
