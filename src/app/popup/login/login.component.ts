import {
    Component,
    OnInit,
    AfterContentInit
} from '@angular/core';
import {
    WalletCreation
} from '../_lib/models';
import {
    WalletInitConstant, STORAGE_NAME
} from '../_lib/constant';
import { Wallet as Wallet2 } from '@cityofzion/neon-core/lib/wallet';
import { Wallet as Wallet3 } from '@cityofzion/neon-core-neo3/lib/wallet';
import {
    Router, ActivatedRoute
} from '@angular/router';
import {
    NeonService
} from '@/app/core/services/neon.service';
import {
    ChromeService,
    GlobalService,
    UtilServiceState,
} from '@/app/core';
import { MatDialog } from '@angular/material/dialog';
import { PopupConfirmDialogComponent } from '../_dialogs';
import { ERRORS, requestTarget } from '@/models/dapi';


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
    public accountWallet: Wallet2 | Wallet3;

    public allWallet = [];
    public selectedWalletIndex;

    constructor(
        private route: ActivatedRoute,
        private router: Router,
        private neon: NeonService,
        private chrome: ChromeService,
        private global: GlobalService,
        private dialog: MatDialog,
        private util: UtilServiceState
    ) {
        this.hidePwd = true;
        this.wallet = new WalletCreation();
        this.limit = WalletInitConstant;
        this.isInit = true;
        this.allWallet = this.neon.neo2WalletArr.concat(this.neon.neo3WalletArr);
        this.selectedWalletIndex = this.allWallet.findIndex(item => item.accounts[0].address === this.neon.wallet.accounts[0].address);
    }

    ngOnInit(): void {
        this.accountWallet = this.neon.wallet;
        window.onbeforeunload = () => {
            this.chrome.windowCallback({
                data: ERRORS.CANCELLED,
                return: requestTarget.Login
            });
        };
    }

    ngAfterContentInit(): void {
        setTimeout(() => {
            this.isInit = false;
        });
    }

    public login() {
        this.loading = true;
        const account: any =
            this.neon.currentWalletChainType === 'Neo3'
                ? this.util.getNeo3Account()
                : this.accountWallet.accounts[0];
        account.decrypt(this.wallet.password).then((res) => {
            if(this.route.snapshot.queryParams.notification !== undefined) {
                this.chrome.windowCallback({
                    data: true,
                    return: requestTarget.Login
                });
                window.close()
            }
            this.loading = false;
            this.chrome.setLogin(false);
            this.global.$wallet.next('open');
            const returnUrl = this.route.snapshot.queryParams.returnUrl || '/popup';
            this.router.navigateByUrl(returnUrl);
        }).catch((err) => {
            this.loading = false;
            this.global.snackBarTip('loginFailed');
        });
    }

    public togglePwd() {
        this.hidePwd = !this.hidePwd;
    }

    public resetWallet() {
        this.dialog.open(PopupConfirmDialogComponent, {
            data: 'resetWalletConfirm',
            panelClass: 'custom-dialog-panel'
        }).afterClosed().subscribe(confirm => {
            if (confirm) {
                this.neon.reset();
                this.chrome.resetWallet();
                this.router.navigateByUrl('/popup/wallet/new-guide');
            }
        });
    }

    public selectAccount(w: Wallet2 | Wallet3) {
        if (w.accounts[0].address === this.neon.wallet.accounts[0].address) {
            return;
        }
        const wallet = this.neon.parseWallet(w);
        this.chrome.setWallet(wallet.export());
        location.reload();
    }
}
