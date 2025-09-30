import { Component, OnInit } from '@angular/core';
import { MatDialog } from '@angular/material/dialog';

import {
  PopupSelectDialogComponent,
  PopupConfirmDialogComponent,
} from '@popup/_dialogs';

import {
  ChromeService,
  GlobalService,
  SettingState,
  RateState,
} from '@app/core';
import { STORAGE_NAME } from '../_lib';
import { LanguagesType, RateCurrencyType } from '../_lib/setting';

@Component({
  templateUrl: 'setting.component.html',
  styleUrls: ['setting.component.scss'],
})
export class PopupSettingComponent implements OnInit {
  public lang: string;
  public rateCurrency: string;
  public rateTime: number;
  public isDark;

  isCustomNonce = false;

  constructor(
    private chrome: ChromeService,
    private global: GlobalService,
    private rateState: RateState,
    private dialog: MatDialog,
    private setting: SettingState
  ) {}

  async ngOnInit(): Promise<void> {
    this.setting.rateCurrencySub.subscribe((res) => {
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
        optionGroup: RateCurrencyType,
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
      this.setting.changRateCurrency(currency);
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
          this.rateState.clearCache();
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
