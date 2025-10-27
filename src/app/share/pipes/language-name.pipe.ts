import { Pipe, PipeTransform } from '@angular/core';

@Pipe({
  name: 'languageName',
})
export class LanguageNamePipe implements PipeTransform {
  public transform(value: string) {
    switch (value) {
      case 'zh_CN':
        return '简体中文';
      case 'ja':
        return '日本語';
      case 'en':
      default:
        return 'English';
    }
  }
}
