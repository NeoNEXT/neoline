import { Pipe, PipeTransform } from '@angular/core';
import { map } from 'rxjs/operators';
import { SettingState } from '@app/core/states/setting.state';
import * as Sentry from '@sentry/angular';

@Pipe({
  name: 'translate',
})
export class TranslatePipe implements PipeTransform {
  constructor(private settingState: SettingState) {}

  public transform(value: string, params: { [key: string]: string }) {
    return this.settingState.langSub.pipe(
      map((res) => {
        let source: string = this.settingState.langJson[res]?.[value]?.message;
        if (!source) {
          Sentry.captureException({
            error: 'Translate pipe error, message not found',
            value,
            params,
          });
          return value;
        }
        if (params) {
          Object.keys(params).forEach((key) => {
            const pattern = new RegExp(`\{\{${key}\}\}`, 'g');
            source = source.replace(pattern, params[key] || '');
          });
        }
        return source;
      })
    );
  }
}
