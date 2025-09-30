import { Component, Inject } from '@angular/core';
import { MatDialogRef, MAT_DIALOG_DATA } from '@angular/material/dialog';
import { ChromeService, SettingState, SelectChainState } from '@app/core';
import { ChainType, SelectItem, STORAGE_NAME } from '@popup/_lib';

@Component({
  templateUrl: 'select.dialog.html',
  styleUrls: ['select.dialog.scss'],
})
export class PopupSelectDialogComponent {
  constructor(
    private dialogRef: MatDialogRef<PopupSelectDialogComponent>,
    private chromeSer: ChromeService,
    private settingState: SettingState,
    private selectChainState: SelectChainState,
    @Inject(MAT_DIALOG_DATA)
    public data: {
      optionGroup: SelectItem[];
      currentOption: string;
      type: 'lang' | 'currency' | 'chain'; // lang, currency
    }
  ) {}

  getTitle() {
    switch (this.data.type) {
      case 'lang':
        return 'language';
      case 'currency':
        return 'currencyUnit';
      case 'chain':
        return 'selectAChain';
    }
  }

  select(option: any) {
    if (this.data.currentOption === option) {
      return;
    }
    switch (this.data.type) {
      case 'lang':
        this.settingState.changLang(option);
        this.chromeSer.setStorage(STORAGE_NAME.lang, option);
        this.dialogRef.close();
        break;
      case 'currency':
        this.dialogRef.close(option);
        break;
      case 'chain':
        this.selectChainState.selectChainType(option as ChainType);
        this.dialogRef.close(option);
    }
  }
}
