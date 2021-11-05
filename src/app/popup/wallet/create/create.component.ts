import { GlobalService, NeonService, ChromeService } from '@/app/core';
import {
    AfterContentInit,
    Component,
    EventEmitter,
    OnInit,
    Output,
} from '@angular/core';
import { WalletInitConstant } from '../../_lib/constant';
import { WalletCreation } from '../../_lib/models';
import { Observable, of } from 'rxjs';

@Component({
    selector: 'wallet-create',
    templateUrl: 'create.component.html',
    styleUrls: ['create.component.scss'],
})
export class PopupWalletCreateComponent implements OnInit, AfterContentInit {
    public wallet: WalletCreation;
    public limit: any;
    public hidePwd: boolean;
    public hideConfirmPwd: boolean;
    public loading = false;
    public isInit: boolean;
    @Output() submit = new EventEmitter<any>();

    public password: string;

    constructor(
        private global: GlobalService,
        private neon: NeonService,
        private chrome: ChromeService
    ) {
        this.hidePwd = true;
        this.hideConfirmPwd = true;
        this.wallet = new WalletCreation();
        this.limit = WalletInitConstant;
        this.password = this.chrome.getPassword();
        console.log(this.password);
    }

    ngOnInit() {}

    ngAfterContentInit(): void {
        setTimeout(() => {
            this.isInit = false;
        });
    }

    public submitCreate(): void {
        this.loading = true;
        this.neon
            .createWallet(
                this.password === null ? this.wallet.password : this.password,
                this.wallet.walletName
            )
            .subscribe(
                (res: any) => {
                    if (this.password === null) {
                        this.chrome.setPassword(this.wallet.password);
                    }
                    if (this.neon.verifyWallet(res)) {
                        this.submit.emit(res);
                    } else {
                        this.global.snackBarTip('existingWallet');
                    }
                    this.loading = false;
                },
                (err: any) => {
                    this.global.log('create wallet faild', err);
                    this.global.snackBarTip('walletCreateFailed');
                    this.loading = false;
                }
            );
    }

    public cancel() {
        history.go(-1);
    }
}
