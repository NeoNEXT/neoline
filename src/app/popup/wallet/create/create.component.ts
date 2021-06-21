import { GlobalService, NeonService, SettingState } from '@/app/core';
import {
    AfterContentInit,
    Component,
    EventEmitter,
    OnInit,
    Output,
} from '@angular/core';
import { WalletCreation } from '../../_lib/models';

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

    constructor(
        private global: GlobalService,
        private neon: NeonService,
        private settingState: SettingState
    ) {
        this.hidePwd = true;
        this.hideConfirmPwd = true;
        this.wallet = new WalletCreation();
    }

    async ngOnInit() {
        this.limit = await this.settingState.getWalletInitConstant();
    }

    ngAfterContentInit(): void {
        setTimeout(() => {
            this.isInit = false;
        });
    }

    public submitCreate(): void {
        this.loading = true;
        this.neon
            .createWallet(this.wallet.password, this.wallet.walletName)
            .subscribe(
                (res: any) => {
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
