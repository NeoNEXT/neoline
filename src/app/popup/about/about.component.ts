import { Component, OnInit } from '@angular/core';
import { ChromeService, SettingState } from '@/app/core';

@Component({
  templateUrl: 'about.component.html',
  styleUrls: ['about.component.scss'],
})
export class PopupAboutComponent implements OnInit {
  public version = '';
  constructor(
    private chrome: ChromeService,
    private settingState: SettingState
  ) {}

  ngOnInit(): void {
    this.version = this.chrome.getVersion();
  }

  public async jumbToWeb(type: number) {
    this.settingState.langSub.subscribe((lang) => {
      if (lang !== 'en') {
        lang = '';
      } else {
        lang = '/en';
      }
      switch (type) {
        case 0:
          window.open(`https://neoline.io${lang}/privacy`);
          break;
        case 1:
          window.open(`https://neoline.io${lang}/agreement`);
          break;
        case 2:
          window.open(`https://neoline.io${lang}`);
          break;
        case 3:
          window.open(`mailto:support@neoline.io`);
          break;
      }
    });
  }
}
