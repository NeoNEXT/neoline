import { Component, OnInit } from '@angular/core';
import { ChromeService, SettingState } from '@/app/core';

@Component({
  templateUrl: 'about.component.html',
  styleUrls: ['about.component.scss'],
})
export class PopupAboutComponent implements OnInit {
  public version = '';
  links = [
    {
      name: 'privacyPolicy',
      enUrl: 'https://neoline.io/en/privacy',
      zhUrl: 'https://neoline.io/privacy',
    },
    {
      name: 'termsOfUse',
      enUrl: 'https://neoline.io/en/agreement',
      zhUrl: 'https://neoline.io/agreement',
    },
    {
      name: 'companyWebsite',
      enUrl: 'https://neoline.io/',
      zhUrl: 'https://neoline.io/en',
    },
    {
      name: 'contactUs',
      enUrl: 'mailto:support@neoline.io',
      zhUrl: 'mailto:support@neoline.io',
    },
  ];
  constructor(
    private chrome: ChromeService,
    private settingState: SettingState
  ) {}

  ngOnInit(): void {
    this.version = this.chrome.getVersion();
  }

  public async jumbToWeb(index: number) {
    this.settingState.langSub.subscribe((lang) => {
      if (lang !== 'en') {
        window.open(this.links[index].enUrl);
      } else {
        window.open(this.links[index].zhUrl);
      }
    });
  }
}
