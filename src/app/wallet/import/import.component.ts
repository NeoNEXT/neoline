import {
    Component,
    OnInit,
    AfterViewInit,
    Input
} from '@angular/core';
import {
    FormGroup,
    FormControl,
    Validators
} from '@angular/forms';
import {
    wallet
} from '@cityofzion/neon-core';
import {
    NeonService,
    ChromeService,
    GlobalService
} from '@app/core';
import {
    Router, ActivatedRoute
} from '@angular/router';
import {
    WalletImport
} from '@/app/popup/_lib/models';
import {
    WalletInitConstant
} from '@/app/popup/_lib/constant';
import { Wallet } from '@cityofzion/neon-core/lib/wallet';

@Component({
    templateUrl: 'import.component.html',
    styleUrls: ['import.component.scss', './dark.scss', './light.scss']
})
export class WalletImportComponent implements OnInit, AfterViewInit {
    public walletImport: WalletImport;
    public limit: any;
    public loading: boolean;
    public hidePwd: boolean;
    public hideWIF: boolean;
    public hideEncryptedKey: boolean;
    public isInit: boolean;
    public isWIF = true;
    public hideConfirmPwd: boolean;

    public isEncryptedKey = true;

    public encryptedKey: string;
    public nep2File: any;
    public nep2Json: Wallet = null;
    public nep2Name = '';

    public importType = 'PrivateKey';

    constructor(
        private chrome: ChromeService,
        private global: GlobalService,
        private neon: NeonService,
        private router: Router,
        private aRouter: ActivatedRoute
    ) {
        this.isInit = true;
        this.init();
    }

    ngOnInit(): void {
        this.aRouter.params.subscribe((params: any) => {
            this.importType = params.type;
            this.init();
        });
    }

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
        this.nep2File = null;
        this.nep2Json = null;
        this.nep2Name = '';
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
                    this.updateLocalWallet(res);
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
                    this.nep2Name = '';
                    this.walletImport.walletName = '';
                    return;
                }
                if (this.nep2Json.name !== undefined) {
                    this.nep2Name = this.nep2Json.name;
                    this.walletImport.walletName = this.nep2Json.name;
                }
                this.walletImport.EncrpytedKey = (this.nep2Json.accounts[0] as any).key;
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
        location.href = `index.html`;
    }
}
