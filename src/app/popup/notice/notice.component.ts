import { SettingState } from '@/app/core';
import { Component, OnInit } from '@angular/core';
import { LOCAL_NOTICE } from '../_lib/setting';

@Component({
  templateUrl: 'notice.component.html',
  styleUrls: ['notice.component.scss'],
})
export class PopupNoticeComponent implements OnInit {
  noticeList = LOCAL_NOTICE;
  lang = 'en';

  constructor(private setting: SettingState) {}

  ngOnInit(): void {
    this.setting.langSub.subscribe((res) => {
      this.lang = res;
    });
  }
}
