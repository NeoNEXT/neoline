import { Component, OnInit } from '@angular/core';
import { MatDialog } from '@angular/material/dialog';

import {
  PopupSelectDialogComponent,
  PopupConfirmDialogComponent,
} from '@popup/_dialogs';

import {
  ChromeService,
  GlobalService,
  AssetState,
  SettingState,
} from '@app/core';
import { SelectItem, STORAGE_NAME } from '../_lib';
import { LanguagesType } from '../_lib/setting';

@Component({
  templateUrl: 'setting.component.html',
  styleUrls: ['setting.component.scss'],
})
export class PopupSettingComponent implements OnInit {
  public lang: string;
  public rateCurrency: string;
  public rateCurrencys: Array<SelectItem>;
  public rateTime: number;
  public isDark;

  isCustomNonce = false;

  constructor(
    private chrome: ChromeService,
    private global: GlobalService,
    private asset: AssetState,
    private dialog: MatDialog,
    private setting: SettingState
  ) {
    this.rateCurrencys = this.setting.rateCurrencys;
  }

  async ngOnInit(): Promise<void> {
    this.chrome.getStorage(STORAGE_NAME.rateCurrency).subscribe((res) => {
      this.rateCurrency = res;
    });
    this.setting.langSub.subscribe((res) => {
      this.lang = res;
    });
    this.setting.themeSub.subscribe((res) => {
      this.isDark = res === 'dark-theme' ? true : false;
    });
    this.setting.evmCustomNonceSub.subscribe((res) => {
      this.isCustomNonce = res;
    });
  }

  public language() {
    return this.dialog.open(PopupSelectDialogComponent, {
      data: {
        currentOption: this.lang,
        optionGroup: LanguagesType,
        type: 'lang',
      },
      panelClass: 'custom-dialog-panel',
      backdropClass: 'custom-dialog-backdrop',
    });
  }

  public modifyRateCurrency() {
    const tempDialog = this.dialog.open(PopupSelectDialogComponent, {
      data: {
        currentOption: this.rateCurrency,
        optionGroup: this.rateCurrencys,
        type: 'currency',
      },
      panelClass: 'custom-dialog-panel',
      backdropClass: 'custom-dialog-backdrop',
    });
    tempDialog.afterClosed().subscribe((currency) => {
      if (!currency) {
        return;
      }
      this.rateCurrency = currency;
      this.global.snackBarTip('rateCurrencySetSucc');
    });
  }

  public clearCache() {
    this.dialog
      .open(PopupConfirmDialogComponent, {
        data: 'clearStorageTips',
        panelClass: 'custom-dialog-panel',
        backdropClass: 'custom-dialog-backdrop',
      })
      .afterClosed()
      .subscribe((confirm) => {
        if (confirm) {
          this.asset.clearCache();
          this.global.snackBarTip('clearSuccess');
        }
      });
  }

  changeTheme() {
    this.isDark = !this.isDark;
    const newTheme = this.isDark ? 'dark-theme' : 'light-theme';
    this.chrome.setStorage(STORAGE_NAME.theme, newTheme);
    this.setting.changeTheme(newTheme);
  }

  changeCustomNonce() {
    this.isCustomNonce = !this.isCustomNonce;
    this.setting.changCustomNonce(this.isCustomNonce);
  }
}
