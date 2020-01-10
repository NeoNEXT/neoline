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
    public nep6File: any;
    public nep6Json: Wallet = null;
    public nep6Name = '';



    constructor(
        private chrome: ChromeService,
        private global: GlobalService,
        private neon: NeonService,
        private router: Router,
    ) {
        this.isInit = true;
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
        this.hideConfirmPwd = true;
        this.walletImport = new WalletImport();
        this.nep6File = null;
        this.nep6Json = null;
        this.nep6Name = '';
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
                    this.walletImport.walletName = '';
                }
                if (this.nep6Json.name !== undefined) {
                    this.nep6Name = this.nep6Json.name;
                    this.walletImport.walletName = this.nep6Json.name;
                }
                this.walletImport.EncrpytedKey = (this.nep6Json.accounts[0] as any).key;
            };
            reader.onerror = (evt) => {
                console.log('error reading file');
            };
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
