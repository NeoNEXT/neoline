import { Component, OnInit, AfterContentInit } from '@angular/core';
import {
    trigger,
    state,
    style,
    animate,
    transition
} from '@angular/animations';
import { Router } from '@angular/router';
import { NeonService, ChromeService, GlobalService } from '@/app/core';
import { WalletCreation, WalletImport } from '../_lib/models';
import { WalletInitConstant } from '../_lib/constant';
import { FormControl } from '@angular/forms';
import { wallet } from '@cityofzion/neon-js';

@Component({
    templateUrl: 'wallet.component.html',
    styleUrls: ['wallet.component.scss']
})

export class PopupWalletComponent implements OnInit, AfterContentInit {
    public createStatus = 'hibernate';
    public importStatus = '';

    public havePassword: boolean = false;

    public selected = new FormControl(2);
    public wallet: WalletCreation;
    public limit: any;
    public hidePwd: boolean;
    public loading = false;
    public isInit: boolean;

    public walletImport: WalletImport;
    public hideImportPwd: boolean;
    public hideWIF: boolean;
    public isWIF = true;


    constructor(private router: Router, private neon: NeonService,
        private chrome: ChromeService,
        private global: GlobalService,
    ) {
        this.initOperate(router.url);
        this.hidePwd = true;
        this.wallet = new WalletCreation();
        this.limit = WalletInitConstant;
        this.isInit = true;

        this.walletImport = new WalletImport();
        this.hideImportPwd = true;
        this.hideWIF = true;
        this.havePassword =  this.chrome.getPassword() === '' || this.chrome.getPassword() === null
        || this.chrome.getPassword() === undefined;
    }

    ngAfterContentInit(): void {
        setTimeout(() => {
            this.isInit = false;
        });
    }

    public initOperate(url: string) {
        const urlParse = url.split('/');
        if (urlParse.length === 3) {
            this.createStatus = '';
            this.importStatus = 'hibernate';
            this.selected.setValue(0)
        } else {
            this.selected.setValue(urlParse[3] === 'import' ? 1 : 0)
        }
    }

    public togglePwd(): void {
        this.hidePwd = !this.hidePwd;
    }

    public toggleImportPwd(): void {
        this.hideImportPwd = !this.hideImportPwd;
    }

    public toggleWIF(): void {
        this.hideWIF = !this.hideWIF;
    }

    public submitCreate(): void {
        this.loading = true;
        const password = this.chrome.getPassword() === null ? this.wallet.password : this.chrome.getPassword();
        this.neon
            .createWallet(password, this.wallet.walletName)
            .subscribe(
                (res: any) => {
                    if (this.neon.verifyWallet(res)) {
                        if(this.neon.getWalletArrayJSON().length === 0) {
                            this.global.createHash(this.wallet.password);
                        }
                        this.updateLocalWallet(res)
                    } else {
                        this.global.snackBarTip('existingWallet');
                        this.loading = false;
                    }
                },
                (err: any) => {
                    this.loading = false;
                    this.global.log('create wallet faild', err);
                    this.global.snackBarTip('walletCreateFailed');
                });
    }

    public submitImport(): void {
        if (!wallet.isWIF(this.walletImport.WIF) && !wallet.isPrivateKey(this.walletImport.WIF)) {
            this.isWIF = false;
            return;
        }
        this.loading = true;

        const password = this.chrome.getPassword() === null ? this.wallet.password : this.chrome.getPassword();
        if (wallet.isPrivateKey(this.walletImport.WIF)) {
            this.neon.importPrivateKey(this.walletImport.WIF, this.walletImport.password, this.walletImport.walletName)
                .subscribe((res: any) => {
                    this.loading = false;
                    if (this.neon.verifyWallet(res)) {
                        if(this.neon.getWalletArrayJSON().length === 0) {
                            this.global.createHash(this.wallet.password);
                        }
                        this.updateLocalWallet(res);
                    } else {
                        this.global.snackBarTip('existingWallet');
                    }
                });
        } else {
            this.neon
                .importWIF(this.walletImport.WIF, this.walletImport.password, this.walletImport.walletName)
                .subscribe(
                    (res: any) => {
                        this.loading = false;
                        if (this.neon.verifyWallet(res)) {
                            if(this.neon.getWalletArrayJSON().length === 0) {
                                this.global.createHash(this.wallet.password);
                            }
                            this.updateLocalWallet(res);
                        } else {
                            this.global.snackBarTip('existingWallet');
                        }
                    },
                    (err: any) => {
                        this.global.log('import wallet faild', err);
                        this.global.snackBarTip('walletImportFailed');
                        this.loading = false;
                    });
        }
    }

    private updateLocalWallet(data: any) {
        this.neon.pushWalletArray(data.export());
        this.chrome.setWalletArray(this.neon.getWalletArrayJSON());
        this.chrome.setWallet(data.export());
        this.global.$wallet.next('open');
        this.jumpRouter();
    }

    private jumpRouter() {
        this.chrome.getHistory().subscribe((history) => {
            if (history != null) {
                if (history.indexOf('notification') > -1) {
                    this.chrome.setHistory('');
                    this.router.navigateByUrl(history);
                } else {
                    this.chrome.setHistory('');
                    location.href = `index.html#popup`;
                }
            } else {
                this.chrome.setHistory('');
                location.href = `index.html#popup`;
            }
        }, (err) => {
            this.chrome.setHistory('');
            location.href = `index.html#popup`;
        });
    }

    public cancel() {
        history.go(-1);
    }

    ngOnInit(): void { }
}
