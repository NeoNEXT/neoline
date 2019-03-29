import {
    Component,
    OnInit
} from '@angular/core';
import {
    Router,
    ActivatedRoute
} from '@angular/router';
import {
    Balance
} from '@/models/models';
import {
    AssetState,
    NeonService,
    GlobalService,
    HttpService,
    BlockState,
    ChromeService
} from '@/app/core';
import {
    MatSnackBar,
    MatDialog
} from '@angular/material';
import {
    TransferService
} from '../transfer.service';
import {
    PwdDialog
} from '../+pwd/pwd.dialog';
import {
    Transaction
} from '@cityofzion/neon-core/lib/tx';
import {
    concatAll,
    combineAll,
    catchError,
    map,
    switchMap
} from 'rxjs/operators';
import {
    merge,
    forkJoin,
    of
} from 'rxjs';
import {
    u
} from '@cityofzion/neon-core';
import { wallet } from '@cityofzion/neon-core';

@Component({
    templateUrl: 'create.component.html',
    styleUrls: ['create.component.scss']
})
export class TransferCreateomponent implements OnInit {
    public balance: Balance;
    public amount: number;
    public fromAddress: string;
    public toAddress: string;
    public creating: boolean = false;

    private assetId: string;
    constructor(
        private router: Router,
        private aRoute: ActivatedRoute,
        private asset: AssetState,
        private transfer: TransferService,
        private neon: NeonService,
        private dialog: MatDialog,
        private global: GlobalService,
        private http: HttpService,
        private chrome: ChromeService,
        private block: BlockState,
    ) {}

    ngOnInit(): void {
        this.fromAddress = this.neon.address;
        this.aRoute.params.subscribe((params) => {
            this.asset.detail(params.id).subscribe((res) => {
                this.balance = res;
                this.assetId = this.balance.asset_id;
            });
        });
    }

    public submit() {
        if (this.creating) {
            return;
        }
        if (!this.toAddress || !this.toAddress.length) {
            this.global.snackBarTip('checkInput', '', false);
            return;
        }
        if (wallet.isAddress(this.toAddress) === false) {
            this.global.snackBarTip('wrongAddress', '', false);
            return;
        }
        if (this.balance.balance === undefined || this.balance.balance <= 0) {
            this.global.snackBarTip('balanceLack', '', false);
            return;
        }
        if (this.balance.balance < this.amount) {
            this.global.snackBarTip('balanceLack', '', false);
            return;
        }
        this.creating = true;
        this.transfer.create(this.fromAddress, this.toAddress, this.balance.asset_id, this.amount).subscribe((res) => {
            this.dialog.open(PwdDialog).afterClosed().subscribe((pwd) => {
                if (pwd && pwd.length) {
                    this.global.log('start transfer with pwd');
                    this.resolveSign(res, pwd);
                } else {
                    this.creating = false;
                    this.global.log('cancel pay');
                }
            });
        }, (err) => {
            this.creating = false;
            this.global.snackBarTip('wentWrong', err, false);
        });
    }

    public close() {
        this.router.navigate([{
            outlets: {
                transfer: null
            }
        }]);
    }

    private resolveSign(tx: Transaction, pwd: string) {
        this.neon.wallet.accounts[0].decrypt(pwd).then((acc) => {
            tx.sign(acc);
            this.global.log('signed tx', tx);
            this.resolveSend(tx);
        }).catch((err) => {
            console.log(tx, err);
            this.creating = false;
            this.global.snackBarTip('signFailed', err, false);
        });
    }
    private resolveSend(tx: Transaction) {
        // this.creating = false;
        // this.router.navigate([{ outlets: { transfer: ['transfer', 'result'] } }]);
        // return;
        return this.http.post(`${this.global.apiDomain}/v1/transactions/transfer`, {
            signature_transaction: tx.serialize(true)
        }).subscribe(res => {
            this.creating = false;
            if (this.fromAddress !== this.toAddress) {
                this.chrome.pushTransaction({
                        txid: tx.hash,
                        value: -this.amount,
                        block_time: res.response_time
                    },
                    this.fromAddress, this.assetId);
            }
            // todo transfer done
            this.global.log('transfer done', res);
            this.router.navigate([{
                outlets: {
                    transfer: ['transfer', 'result']
                }
            }]);
        }, err => {
            this.creating = false;
            this.global.snackBarTip('transferFailed', err, false);
        });
    }
}
