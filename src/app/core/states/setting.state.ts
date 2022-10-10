import { Injectable } from '@angular/core';
import { RateCurrencysType } from '@/app/popup/_lib/setting';
import { SelectItem } from '@/app/popup/_lib';
import { BehaviorSubject } from 'rxjs';

@Injectable()
export class SettingState {
    public rateCurrencys: Array<SelectItem> = RateCurrencysType;
    public theme = 'light-theme';
    langSub = new BehaviorSubject<string>('en');
    langJson = { en: undefined, zh_CN: undefined };

    constructor(
    ) {
        if (localStorage.getItem('theme')) {
            this.theme = localStorage.getItem('theme');
        }
    }

    changeTheme(theme) {
        this.theme = theme;
        localStorage.setItem('theme', theme);
        const body = document.getElementsByTagName('body')[0];
        body.setAttribute('data-theme-style', theme);
    }

    changLang(lang: string) {
        this.langSub.next(lang);
    }
}
