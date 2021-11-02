import { Component, OnInit, AfterContentInit } from '@angular/core';
import { WalletCreation } from '../popup/_lib/models';
import { ChromeService, NeonService, GlobalService } from '../core';
import { Router } from '@angular/router';
import { Wallet } from '@cityofzion/neon-core/lib/wallet';
import { WalletInitConstant } from '../popup/_lib/constant';

@Component({
    selector: 'app-login',
    templateUrl: './login.component.html',
    styleUrls: ['./login.component.scss']
})
export class LoginComponent implements OnInit, AfterContentInit {
    public wallet: WalletCreation;
    public limit: any;
    public hidePwd: boolean;
    public loading = false;
    public isInit: boolean;
    public accountWallet;
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

    ngOnInit() {
        this.accountWallet = this.neon.walletArr[0];
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
            this.router.navigateByUrl('/asset');
        }).catch((err) => {
            this.loading = false;
            this.global.snackBarTip('loginFailed');
        });
    }

    public togglePwd() {
        this.hidePwd = !this.hidePwd;
    }

}
