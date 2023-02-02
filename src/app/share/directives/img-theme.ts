import { Directive, ElementRef } from '@angular/core';

@Directive({
  selector: 'img[theme]',
})
export class ImgThemeDirective {
  constructor(private el: ElementRef) {
    const theme = document
      .getElementsByTagName('html')[0]
      .getAttribute('data-theme-style');
    if (theme === 'dark-theme') {
      this.el.nativeElement.src = this.el.nativeElement.src.replace(
        'images/',
        'dark-images/'
      );
    }
  }
}
