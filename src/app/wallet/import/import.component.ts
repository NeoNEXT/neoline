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
    styleUrls: ['import.component.scss']
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
    public nep6File: any;
    public nep6Json: Wallet = null;
    public nep6Name = '';

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

    init() {
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
        this.nep6File = event.target.files[0];
        if (this.nep6File) {
            const reader = new FileReader();
            reader.readAsText(this.nep6File, 'UTF-8');
            reader.onload = (evt: any) => {
                this.nep6Json = JSON.parse(evt.target.result);
                if (this.nep6Json.accounts === undefined || this.nep6Json.accounts[0] === undefined
                    || !wallet.isNEP2((this.nep6Json.accounts[0] as any).key || this.nep6Json.name === undefined)) {
                    this.global.snackBarTip('nep6Wrong');
                    this.nep6Json = null;
                    this.nep6Name = '';
                    this.walletImport.walletName = '';
                    return;
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
        location.href = `index.html`;
    }
}
