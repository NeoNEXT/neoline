import { SettingState } from '@/app/core';
import { Component, Inject } from '@angular/core';
import { MAT_DIALOG_DATA } from '@angular/material/dialog';

@Component({
  templateUrl: 'bridge-footnote.dialog.html',
  styleUrls: ['bridge-footnote.dialog.scss'],
})
export class PopupBridgeFootnoteDialogComponent {
  lang = 'en';

  constructor(
    private settingState: SettingState,
    @Inject(MAT_DIALOG_DATA)
    public bridgeData: {
      used: string;
      total: string;
      percentage: string;
    }
  ) {
    this.settingState.langSub.subscribe((lang) => {
      this.lang = lang;
    });
  }

  toWeb() {
    if (this.lang === 'zh_CN') {
      window.open(
        'https://tutorial.neoline.io/v/cn/neox-qian-bao-de-chuang-jian-he-shi-yong/ru-he-shi-yong-neoline-cha-jian-qian-bao-jin-xing-gas-qiao-jie'
      );
    } else {
      window.open(
        'https://tutorial.neoline.io/create-and-manage-neo-x-wallet/how-to-bridge-gas-using-the-neoline-chrome-extension'
      );
    }
  }
}
