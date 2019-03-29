import {
    Component,
    OnInit,
    AfterViewInit
} from '@angular/core';
import {
    ActivatedRoute,
    Router
} from '@angular/router';
import {
    MatDialog
} from '@angular/material';
import {
    AssetState,
    NeonService,
    BlockState,
    HttpService,
    GlobalService,
    ChromeService,
} from '@/app/core';
import {
    Balance
} from '@/models/models';
import {
    Transaction
} from '@cityofzion/neon-core/lib/tx';
import {
    TransferService
} from '@/app/transfer/transfer.service';
import {
    PwdDialog
} from '@/app/transfer/+pwd/pwd.dialog';
import {
    catchError,
    switchMap,
    map
} from 'rxjs/operators';
import {
    of
} from 'rxjs';
import { wallet } from '@cityofzion/neon-core';

@Component({
    templateUrl: 'transfer.component.html',
    styleUrls: ['transfer.component.scss']
})
export class PopupNoticeTransferComponent implements OnInit, AfterViewInit {
    public balance: Balance;
    public creating = false;
    public fromAddress: string;
    public toAddress: string;
    public assetId: string;
    public amount: number;
    public loading = false;
    public loadingMsg: string;
    public wallet: any;
    constructor(
        private router: Router,
        private aRoute: ActivatedRoute,
        private asset: AssetState,
        private transfer: TransferService,
        private neon: NeonService,
        private dialog: MatDialog,
        private block: BlockState,
        private http: HttpService,
        private global: GlobalService,
        private chrome: ChromeService,
    ) {}

    ngOnInit(): void {
        this.fromAddress = this.neon.address;
        this.wallet = this.neon.wallet;
        this.aRoute.queryParams.subscribe((params: any) => {
            this.toAddress = params.to_address || '';
            this.assetId = params.asset_id || '';
            this.amount = params.amount || 0;
            this.asset.detail(this.assetId).subscribe((res) => {
                this.balance = res;
            });
        });
        this.asset.fetchBalance(this.fromAddress);
    }

    ngAfterViewInit(): void {}

    public submit() {
        if (this.creating) {
            return;
        }
        if (!this.toAddress || !this.toAddress.length) {
            this.global.snackBarTip('checkAddress', '', false);
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
        if (this.balance.balance < this.amount || this.amount === 0) {
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
            this.global.snackBarTip('wentWrong', '', false);
        });
    }

    public cancel() {
        this.chrome.windowCallback({data: 'cancel', target: 'transferRes'});
        window.close();
    }

    private resolveSign(tx: Transaction, pwd: string) {
        this.loading = true;
        this.loadingMsg = '验证中';
        this.neon.wallet.accounts[0].decrypt(pwd).then((acc) => {
            tx.sign(acc);
            this.global.log('signed tx', tx);
            this.resolveSend(tx);
        }).catch((err) => {
            this.loading = false;
            this.loadingMsg = '';
            console.log(tx, err);
            this.creating = false;
            this.global.snackBarTip('verifyFailed', err, false);
        });
    }

    private resolveSend(tx: Transaction) {
        this.loadingMsg = '请求中';
        return this.http.post(`${this.global.apiDomain}/v1/transactions/transfer`, {
            signature_transaction: tx.serialize(true)
        }).subscribe(res => {
            this.loading = false;
            this.loadingMsg = '';
            this.creating = false;
            if (this.fromAddress !== this.toAddress) {
                this.chrome.pushTransaction({
                        txid: tx.hash,
                        value: -this.amount,
                        block_time: res.response_time
                    },
                    this.fromAddress, this.assetId);
            }
            this.chrome.windowCallback({data: tx.hash, target: 'transferRes'});
            this.router.navigate([{
                outlets: {
                    transfer: ['transfer', 'result']
                }
            }]);
        }, err => {
            this.loading = false;
            this.loadingMsg = '';
            this.creating = false;
            this.chrome.windowCallback({data: 'rpcWrond', target: 'transferRes'});
            this.global.snackBarTip('transferFailed', err, false);
        });
    }

}
