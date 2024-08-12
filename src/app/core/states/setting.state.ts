import { Injectable } from '@angular/core';
import { RateCurrencysType } from '@/app/popup/_lib/setting';
import { SelectItem, STORAGE_NAME } from '@/app/popup/_lib';
import { BehaviorSubject } from 'rxjs';
import { ChromeService } from '../services/chrome.service';

@Injectable()
export class SettingState {
  public rateCurrencys: Array<SelectItem> = RateCurrencysType;
  themeSub = new BehaviorSubject<string>('light-theme');
  langSub = new BehaviorSubject<string>('en');
  langJson = { en: undefined, zh_CN: undefined };

  evmCustomNonceSub = new BehaviorSubject<boolean>(false);

  constructor(private chrome: ChromeService) {
    this.chrome.getStorage(STORAGE_NAME.evmCustomNonce).subscribe((res) => {
      this.changCustomNonce(res, true);
    });
  }

  changeTheme(theme) {
    this.themeSub.next(theme);
    const body = document.getElementsByTagName('html')[0];
    body.setAttribute('data-theme-style', theme);
  }

  changLang(lang: string) {
    this.langSub.next(lang);
  }

  changCustomNonce(custom: boolean, init = false) {
    this.evmCustomNonceSub.next(custom);
    if (!init) {
      this.chrome.setStorage(STORAGE_NAME.evmCustomNonce, custom);
    }
  }
}
