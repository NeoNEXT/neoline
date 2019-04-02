import {
    Component,
    OnInit
} from '@angular/core';
import {
    MatDialog
} from '@angular/material';
import {
    PopupClearStorageDialogComponent,
    PopupConfirmDialogComponent
} from '@popup/_dialogs';
import {
    ChromeService,
    GlobalService,
    NeonService,
    AssetState,
    TransactionState,
    SettingState,
} from '@app/core';
import {
    Router
} from '@angular/router';
import {
    RateObj
} from '@models/models';
import {
    map
} from 'rxjs/operators';
@Component({
    templateUrl: './setting-detail.component.html',
    styleUrls: ['./setting-detail.component.scss']
})
export class SettingDetailComponent implements OnInit {
    public lang = 'zh_CN';
    public viewPrivacy = false;
    public rateObj: RateObj;
    public rateChannels = [];
    public rateCurrencys: [];
    public rateTime: number;
    public authorizationList: object;
    public objectKeys = Object.keys;

    constructor(
        private router: Router,
        private chrome: ChromeService,
        private global: GlobalService,
        private neon: NeonService,
        private asset: AssetState,
        private dialog: MatDialog,
        private transaction: TransactionState,
        private setting: SettingState,
    ) { }

    ngOnInit(): void {
        this.chrome.getLang().subscribe((res) => {
            this.lang = res;
        }, (err) => {
            this.global.log('get lang setting failed', err);
            this.lang = 'zh_CN';
        });
        this.chrome.getRateObj().subscribe((rateObj) => {
            this.rateObj = rateObj;
            this.setting.getRateChannels().subscribe(res => {
                const result = res.result;
                this.rateTime = res.response_time;
                Object.keys(result).forEach((key) => {
                    this.rateChannels.push(key);
                    if (key === this.rateObj.currentChannel) {
                        this.rateCurrencys = result[key].symbol;
                    }
                });
            });
        });
    }
    public save() {
        this.chrome.setLang(this.lang);
        this.global.snackBarTip('langSetSucc');
        location.href = `index.html#setting/detail`;
    }

    public clearCache() {
        this.dialog.open(PopupClearStorageDialogComponent).afterClosed().subscribe((confirm) => {
            if (confirm) {
                this.chrome.clearStorage();
                this.neon.clearCache();
                this.asset.clearCache();
                this.transaction.clearCache();
                this.router.navigateByUrl('popup/wallet/create');
            }
        });
    }

    public changeRateCurrency(currency: string) {
        if (this.rateObj.currentCurrency !== currency) {
            this.rateObj.currentCurrency = currency;
            this.chrome.setRateObj(this.rateObj);
            this.global.snackBarTip('rateCurrencySetSucc');
        }
    }

    public openPrivacy() {
        this.viewPrivacy = !this.viewPrivacy;
        if (this.authorizationList === undefined) {
            this.chrome.getAuthorization().subscribe(res => {
                this.authorizationList = res;
            });
        }
    }

    public delSite(hostname: string) {
        delete this.authorizationList[hostname];
        this.chrome.setAuthorization(this.authorizationList);
    }

    public delAllSite() {
        this.dialog.open(PopupConfirmDialogComponent, {
            data: 'delAllAuthListConfirm'
        }).afterClosed().subscribe((confirm) => {
            if (confirm) {
                this.authorizationList = {};
                this.chrome.setAuthorization(this.authorizationList);
            }
        });
    }
}
