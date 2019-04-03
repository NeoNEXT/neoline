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
    map
} from 'rxjs/operators';
@Component({
    templateUrl: './setting-detail.component.html',
    styleUrls: ['./setting-detail.component.scss']
})
export class SettingDetailComponent implements OnInit {
    public lang = 'zh_CN';
    public viewPrivacy = false;
    public rateCurrency: string;
    public rateCurrencys: Array<string>;
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
    ) {
        this.rateCurrencys = this.setting.rateCurrencys;
    }

    ngOnInit(): void {
        this.chrome.getLang().subscribe((res) => {
            this.lang = res;
        }, (err) => {
            this.global.log('get lang setting failed', err);
            this.lang = 'zh_CN';
        });
        this.chrome.getRateCurrency().subscribe((rateCurrency) => {
            this.rateCurrency = rateCurrency;
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
                this.chrome.clearAssetFile();
                this.asset.clearCache();
                this.transaction.clearCache();
                this.global.snackBarTip('clearSuccess');
            }
        });
    }

    public changeRateCurrency(currency: string) {
        if (this.rateCurrency !== currency) {
            this.rateCurrency = currency;
            this.chrome.setRateCurrency(this.rateCurrency);
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
