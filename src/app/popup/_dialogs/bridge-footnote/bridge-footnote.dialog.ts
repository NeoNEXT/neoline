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
}
