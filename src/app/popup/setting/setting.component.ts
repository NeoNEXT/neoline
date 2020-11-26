import { Component, OnInit } from '@angular/core';
import { MatDialog } from '@angular/material/dialog';

import {
    PopupSelectDialogComponent,
    PopupConfirmDialogComponent,
    PopupAuthorizationListDialogComponent,
} from '@popup/_dialogs';

import {
    ChromeService,
    GlobalService,
    AssetState,
    SettingState,
} from '@app/core';

@Component({
    templateUrl: 'setting.component.html',
    styleUrls: ['setting.component.scss'],
})
export class PopupSettingComponent implements OnInit {
    public lang: string;
    public rateCurrency: string;
    public rateCurrencys: Array<string>;
    public rateTime: number;
    public isDark;

    constructor(
        private chrome: ChromeService,
        private global: GlobalService,
        private asset: AssetState,
        private dialog: MatDialog,
        private setting: SettingState
    ) {
        this.rateCurrencys = this.setting.rateCurrencys;
        this.rateCurrency = this.asset.rateCurrency;
        this.isDark = this.setting.theme === 'dark-theme' ? true : false;
    }

    ngOnInit(): void {
        this.chrome.getLang().subscribe(
            (res) => {
                this.lang = res;
            },
            (err) => {
                this.global.log('get lang setting failed', err);
                this.lang = '';
            }
        );
        this.asset.getRate().subscribe((rateBalance) => {
            const tempRateObj = rateBalance.result;
            if (JSON.stringify(tempRateObj) === '{}') {
                return;
            }
            this.rateTime = tempRateObj && tempRateObj.response_time;
        });
    }

    public language() {
        return this.dialog.open(PopupSelectDialogComponent, {
            data: {
                currentOption: this.lang,
                optionGroup: ['en', 'zh_CN'],
                type: 'lang',
            },
            panelClass: 'custom-dialog-panel',
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
            })
            .afterClosed()
            .subscribe((confirm) => {
                if (confirm) {
                    this.chrome.clearAssetFile();
                    this.asset.clearCache();
                    this.global.snackBarTip('clearSuccess');
                }
            });
    }

    viewAllAuth() {
        this.dialog.open(PopupAuthorizationListDialogComponent, {
            panelClass: 'custom-dialog-panel',
        });
    }

    changeTheme($event) {
        if ($event.checked === true) {
            this.setting.changeTheme('dark-theme');
        } else {
            this.setting.changeTheme('light-theme');
        }
    }
}
