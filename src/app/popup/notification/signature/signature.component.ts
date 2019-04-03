import {
    Component,
    OnInit,
    OnDestroy
} from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { Wallet } from '@cityofzion/neon-core/lib/wallet';
import { NeonService, AssetState, ChromeService } from '@/app/core';
import { NEO, Balance } from '@/models/models';
import { Unsubscribable } from 'rxjs';

@Component({
    templateUrl: './signature.component.html',
    styleUrls: ['./signature.component.scss']
})
export class PopupNoticeSignComponent implements OnInit, OnDestroy {
    public iconSrc = '';
    public hostname = '';
    public title = '';
    public wallet: Wallet;
    public balance: number;
    public unSubBalance: Unsubscribable;
    constructor(
        private asset: AssetState,
        private aRouter: ActivatedRoute,
        private neon: NeonService,
        private chrome: ChromeService
    ) {
        this.wallet = this.neon.wallet;
        this.aRouter.queryParams.subscribe((params: any) => {
            this.iconSrc = params.icon;
            this.hostname = params.hostname;
            this.title = params.title;
        });

    }

    ngOnInit() {
        this.asset.fetchBalance(this.wallet.accounts[0].address);
        this.unSubBalance = this.asset.balance().subscribe((res) => {
            const index = res.findIndex((item) => item.asset_id === NEO);
            if (index >= 0) {
                this.balance = res[index].balance;
            } else {
                this.balance = 0;
            }
        });
    }

    ngOnDestroy(): void {
        if (this.unSubBalance) {
            this.unSubBalance.unsubscribe();
        }
    }

    public cancel() {
        window.close();
    }

    public signature() {

    }

}
