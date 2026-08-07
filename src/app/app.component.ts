import { Component } from '@angular/core';
import { STORAGE_NAME } from './popup/_lib';
import { ChromeService, InitService, SettingState } from './core';
import {
  NavigationCancel,
  NavigationEnd,
  NavigationError,
  Router,
  RouterEvent,
} from '@angular/router';

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
    private initService: InitService,
    private router: Router
  ) {
    this.chromeService.getStorage(STORAGE_NAME.lang).subscribe((res) => {
      this.settingState.changLang(res);
    });
    this.chromeService.getStorage(STORAGE_NAME.theme).subscribe((res) => {
      this.settingState.changeTheme(res);
    });
    this.initService.initData().catch(() => {
      // guard 会在导航时按 store 现状降级处理，这里只避免未捕获的 rejection。
      // Guards degrade gracefully on their own; just avoid an unhandled
      // rejection here.
    });
    this.router.events.subscribe((res: RouterEvent) => {
      if (res instanceof NavigationEnd) {
        this.currentUrl = res.url;
      }
      // 取消/出错的导航同样要摘掉启动遮罩，否则用户会一直看到转圈。
      // A cancelled or failed navigation must drop the shell too, otherwise
      // the user is left staring at the spinner.
      if (
        res instanceof NavigationEnd ||
        res instanceof NavigationCancel ||
        res instanceof NavigationError
      ) {
        this.removeStartupShell();
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

  private removeStartupShell(): void {
    const startupShell = document.getElementById('startup-shell');
    if (!startupShell) {
      return;
    }
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => startupShell.remove());
    });
  }
}
