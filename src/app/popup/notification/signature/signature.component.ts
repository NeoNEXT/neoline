import {
    Component,
    OnInit,
    OnDestroy
} from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { Wallet } from '@cityofzion/neon-core/lib/wallet';
import { NeonService, AssetState, ChromeService } from '@/app/core';
import { NEO } from '@/models/models';

@Component({
    templateUrl: './signature.component.html',
    styleUrls: ['./signature.component.scss']
})
export class PopupNoticeSignComponent implements OnInit {
    public iconSrc = '';
    public hostname = '';
    public title = '';
    public wallet;
    public balance: number;
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
        this.asset.fetchBalance(this.wallet.accounts[0].address).subscribe((res) => {
            const index = res.findIndex((item) => item.asset_id === NEO);
            if (index >= 0) {
                this.balance = res[index].balance;
            } else {
                this.balance = 0;
            }
        });
    }

    public cancel() {
        window.close();
    }

    public signature() {

    }

}
