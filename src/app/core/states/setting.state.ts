import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { HttpService } from '../services/http.service';
import { GlobalService } from '../services/global.service';
import { RateCurrencysType } from '@/app/popup/_lib/setting';
import { SelectItem } from '@/app/popup/_lib';

@Injectable()
export class SettingState {
    public rateCurrencys: Array<SelectItem> = RateCurrencysType;
    public theme = 'light-theme';

    constructor(
        private http: HttpService,
        private global: GlobalService,
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
}
