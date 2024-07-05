import { ChainType } from '@/app/popup/_lib';
import { EVM_TOKEN_IMAGE_URL } from '@/app/popup/_lib/evm';
import { Component, Input, OnChanges, SimpleChanges } from '@angular/core';

@Component({
  selector: 'token-logo',
  templateUrl: 'token-logo.component.html',
  styleUrls: ['token-logo.component.scss'],
})
export class TokenLogoComponent implements OnChanges {
  // NFT
  @Input() isNFT = false;
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
    if (this.isNFT) {
      return;
    }
    if (this.chainType === 'NeoX') {
      this.neoXTokenLogo =
        EVM_TOKEN_IMAGE_URL?.[this.neoXChainId]?.[this.assetId];
    } else {
      const chain = this.chainType.toLowerCase();
      this.neoTokenLogo = `https://cdn.neoline.io/logo/${chain}/${this.assetId}.png`;
    }
  }
}
