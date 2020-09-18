import { Component, OnInit, AfterContentInit } from '@angular/core';
import { Router } from '@angular/router';
import { NeonService, ChromeService, GlobalService } from '@/app/core';
import { WalletCreation, WalletImport } from '../_lib/models';
import { WalletInitConstant } from '../_lib/constant';
import { FormControl } from '@angular/forms';
import { wallet } from '@cityofzion/neon-js';
import { Wallet } from '@cityofzion/neon-core/lib/wallet';

@Component({
    templateUrl: 'wallet.component.html',
    styleUrls: ['wallet.component.scss']
})

export class PopupWalletComponent implements OnInit, AfterContentInit {
    public createStatus = 'hibernate';
    public importStatus = '';

    public selected = new FormControl(2);
    public wallet: WalletCreation;
    public limit: any;
    public hidePwd: boolean;
    public loading = false;
    public isInit: boolean;

    public importType = '1';
    public walletImport: WalletImport;
    public hideImportPwd: boolean;
    public hideWIF: boolean;
    public isWIF = true;

    public walletNep6Import: WalletImport;
    public nep6File: any;
    public nep6Json: Wallet = null;
    public nep6Name = '';
    public hideNep6Pwd: boolean;

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

        this.walletNep6Import = new WalletImport();
        this.hideNep6Pwd = true;
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
        this.neon
            .createWallet(this.wallet.password, this.wallet.walletName)
            .subscribe(
                (res: any) => {
                    if (this.neon.verifyWallet(res)) {
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
        if (this.importType === '0') {
            if (!wallet.isWIF(this.walletImport.WIF) && !wallet.isPrivateKey(this.walletImport.WIF)) {
                this.isWIF = false;
                return;
            }
            this.loading = true;
            if (wallet.isPrivateKey(this.walletImport.WIF)) {
                this.neon.importPrivateKey(this.walletImport.WIF, this.walletImport.password, this.walletImport.walletName)
                    .subscribe((res: any) => {
                        this.loading = false;
                        if (this.neon.verifyWallet(res)) {
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
        } else {
            if (!wallet.isNEP2(this.walletNep6Import.EncrpytedKey)) {
                return;
            }
            this.loading = true;
            this.neon.importEncryptKey(this.walletNep6Import.EncrpytedKey, this.walletNep6Import.password, this.walletNep6Import.walletName)
                .subscribe((res: any) => {
                    this.loading = false;
                    if (this.neon.verifyWallet(res)) {
                        this.updateLocalWallet(res);
                    } else {
                        this.global.snackBarTip('existingWallet');
                    }
                }, (err: any) => {
                    this.loading = false;
                    this.global.log('import wallet faild', err);
                    this.global.snackBarTip('walletImportFailed', '');
                });
        }

    }

    private updateLocalWallet(data: any) {
        this.neon.pushWIFArray(data.accounts[0].wif);
        this.chrome.setWIFArray(this.neon.WIFArr);
        this.neon.pushWalletArray(data.export());
        this.chrome.setWalletArray(this.neon.getWalletArrayJSON());
        this.chrome.setWallet(data.export());
        this.global.$wallet.next('open');
        this.jumpRouter();
    }

    public onFileSelected(event: any) {
        this.nep6File = event.target.files[0];
        if (this.nep6File) {
            const reader = new FileReader();
            reader.readAsText(this.nep6File, 'UTF-8');
            reader.onload = (evt: any) => {
                this.nep6Json = JSON.parse(evt.target.result);
                if (this.nep6Json.accounts === undefined || this.nep6Json.accounts[0] === undefined
                    || !wallet.isNEP2((this.nep6Json.accounts[0] as any).key || this.nep6Json.name === undefined
                        || this.nep6Json.name === '')) {
                    this.global.snackBarTip('nep6Wrong');
                    this.nep6Json = null;
                    this.nep6Name = '';
                    this.walletNep6Import.walletName = '';
                }
                if (this.nep6Json.name !== undefined) {
                    this.nep6Name = this.nep6Json.name;
                    this.walletNep6Import.walletName = this.nep6Json.name;
                }
                this.walletNep6Import.EncrpytedKey = (this.nep6Json.accounts[0] as any).key;
            };
            reader.onerror = (evt) => {
                console.log('error reading file');
            };
        }
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
