import { Directive, ElementRef } from '@angular/core';
import { SettingState } from '@/app/core';

@Directive({
  selector: 'img[theme]',
})
export class ImgThemeDirective {
  constructor(private el: ElementRef, private settingState: SettingState) {
    this.settingState.themeSub.subscribe((res) => {
      const sourceSrc: string = this.el.nativeElement.src;
      if (res === 'light-theme') {
        this.el.nativeElement.src = sourceSrc.replace(
          'dark-images/',
          'images/'
        );
      }
      if (!sourceSrc.includes('dark-images/') && res === 'dark-theme') {
        this.el.nativeElement.src = sourceSrc.replace(
          'images/',
          'dark-images/'
        );
      }
    });
  }
}
