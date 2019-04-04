import {
    Component,
    OnInit
} from '@angular/core';
import {
    Router
} from '@angular/router';
import {
    MatDialog
} from '@angular/material';

import {
    Balance,
    NEO,
} from '@models/models';

import {
    PopupLanguageDialogComponent,
    PopupClearStorageDialogComponent,
    PopupNameDialogComponent
} from '@popup/_dialogs';

import {
    ChromeService,
    GlobalService,
    NeonService,
    AssetState,
    TransactionState,
    SettingState
} from '@app/core';
import {
    Wallet
} from '@cityofzion/neon-core/lib/wallet';
import {
    PopupConfirmDialogComponent
} from '../_dialogs/confirm/confirm.dialog';
import {
    map
} from 'rxjs/operators';

@Component({
    templateUrl: 'setting.component.html',
    styleUrls: ['setting.component.scss']
})
export class PopupSettingComponent implements OnInit {
    public walletArr: Array<Wallet>;
    public wallet: Wallet;
    public lang: string;
    public rateCurrency: string;
    public rateCurrencys: Array<string>;
    public rateTime: number;

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
        this.walletArr = this.neon.walletArr;
        this.wallet = this.neon.wallet;
        this.rateCurrencys = this.setting.rateCurrencys;
    }

    ngOnInit(): void {
        this.chrome.getLang().subscribe((res) => {
            this.lang = res;
        }, (err) => {
            this.global.log('get lang setting failed', err);
            this.lang = '';
        });
        this.chrome.getRateCurrency().subscribe((rateCurrency) => {
            this.rateCurrency = rateCurrency;
        });
    }

    public detail(w: Wallet) {
        if (this.isActivityWallet(w)) {
            this.router.navigateByUrl('/popup/account');
        } else {
            this.chrome.windowCallback({
                data: {
                    address: this.neon.wallet.accounts[0].address
                },
                target: 'account_changed'
            });
            this.wallet = this.neon.parseWallet(w);
            this.chrome.setWallet(this.wallet.export());
            location.reload();
        }
    }

    public language() {
        return this
            .dialog
            .open(
                PopupLanguageDialogComponent, {
                    width: '170px',
                    data: {
                        currentOption: this.lang,
                        optionGroup: ['en', 'zh_CN'],
                        type: 'lang'
                    }
                }
            );
    }

    public modifyRateCurrency() {
        const tempDialog = this
            .dialog
            .open(
                PopupLanguageDialogComponent, {
                    width: '170px',
                    data: {
                        currentOption: this.rateCurrency,
                        optionGroup: this.rateCurrencys,
                        type: 'currency'
                    }
                }
            );
        tempDialog.afterClosed().subscribe((currency) => {
            if (!currency) {
                return;
            }
            this.rateCurrency = currency;
            this.global.snackBarTip('rateCurrencySetSucc');
        });
    }


    public createWallet() {
        this.router.navigateByUrl('/popup/wallet/create');
    }

    public importWallet() {
        this.router.navigateByUrl('/popup/wallet/import');
    }
    public exportWallet() {
        const sJson = JSON.stringify(this.neon.wallet.export());
        const element = document.createElement('a');
        element.setAttribute('href', 'data:text/json;charset=UTF-8,' + encodeURIComponent(sJson));
        element.setAttribute('download', `${this.neon.wallet.name}.json`);
        element.style.display = 'none';
        document.body.appendChild(element);
        element.click();
        document.body.removeChild(element);
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

    public isActivityWallet(w: Wallet) {
        if (w.accounts[0].address === this.wallet.accounts[0].address) {
            return true;
        } else {
            return false;
        }
    }

    public updateName(w: Wallet) {
        return this
            .dialog
            .open(PopupNameDialogComponent, {
                data: w
            });
    }
    public removeWallet(w: Wallet) {
        this.dialog.open(PopupConfirmDialogComponent, {
            data: 'delWalletConfirm'
        }).afterClosed().subscribe((confirm) => {
            if (confirm) {
                this.neon.delWallet(w).subscribe(res => {
                    if (res) {
                        this.walletArr = this.neon.walletArr;
                        this.wallet = this.neon.wallet;
                        // this.router.navigate(['popup/home'], {
                        //     replaceUrl: true
                        // });
                        location.href = `index.html#popup`;
                    } else {
                        this.walletArr = this.neon.walletArr;
                        this.wallet = this.neon.wallet;
                    }
                });
            }
        });
    }
}
