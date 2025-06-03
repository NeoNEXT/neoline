import { Component } from '@angular/core';
import { LOCAL_NOTICE } from '../_lib/setting';

@Component({
  templateUrl: 'notice.component.html',
  styleUrls: ['notice.component.scss'],
})
export class PopupNoticeComponent {
  noticeList = LOCAL_NOTICE;

  constructor() {}
}
