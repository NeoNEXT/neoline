import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { SettingState } from '../states/setting.state';

@Injectable()
export class StartupService {
  constructor(
    private httpClient: HttpClient,
    private settingState: SettingState
  ) {}

  load(): Promise<any> {
    // only works with promises
    // https://github.com/angular/angular/issues/15088
    return new Promise((resolve) => {
      this.httpClient.get('_locales/i18n.json').subscribe(
        (langData) => {
          this.settingState.langJson = langData;
        },
        () => {},
        () => {
          resolve(null);
        }
      );
    });
  }
}
