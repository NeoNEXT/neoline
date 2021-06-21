import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { HttpService } from '../services/http.service';
import { GlobalService } from '../services/global.service';
import { WalletInitConstant, DevWalletInitConstant } from '@popup/_lib';
import { ChromeService } from '../services/chrome.service';

@Injectable()
export class SettingState {
    public rateCurrencys = ['USD', 'CNY'];
    public theme = 'light-theme';
    public disableShortPassword;

    constructor(
        private http: HttpService,
        private global: GlobalService,
        private chromeService: ChromeService
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

    async getDisableShortPassword() {
        if (this.disableShortPassword !== undefined) {
            return this.disableShortPassword;
        }
        const localDisableShortPassword = await this.chromeService.getDisableShortPassword();
        this.disableShortPassword = localDisableShortPassword === 'false' ? false : true;
        return this.disableShortPassword;
    }

    changeDisableShortPassword(disableShortPassword: boolean) {
        this.disableShortPassword = disableShortPassword;
        this.chromeService.setDisableShortPassword(String(disableShortPassword));
    }

    async getWalletInitConstant() {
        const disableShortPassword = await this.getDisableShortPassword();
        if (disableShortPassword === false) {
            return DevWalletInitConstant;
        }
        return WalletInitConstant;
    }
}
