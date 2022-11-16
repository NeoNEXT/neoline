import { Component } from '@angular/core';
import { STORAGE_NAME } from './popup/_lib';
import {
    ChromeService,
    GlobalService,
    NeonService,
    SettingState,
} from './core';

@Component({
    selector: 'neo-line',
    templateUrl: './app.component.html',
    styleUrls: ['./app.component.scss'],
})
export class AppComponent {
    constructor(
        private chrome: ChromeService,
        private global: GlobalService,
        private neon: NeonService,
        private settingState: SettingState
    ) {
        this.chrome.getStorage(STORAGE_NAME.lang).subscribe((res) => {
            this.settingState.changLang(res);
        });
        this.neon.walletIsOpen().subscribe((res) => {
            this.global.$wallet.next(res ? 'open' : 'close');
        });
        if (localStorage.getItem('theme')) {
            const body = document.getElementsByTagName('body')[0];
            body.setAttribute(
                'data-theme-style',
                localStorage.getItem('theme')
            );
        }
    }
}
