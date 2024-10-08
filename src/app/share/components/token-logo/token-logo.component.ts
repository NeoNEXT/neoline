import { ChainType } from '@/app/popup/_lib';
import { All_CHAIN_TOKENS } from '@/app/popup/_lib/evm';
import { DEFAULT_NFT_LOGO } from '@/app/popup/_lib/setting';
import { Component, Input, OnChanges, SimpleChanges } from '@angular/core';
import { ethers } from 'ethers';

@Component({
  selector: 'token-logo',
  templateUrl: 'token-logo.component.html',
  styleUrls: ['token-logo.component.scss'],
})
export class TokenLogoComponent implements OnChanges {
  DEFAULT_NFT_LOGO = DEFAULT_NFT_LOGO;
  // NFT
  @Input() isNFTContract = false;
  @Input() isNFTToken = false;
  @Input() imageUrl: string;

  // asset
  @Input() assetId: string;
  @Input() chainType: ChainType;
  @Input() customClass?: 'small' | 'big' | 'list' | 'claim';

  // NeoX
  @Input() symbol?: string;
  @Input() neoXChainId?: number;

  neoXTokenLogo = '';
  neoTokenLogo = '';

  constructor() {}

  ngOnChanges(changes: SimpleChanges): void {
    if (
      (changes.assetId &&
        changes.assetId.currentValue != changes.assetId.previousValue) ||
      (changes.chainType &&
        changes.chainType.currentValue != changes.chainType.previousValue) ||
      (changes.neoXChainId &&
        changes.neoXChainId.currentValue != changes.neoXChainId.previousValue)
    ) {
      this.getLogo();
    }
  }

  getLogo() {
    if (this.isNFTContract || this.isNFTToken) {
      return;
    }
    if (this.chainType === 'NeoX') {
      this.checkImgExists(this.imageUrl)
        .then(() => {
          this.neoXTokenLogo = this.imageUrl;
        })
        .catch(() => {
          const checkSumAddress = this.assetId
            ? ethers.getAddress(this.assetId)
            : this.assetId;
          this.neoXTokenLogo =
            All_CHAIN_TOKENS?.[this.neoXChainId]?.[checkSumAddress]?.logo;
        });
    } else {
      const chain = this.chainType.toLowerCase();
      this.neoTokenLogo = `https://cdn.neoline.io/logo/${chain}/${this.assetId}.png`;
    }
  }

  checkImgExists(url: string) {
    return new Promise((resolve, reject) => {
      if (!url) {
        reject('');
      }
      let ImgObj = new Image();
      ImgObj.src = url;
      ImgObj.onload = (res) => {
        resolve(res);
      };
      ImgObj.onerror = (err) => {
        reject(err);
      };
    });
  }
}
