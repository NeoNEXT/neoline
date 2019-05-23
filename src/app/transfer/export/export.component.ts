import {
    Component,
    OnInit
} from '@angular/core';
import {
    Router
} from '@angular/router';
import {
    NeonService,
    GlobalService
} from '@/app/core';
import {
    Wallet
} from '@cityofzion/neon-core/lib/wallet';

@Component({
    templateUrl: 'export.component.html',
    styleUrls: ['export.component.scss', './dark.scss', './light.scss']
})
export class TransferExportComponent implements OnInit {
    public wallet: Wallet;
    public address: string;
    public verified = false;
    public loading = false;
    public pwd = '';
    public wif: string;
    constructor(
        private router: Router,
        private neon: NeonService,
        private global: GlobalService
    ) {}

    ngOnInit(): void {
        this.wallet = this.neon.wallet;
        this.address = this.neon.address;
    }

    public verify() {
        if (this.loading) {
            return;
        }
        if (!this.pwd || !this.pwd.length) {
            this.global.snackBarTip('checkInput');
            return;
        }
        this.loading = true;
        this.wallet.accounts[0].decrypt(this.pwd).then((res) => {
            this.loading = false;
            this.verified = true;
            this.wif = res.WIF;
        }).catch((err) => {
            this.loading = false;
            this.global.snackBarTip('verifyFailed', err);
        });
    }
    public close() {
        this.router.navigate([{
            outlets: {
                transfer: null
            }
        }]);
    }
}
