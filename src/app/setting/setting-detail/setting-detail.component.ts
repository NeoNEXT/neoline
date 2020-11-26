import { Component, OnInit } from '@angular/core';
import { MatDialog } from '@angular/material/dialog';
import { PopupConfirmDialogComponent } from '@popup/_dialogs';
import {
    ChromeService,
    GlobalService,
    NeonService,
    AssetState,
    TransactionState,
    SettingState,
} from '@app/core';
import { Router } from '@angular/router';
import { map } from 'rxjs/operators';
@Component({
    templateUrl: './setting-detail.component.html',
    styleUrls: ['./setting-detail.component.scss'],
})
export class SettingDetailComponent implements OnInit {
    public lang = 'zh_CN';
    public viewPrivacy = false;
    public rateCurrency: string;
    public rateCurrencys: Array<string>;
    public rateTime: number;
    public authorizationList = [];

    constructor(
        private router: Router,
        private chrome: ChromeService,
        private global: GlobalService,
        private neon: NeonService,
        private asset: AssetState,
        private dialog: MatDialog,
        private transaction: TransactionState,
        private setting: SettingState
    ) {
        this.rateCurrencys = this.setting.rateCurrencys;
        this.rateCurrency = this.asset.rateCurrency;
    }

    ngOnInit(): void {
        this.chrome.getLang().subscribe(
            (res) => {
                this.lang = res;
            },
            (err) => {
                this.global.log('get lang setting failed', err);
                this.lang = 'en';
            }
        );
        this.asset.getRate().subscribe((rateBalance) => {
            const tempRateObj = rateBalance.result;
            if (JSON.stringify(tempRateObj) === '{}') {
                return;
            }
            this.rateTime = tempRateObj.response_time;
        });
    }
    public save() {
        this.chrome.setLang(this.lang);
        this.global.snackBarTip('langSetSucc');
        location.href = `index.html#setting/detail`;
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

    public changeRateCurrency(currency: string) {
        if (this.rateCurrency !== currency) {
            this.rateCurrency = currency;
            this.asset.changeRateCurrency(this.rateCurrency);
            this.chrome.setRateCurrency(this.rateCurrency);
            this.global.snackBarTip('rateCurrencySetSucc');
        }
    }

    public openPrivacy() {
        this.viewPrivacy = !this.viewPrivacy;
        this.chrome.getAuthorization().subscribe((res) => {
            if (res[this.neon.wallet.accounts[0].address] === undefined) {
                res[this.neon.wallet.accounts[0].address] = [];
            }
            this.chrome.setAuthorization(res);
            this.authorizationList = res[this.neon.wallet.accounts[0].address];
        });
    }

    public delSite(hostname: string) {
        const index = this.authorizationList.findIndex(
            (item) => item.hostname === hostname
        );
        this.authorizationList.splice(index, 1);
        this.chrome.getAuthorization().subscribe((res) => {
            res[this.neon.wallet.accounts[0].address] = this.authorizationList;
            this.chrome.setAuthorization(res);
        });
    }

    public delAllSite() {
        this.dialog
            .open(PopupConfirmDialogComponent, {
                data: 'delAllAuthListConfirm',
                panelClass: 'custom-dialog-panel',
            })
            .afterClosed()
            .subscribe((confirm) => {
                if (confirm) {
                    this.authorizationList = [];
                    this.chrome.getAuthorization().subscribe((res) => {
                        res[this.neon.wallet.accounts[0].address] = [];
                        this.chrome.setAuthorization(res);
                    });
                }
            });
    }
}
