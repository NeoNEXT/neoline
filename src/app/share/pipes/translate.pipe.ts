import { Pipe, PipeTransform } from '@angular/core';
import { map } from 'rxjs/operators';
import { SettingState } from '@/app/core';

@Pipe({
    name: 'translate',
})
export class TranslatePipe implements PipeTransform {
    constructor(private settingState: SettingState) {}

    public transform(value: string) {
        return this.settingState.langSub.pipe(
            map((res) => {
                return this.settingState.langJson[res][value].message;
            })
        );
    }
}
