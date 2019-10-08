import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { HttpService } from '../services/http.service';
import { GlobalService } from '../services/global.service';

@Injectable()
export class SettingState {
    public rateCurrencys = ['USD', 'CNY'];
    public theme = 'light-theme';

    constructor(
        private http: HttpService,
        private global: GlobalService
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
