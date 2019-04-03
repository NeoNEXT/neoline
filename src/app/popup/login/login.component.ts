import {
    Component,
    OnInit,
    AfterContentInit
} from '@angular/core';
import {
    WalletCreation
} from '../_lib/models';
import {
    WalletInitConstant
} from '../_lib/constant';
import {
    Wallet
} from '@cityofzion/neon-core/lib/wallet';
import {
    Router
} from '@angular/router';
import {
    NeonService
} from '@/app/core/services/neon.service';
import {
    ChromeService,
    GlobalService
} from '@/app/core';


@Component({
    templateUrl: 'login.component.html',
    styleUrls: ['login.component.scss']
})
export class PopupLoginComponent implements OnInit, AfterContentInit {
    public wallet: WalletCreation;
    public limit: any;
    public hidePwd: boolean;
    public loading = false;
    public isInit: boolean;
    public accountWallet: Wallet;

    constructor(
        private router: Router,
        private neon: NeonService,
        private chrome: ChromeService,
        private global: GlobalService
    ) {
        this.hidePwd = true;
        this.wallet = new WalletCreation();
        this.limit = WalletInitConstant;
        this.isInit = true;
    }

    ngOnInit(): void {
        this.accountWallet = this.neon.wallet;
    }

    ngAfterContentInit(): void {
        setTimeout(() => {
            this.isInit = false;
        });
    }

    public login() {
        this.loading = true;
        this.accountWallet.accounts[0].decrypt(this.wallet.password).then((res) => {
            this.loading = false;
            this.chrome.verifyLogin();
            this.router.navigateByUrl('/popup/home');
        }).catch((err) => {
            this.loading = false;
            this.global.snackBarTip('loginFailed');
        });
    }

    public togglePwd() {
        this.hidePwd = !this.hidePwd;
    }
}
