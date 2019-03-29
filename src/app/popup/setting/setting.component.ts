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
    RateObj
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
    public walletArr: Array < Wallet > ;
    public wallet: Wallet;
    public balance: Balance;
    public lang: string;
    public rateObj: RateObj;
    public rateChannels = [];
    public rateCurrencys: [];
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
    }

    ngOnInit(): void {
        this.asset.detail(NEO).subscribe((res: any) => {
            this.balance = res;
        });

        this.chrome.getLang().subscribe((res) => {
            this.lang = res;
        }, (err) => {
            this.global.log('get lang setting failed', err);
            this.lang = '';
        });
        this.chrome.getRateObj().pipe(map((rateObj: RateObj) => {
            this.rateObj = rateObj;
        })).subscribe(() => {
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
            location.href = `index.html#popup/home`;
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

    public modifyRateChannel() {
        const tempDialog = this
            .dialog
            .open(
                PopupLanguageDialogComponent, {
                    width: '170px',
                    data: {
                        currentOption: this.rateObj.currentChannel,
                        optionGroup: this.rateChannels,
                        type: 'channel'
                    }
                }
            );
        tempDialog.afterClosed().subscribe((channel) => {
            if (!channel) {
                return;
            }
            this.rateObj.currentChannel = channel;
            this.global.snackBarTip('rateChannelSetSucc');
        });
    }

    public modifyRateCurrency() {
        const tempDialog = this
            .dialog
            .open(
                PopupLanguageDialogComponent, {
                    width: '170px',
                    data: {
                        currentOption: this.rateObj.currentCurrency,
                        optionGroup: this.rateCurrencys,
                        type: 'currency'
                    }
                }
            );
        tempDialog.afterClosed().subscribe((currency) => {
            if (!currency) {
                return;
            }
            this.rateObj.currentCurrency = currency;
            this.global.snackBarTip('rateCurrencySetSucc');
        });
    }


    public createAccount() {
        this.router.navigateByUrl('/popup/wallet/create');
    }

    public importAccount() {
        this.router.navigateByUrl('/popup/wallet/import');
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
                        this.router.navigate(['popup/home'], {
                            replaceUrl: true
                        });
                    } else {
                        this.walletArr = this.neon.walletArr;
                        this.wallet = this.neon.wallet;
                    }
                });
            }
        });
    }
}