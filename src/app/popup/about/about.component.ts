import { Component, OnInit } from '@angular/core';
import { ChromeService, SettingState } from '@/app/core';
import { LinkType } from '../_lib/setting';

@Component({
  templateUrl: 'about.component.html',
  styleUrls: ['about.component.scss'],
})
export class PopupAboutComponent implements OnInit {
  public version = '';
  links: { name: string; linkType: LinkType }[] = [
    {
      name: 'PrivacyPolicy',
      linkType: 'privacy',
    },
    {
      name: 'termsOfUse',
      linkType: 'agreement',
    },
    {
      name: 'companyWebsite',
      linkType: 'companyWebsite',
    },
    {
      name: 'contactUs',
      linkType: 'contactUs',
    },
    {
      name: 'FollowUs',
      linkType: 'followUs',
    },
  ];

  constructor(
    private chrome: ChromeService,
    private settingState: SettingState
  ) {}

  ngOnInit(): void {
    this.version = this.chrome.getVersion();
  }

  jumbToWeb(type: LinkType) {
    this.settingState.toWeb(type);
  }
}
