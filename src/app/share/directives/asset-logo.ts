import {
  Directive,
  Input,
  HostBinding,
  OnChanges,
  SimpleChanges,
  OnDestroy,
} from '@angular/core';
import { ChainType } from '@/app/popup/_lib';
import { Store } from '@ngrx/store';
import { AppState } from '@/app/reduers';
import { Unsubscribable } from 'rxjs';

@Directive({
  selector: 'img[assetId]',
})
export class AssetLogoDirective implements OnChanges, OnDestroy {
  @Input() public assetId: string;
  @Input() public chain?: ChainType;
  @HostBinding('src') src: string;

  private accountSub: Unsubscribable;
  private currentChainType: ChainType;
  constructor(private store: Store<AppState>) {
    const account$ = this.store.select('account');
    this.accountSub = account$.subscribe((state) => {
      this.currentChainType = state.currentChainType;
    });
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (
      changes.assetId &&
      changes.assetId.currentValue != changes.assetId.previousValue
    ) {
      const assetId = changes.assetId.currentValue as string;
      const chain = this.chain
        ? this.chain.toLowerCase()
        : this.currentChainType.toLowerCase();
      this.src = `https://cdn.neoline.io/logo/${chain}/${assetId}.png`;
    }
  }

  ngOnDestroy(): void {
    this.accountSub?.unsubscribe();
  }
}
