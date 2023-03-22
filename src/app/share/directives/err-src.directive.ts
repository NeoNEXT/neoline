import { Directive, ElementRef, HostListener, Input } from '@angular/core';
import { DEFAULT_ASSET_LOGO } from '@/app/popup/_lib/setting';

@Directive({
  selector: '[appErrorSrc]',
})
export class ErrSrcDirective {
  constructor(private el: ElementRef) {}

  @Input('appErrorSrc') errorSrc: string;

  @HostListener('error') onError(e): void {
    this.el.nativeElement.src = this.errorSrc || DEFAULT_ASSET_LOGO;
  }
}
