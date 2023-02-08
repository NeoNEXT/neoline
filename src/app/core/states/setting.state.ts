import { Injectable } from '@angular/core';
import { RateCurrencysType } from '@/app/popup/_lib/setting';
import { SelectItem } from '@/app/popup/_lib';
import { BehaviorSubject } from 'rxjs';

@Injectable()
export class SettingState {
  public rateCurrencys: Array<SelectItem> = RateCurrencysType;
  themeSub = new BehaviorSubject<string>('light-theme');
  langSub = new BehaviorSubject<string>('en');
  langJson = { en: undefined, zh_CN: undefined };

  constructor() {}

  changeTheme(theme) {
    this.themeSub.next(theme);
    const body = document.getElementsByTagName('html')[0];
    body.setAttribute('data-theme-style', theme);
  }

  changLang(lang: string) {
    this.langSub.next(lang);
  }
}
