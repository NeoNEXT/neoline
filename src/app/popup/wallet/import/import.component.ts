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

@Component({
    templateUrl: 'import.component.html',
    styleUrls: ['import.component.scss']
})
export class PopupWalletImportComponent implements OnInit, AfterViewInit {
    public walletImport: WalletImport;
    public limit: any;
    public loading: boolean;
    public hidePwd: boolean;
    public hideWIF: boolean;
    public hideConfirmPwd: boolean;
    public isInit: boolean;
    public isWIF = true;

    constructor(
        private chrome: ChromeService,
        private global: GlobalService,
        private neon: NeonService,
        private router: Router,
    ) {
        this.walletImport = new WalletImport();
        this.limit = WalletInitConstant;
        this.loading = false;
        this.hidePwd = true;
        this.hideWIF = true;
        this.isInit = true;
        this.hideConfirmPwd = true;
    }

    ngOnInit(): void { }

    ngAfterViewInit(): void {
        setTimeout(() => {
            this.isInit = false;
        });
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
                        this.global.snackBarTip('walletImportFailed', '', false);
                        this.loading = false;
                    });
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
}
