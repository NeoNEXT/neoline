import { Directive, ElementRef, HostListener, Input } from '@angular/core';
import { DEFAULT_ASSET_LOGO, UNKNOWN_LOGO_URL } from '@/app/popup/_lib/setting';

@Directive({
  selector: '[appErrorSrc]',
})
export class ErrSrcDirective {
  constructor(private el: ElementRef) {}

  @Input() appErrorSrc: 'unknown';

  @HostListener('error') onError(e): void {
    if (this.appErrorSrc) {
      this.el.nativeElement.src = UNKNOWN_LOGO_URL;
    } else {
      this.el.nativeElement.src = DEFAULT_ASSET_LOGO;
    }
  }
}
