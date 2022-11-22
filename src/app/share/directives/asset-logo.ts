import {
  Directive,
  Input,
  HostBinding,
  OnChanges,
  SimpleChanges,
} from '@angular/core';
import { NeonService } from '@app/core';
import { ChainType } from '@/app/popup/_lib';

@Directive({
  selector: 'img[assetId]',
})
export class AssetLogoDirective implements OnChanges {
  @Input() public assetId: string;
  @Input() public chain?: ChainType;
  @HostBinding('src') src: string;

  constructor(private neon: NeonService) {}

  ngOnChanges(changes: SimpleChanges): void {
    if (
      changes.assetId &&
      changes.assetId.currentValue != changes.assetId.previousValue
    ) {
      const assetId = changes.assetId.currentValue as string;
      const chain = this.chain
        ? this.chain.toLowerCase()
        : this.neon.currentWalletChainType.toLowerCase();
      this.src = `https://cdn.neoline.io/logo/${chain}/${assetId}.png`;
    }
  }
}
