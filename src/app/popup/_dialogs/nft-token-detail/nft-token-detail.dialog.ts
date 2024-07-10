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

@Component({
  templateUrl: 'nft-token-detail.dialog.html',
  styleUrls: ['nft-token-detail.dialog.scss'],
})
export class PopupNftTokenDetailDialogComponent {
  OPENSEA_ALL_CHAINS = OPENSEA_ALL_CHAINS;
  constructor(
    @Inject(MAT_DIALOG_DATA)
    public data: {
      nftToken: NftToken;
      nftContract: string;
      chainType: ChainType;
      neoXNetwork: RpcNetwork;
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
    if (OPENSEA_TESTNET_CHAINS[this.data.neoXNetwork.chainId]) {
      urlPrefix = 'https://testnets.opensea.io/assets';
      chain = OPENSEA_TESTNET_CHAINS[this.data.neoXNetwork.chainId].value;
    }
    if (OPENSEA_MAINNET_CHAINS[this.data.neoXNetwork.chainId]) {
      urlPrefix = 'https://opensea.io/assets';
      chain = OPENSEA_MAINNET_CHAINS[this.data.neoXNetwork.chainId].value;
    }
    window.open(
      `${urlPrefix}/${chain}/${this.data.nftContract}/${this.data.nftToken.tokenid}`
    );
  }
}
