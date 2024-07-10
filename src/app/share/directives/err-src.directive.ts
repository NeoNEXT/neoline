import { Directive, ElementRef, HostListener, Input } from '@angular/core';
import {
  DEFAULT_ASSET_LOGO,
  UNKNOWN_LOGO_URL,
  DEFAULT_NFT_LOGO,
} from '@/app/popup/_lib/setting';

@Directive({
  selector: '[appErrorSrc]',
})
export class ErrSrcDirective {
  constructor(private el: ElementRef) {}

  @Input() appErrorSrc: 'unknown' | 'nft';

  @HostListener('error') onError(e): void {
    if (this.appErrorSrc) {
      switch (this.appErrorSrc) {
        case 'unknown':
          this.el.nativeElement.src = UNKNOWN_LOGO_URL;
          break;
        case 'nft':
          this.el.nativeElement.src = DEFAULT_NFT_LOGO;
          break;
      }
    } else {
      this.el.nativeElement.src = DEFAULT_ASSET_LOGO;
    }
  }
}
