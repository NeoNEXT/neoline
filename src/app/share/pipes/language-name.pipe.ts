import { Pipe, PipeTransform } from '@angular/core';

@Pipe({
    name: 'languageName'
})
export class LanguageNamePipe implements PipeTransform {
    public transform(value: string) {
        switch (value) {
            case 'en':
                return 'English';
            case 'zh_CN':
                return '简体中文';
        }
    }
}
