import { Pipe, PipeTransform } from '@angular/core';
import { Observable, from } from 'rxjs';
import { ChromeService } from '@/app/core/services/chrome.service';
import { GlobalService } from '@/app/core';


@Pipe({
    name: 'translate'
})
export class TranslatePipe implements PipeTransform {
    public messageJson: any = null;
    constructor(
        private chrome: ChromeService,
        private global: GlobalService
    ) {}
    public fetchLocale(): Observable<any> {
        return from(new Promise((resolve, reject) => {
            try {
                this.chrome.getLang().subscribe(res => {
                    fetch(`/_locales/${res}/messages.json`).then(resJson => {
                        return resolve(resJson.json());
                    });
                });
            } catch (e) {
                reject('failed');
            }
        }));
    }
    public transform(value: string): Promise<string> {
        return new Promise( resolve => {
            setTimeout(() => {
                if (this.global.languageJson == null) {
                    try {
                        this.fetchLocale().subscribe((res) => {
                            this.global.languageJson = res;
                            resolve(res[value].message);
                        });
                    } catch (e) {
                    }
                } else {
                    return resolve(this.global.languageJson[value].message);
                }
            }, 0);
        });
    }
}
