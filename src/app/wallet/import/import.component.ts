import {
    Component,
    OnInit,
    AfterViewInit
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
    Router
} from '@angular/router';
import {
    WalletImport
} from '@/app/popup/_lib/models';
import {
    WalletInitConstant
} from '@/app/popup/_lib/constant';

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
    public isInit: boolean;
    public isWIF = true;
    public hideConfirmPwd: boolean;

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
                    this.router.navigateByUrl('/asset');
                });
        } else {
            this.neon
                .importWIF(this.walletImport.WIF, this.walletImport.password, this.walletImport.walletName)
                .subscribe(
                    (res: any) => {
                        this.neon.pushWalletArray(res.export());
                        this.chrome.setWalletArray(this.neon.getWalletArrayJSON());
                        this.chrome.setWallet(res.export());
                        this.global.$wallet.next('open');
                        this.loading = false;
                        this.router.navigateByUrl('/asset');
                    },
                    (err: any) => {
                        this.global.log('import wallet faild', err);
                        this.global.snackBarTip('walletImportFailed', '', false);
                        this.loading = false;
                    });
        }
    }
}
