import {
    Component,
    OnInit,
    AfterContentInit
} from '@angular/core';
import {
    NeonService,
    ChromeService,
    GlobalService,
} from '@app/core';
import {
    Router
} from '@angular/router';
import {
    WalletInitConstant
} from '@popup/_lib/constant';
import {
    WalletCreation
} from '@popup/_lib/models';

@Component({
    templateUrl: 'create.component.html',
    styleUrls: ['create.component.scss']
})
export class WalletCreateComponent implements OnInit, AfterContentInit {
    public loading = false;
    public limit: any;
    public wallet: WalletCreation;
    public hidePwd: boolean;
    public hideConfirmPwd: boolean;
    public isInit: boolean;

    constructor(
        private neon: NeonService,
        private chrome: ChromeService,
        private router: Router,
        private global: GlobalService,
    ) {
        this.limit = WalletInitConstant;
        this.wallet = new WalletCreation();
        this.hidePwd = true;
        this.hideConfirmPwd = true;
        this.isInit = true;
    }

    ngOnInit(): void { }

    ngAfterContentInit(): void {
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

    public submit(): void {
        this.loading = true;

        this.neon
            .createWallet(this.wallet.password, this.wallet.walletName)
            .subscribe(
                (res: any) => {
                    this.neon.pushWalletArray(res.export());
                    this.chrome.setWalletArray(this.neon.getWalletArrayJSON());
                    this.chrome.setWallet(res.export());
                    this.global.$wallet.next('open');
                    this.loading = false;
                    location.href = `index.html#asset`;
                },
                (err: any) => {
                    this.global.log('create wallet faild', err);
                    this.global.snackBarTip('walletCreateFailed', '', false);
                    this.loading = false;
                    location.href = `index.html#asset`
                });
    }
}
