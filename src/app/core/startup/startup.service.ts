import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { zip } from 'rxjs';
import { catchError } from 'rxjs/operators';
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
      zip(
        this.httpClient.get('_locales/en/messages.json'),
        this.httpClient.get('_locales/zh_CN/messages.json')
      )
        .pipe(
          catchError(([langEnData, langZhData]) => {
            resolve(null);
            return [langEnData, langZhData];
          })
        )
        .subscribe(
          ([langEnData, langZhData]) => {
            this.settingState.langJson['en'] = langEnData;
            this.settingState.langJson['zh_CN'] = langZhData;
          },
          () => {},
          () => {
            resolve(null);
          }
        );
    });
  }
}
