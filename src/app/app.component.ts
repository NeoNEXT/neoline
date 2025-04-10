import { Component } from '@angular/core';
import { STORAGE_NAME } from './popup/_lib';
import { ChromeService, SettingState, NeonService } from './core';
import { NavigationEnd, Router, RouterEvent } from '@angular/router';

@Component({
  selector: 'neo-line',
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.scss'],
})
export class AppComponent {
  private currentUrl = this.router.url;

  constructor(
    private chrome: ChromeService,
    private settingState: SettingState,
    private neon: NeonService,
    private router: Router
  ) {
    this.chrome.getStorage(STORAGE_NAME.lang).subscribe((res) => {
      this.settingState.changLang(res);
    });
    this.chrome.getStorage(STORAGE_NAME.theme).subscribe((res) => {
      this.settingState.changeTheme(res);
    });
    this.neon.initData();
    this.router.events.subscribe((res: RouterEvent) => {
      if (res instanceof NavigationEnd) {
        this.currentUrl = res.url;
      }
    });
  }

  checkIsThemeBg() {
    if (this.currentUrl.indexOf('/wallet/new-guide') >= 0) {
      return true;
    }
    return false;
  }
}
