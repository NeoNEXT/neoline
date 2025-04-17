import { Component } from '@angular/core';
import { STORAGE_NAME } from './popup/_lib';
import { ChromeService, SettingState, NeonService } from './core';
import { NavigationEnd, Router, RouterEvent } from '@angular/router';

declare var chrome: any;

@Component({
  selector: 'neo-line',
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.scss'],
})
export class AppComponent {
  private currentUrl = this.router.url;

  constructor(
    private chromeService: ChromeService,
    private settingState: SettingState,
    private neon: NeonService,
    private router: Router
  ) {
    this.chromeService.getStorage(STORAGE_NAME.lang).subscribe((res) => {
      this.settingState.changLang(res);
    });
    this.chromeService.getStorage(STORAGE_NAME.theme).subscribe((res) => {
      this.settingState.changeTheme(res);
    });
    this.neon.initData();
    this.router.events.subscribe((res: RouterEvent) => {
      if (res instanceof NavigationEnd) {
        this.currentUrl = res.url;
      }
    });
    // firefox style
    if (typeof (window as any).InstallTrigger !== 'undefined') {
      document.body.style.width = '375px';
      document.body.style.height = '600px';
      if (chrome.tabs) {
        chrome.tabs.getCurrent((tab) => {
          if (tab) {
            document.body.style.width = '100%';
            document.body.style.height = '100%';
          }
        });
      }
    }
  }

  checkIsThemeBg() {
    if (this.currentUrl.indexOf('/wallet/new-guide') >= 0) {
      return true;
    }
    return false;
  }
}
