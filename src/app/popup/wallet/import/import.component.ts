import {
    Component,
    OnInit,
    AfterViewInit
} from '@angular/core';
import {
    Router
} from '@angular/router';

import {
    ChromeService,
    NeonService,
    GlobalService
} from '@app/core';

import {
    WalletInitConstant
} from '@popup/_lib/constant';
import {
    WalletImport
} from '@popup/_lib/models';
import {
    wallet
} from '@cityofzion/neon-core';
import { Wallet, Account } from '@cityofzion/neon-core/lib/wallet';


@Component({
    templateUrl: 'import.component.html',
    styleUrls: ['import.component.scss']
})
export class PopupWalletImportComponent implements OnInit, AfterViewInit {
    public navIndex = 0;

    public walletImport: WalletImport;
    public limit: any;
    public loading: boolean;
    public hidePwd: boolean;
    public hideWIF: boolean;
    public hideEncryptedKey: boolean;
    public hideConfirmPwd: boolean;
    public isInit: boolean;
    public isWIF = true;
    public isEncryptedKey = true;

    public encryptedKey: string;
    public nep2File: any;
    public nep2Json: Wallet = null;
    public nep2Name = '';



    constructor(
        private chrome: ChromeService,
        private global: GlobalService,
        private neon: NeonService,
        private router: Router,
    ) {
        this.init();
    }

    ngOnInit(): void { }

    ngAfterViewInit(): void {
        setTimeout(() => {
            this.isInit = false;
        });
    }

    private init() {
        this.walletImport = new WalletImport();
        this.limit = WalletInitConstant;
        this.loading = false;
        this.hidePwd = true;
        this.hideWIF = true;
        this.hideEncryptedKey = true;
        this.isInit = true;
        this.hideConfirmPwd = true;
        this.walletImport = new WalletImport();
        this.nep2File = null;
        this.nep2Json = null;
        this.nep2Name = '';
    }

    public navSelect(index: number) {
        if (index !== this.navIndex) {
            this.navIndex = index;
            this.init();
        }
    }

    public togglePwd(): void {
        this.hidePwd = !this.hidePwd;
    }

    public toggleConfirmPwd(): void {
        this.hideConfirmPwd = !this.hideConfirmPwd;
    }

    public toggleWIF(): void {
        this.hideWIF = !this.hideWIF;
    }

    public submit() {
        if (!wallet.isWIF(this.walletImport.WIF) && !wallet.isPrivateKey(this.walletImport.WIF)) {
            this.isWIF = false;
            return;
        }
        this.loading = true;
        if (wallet.isPrivateKey(this.walletImport.WIF)) {
            this.neon.importPrivateKey(this.walletImport.WIF, this.walletImport.password, this.walletImport.walletName)
                .subscribe((res: any) => {
                    this.neon.pushWalletArray(res.export());
                    this.chrome.setWalletArray(this.neon.getWalletArrayJSON());
                    this.chrome.setWallet(res.export());
                    this.global.$wallet.next('open');
                    this.loading = false;
                    if (this.neon.verifyWallet(res)) {
                        this.neon.pushWalletArray(res.export());
                        this.chrome.setWalletArray(this.neon.getWalletArrayJSON());
                        this.chrome.setWallet(res.export());
                        this.global.$wallet.next('open');
                        this.loading = false;
                        this.jumpRouter();
                    } else {
                        this.global.snackBarTip('existingWallet');
                        this.loading = false;
                    }
                });
        } else {
            this.neon
                .importWIF(this.walletImport.WIF, this.walletImport.password, this.walletImport.walletName)
                .subscribe(
                    (res: any) => {
                        if (this.neon.verifyWallet(res)) {
                            this.neon.pushWalletArray(res.export());
                            this.chrome.setWalletArray(this.neon.getWalletArrayJSON());
                            this.chrome.setWallet(res.export());
                            this.global.$wallet.next('open');
                            this.loading = false;
                            this.jumpRouter();
                        } else {
                            this.global.snackBarTip('existingWallet');
                            this.loading = false;
                        }
                    },
                    (err: any) => {
                        this.global.log('import wallet faild', err);
                        this.global.snackBarTip('walletImportFailed');
                        this.loading = false;
                    });
        }
    }

    public submitEncrypted() {
        if (!wallet.isNEP2(this.walletImport.EncrpytedKey)) {
            this.isEncryptedKey = false;
            return;
        }
        this.loading = true;
        this.neon.importEncryptKey(this.walletImport.EncrpytedKey, this.walletImport.password, this.walletImport.walletName)
            .subscribe((res: any) => {
                this.loading = false;
                if (this.neon.verifyWallet(res)) {
                    this.neon.pushWalletArray(res.export());
                    this.chrome.setWalletArray(this.neon.getWalletArrayJSON());
                    this.chrome.setWallet(res.export());
                    this.global.$wallet.next('open');
                    this.loading = false;
                    this.jumpRouter();
                } else {
                    this.global.snackBarTip('existingWallet');
                    this.loading = false;
                }
            }, (err: any) => {
                this.loading = false;
                this.global.log('import wallet faild', err);
                this.global.snackBarTip('walletImportFailed', '');
                this.loading = false;
            });
    }

    public onFileSelected(event: any) {
        this.nep2File = event.target.files[0];
        if (this.nep2File) {
            const reader = new FileReader();
            reader.readAsText(this.nep2File, 'UTF-8');
            reader.onload = (evt: any) => {
                this.nep2Json = JSON.parse(evt.target.result);
                if (this.nep2Json.accounts === undefined || this.nep2Json.accounts[0] === undefined
                    || !wallet.isNEP2((this.nep2Json.accounts[0] as any).key || this.nep2Json.name === undefined)) {
                    this.global.snackBarTip('nep2Wrong');
                    this.nep2Json = null;
                    return;
                }
                if (this.nep2Json.name !== undefined) {
                    this.nep2Name = this.nep2Json.name;
                }
                this.walletImport.EncrpytedKey = (this.nep2Json.accounts[0] as any).key;
            };
            reader.onerror = (evt) => {
                console.log('error reading file');
            };
        }
    }

    public clearNep2() {
        this.nep2Json = null;
        this.nep2File = null;
        this.nep2Name = '';
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
}
