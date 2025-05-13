import { Component, OnInit, OnDestroy } from '@angular/core';
import { ChromeService, SettingState } from '@/app/core';
import { Unsubscribable } from 'rxjs';

@Component({
  templateUrl: 'about.component.html',
  styleUrls: ['about.component.scss'],
})
export class PopupAboutComponent implements OnInit, OnDestroy {
  public version = '';
  links = [
    {
      name: 'PrivacyPolicy',
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
      enUrl: 'https://neoline.io/en',
      zhUrl: 'https://neoline.io/',
    },
    {
      name: 'contactUs',
      enUrl: 'https://t.me/neoline_community',
      zhUrl: 'https://t.me/neoline_community',
    },
    {
      name: 'FollowUs',
      enUrl: 'https://x.com/NEOLine20',
      zhUrl: 'https://x.com/NEOLine20',
    },
  ];
  settingStateSub: Unsubscribable;

  constructor(
    private chrome: ChromeService,
    private settingState: SettingState
  ) {}
  ngOnDestroy(): void {
    this.settingStateSub?.unsubscribe();
  }

  ngOnInit(): void {
    this.version = this.chrome.getVersion();
  }

  public async jumbToWeb(index: number) {
    this.settingStateSub = this.settingState.langSub.subscribe((lang) => {
      if (lang !== 'en') {
        window.open(this.links[index].zhUrl);
      } else {
        window.open(this.links[index].enUrl);
      }
    });
  }
}
