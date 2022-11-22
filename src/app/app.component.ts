import { Component } from '@angular/core';
import { STORAGE_NAME } from './popup/_lib';
import { ChromeService, SettingState, NeonService } from './core';

@Component({
  selector: 'neo-line',
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.scss'],
})
export class AppComponent {
  constructor(
    private chrome: ChromeService,
    private settingState: SettingState,
    private neon: NeonService
  ) {
    this.chrome.getStorage(STORAGE_NAME.lang).subscribe((res) => {
      this.settingState.changLang(res);
    });
    if (localStorage.getItem('theme')) {
      const body = document.getElementsByTagName('body')[0];
      body.setAttribute('data-theme-style', localStorage.getItem('theme'));
    }
    this.neon.initData();
  }
}
