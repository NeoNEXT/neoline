import {
    Component,
    OnInit,
    AfterContentInit
} from '@angular/core';
import { Router } from '@angular/router';
import { WalletCreation } from '@popup/_lib/models';
import { WalletInitConstant } from '@popup/_lib/constant';
import { ChromeService, NeonService, GlobalService } from '@app/core';

@Component({
    templateUrl: 'create.component.html',
    styleUrls: ['create.component.scss']
})
export class PopupWalletCreateComponent implements OnInit, AfterContentInit {
    public wallet: WalletCreation;
    public limit: any;
    public hidePwd: boolean;
    public hideConfirmPwd: boolean;
    public loading = false;
    public isInit: boolean;

    constructor(
        private chrome: ChromeService,
        private global: GlobalService,
        private neon: NeonService,
        private router: Router,
    ) {
        this.hidePwd = true;
        this.wallet = new WalletCreation();
        this.limit = WalletInitConstant;
        this.isInit = true;
        this.hideConfirmPwd = true;
    }

    ngOnInit(): void {
    }

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
        if (this.wallet.walletName.trim() === '') {
            return;
        }
        this.loading = true;

        this.neon
            .createWallet(this.wallet.password, this.wallet.walletName)
            .subscribe(
                (res: any) => {
                    if (this.neon.verifyWallet(res)) {
                        this.neon.pushWalletArray(res.export());
                        this.chrome.setWalletArray(this.neon.getWalletArrayJSON());
                        this.chrome.setWallet(res.export());
                        this.global.$wallet.next('open');
                        this.loading = false;
                        this.chrome.getHistory().subscribe((history) => {
                            if (history != null) {
                                if (history.indexOf('notification') > -1) {
                                    this.router.navigateByUrl(history);
                                } else {
                                    location.href = `index.html#popup`;
                                }
                            } else {
                                location.href = `index.html#popup`;
                            }
                            this.chrome.setHistory('');
                        }, (err) => {
                            this.chrome.setHistory('');
                            location.href = `index.html#popup`;
                        });
                    } else {
                        this.global.snackBarTip('existingWallet');
                        this.loading = false;
                    }
                },
                (err: any) => {
                    this.global.log('create wallet faild', err);
                    this.global.snackBarTip('walletCreateFailed');
                    this.loading = false;
                });
    }
}
