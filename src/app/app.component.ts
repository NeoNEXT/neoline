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
    this.chrome.getStorage(STORAGE_NAME.theme).subscribe((res) => {
      this.settingState.changeTheme(res);
    });
    this.neon.initData();
  }
}
