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
import {
    wallet
} from '@cityofzion/neon-core';

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

    public tx: Transaction;
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
    ) { }

    ngOnInit(): void {
        this.loading = true;
        this.loadingMsg = 'Loading';
        this.fromAddress = this.neon.address;
        this.wallet = this.neon.wallet;
        this.aRoute.queryParams.subscribe((params: any) => {
            if (params.network === 'MainNet') {
                this.global.modifyNet('main');
            } else {
                this.global.modifyNet('test');
            }
            this.toAddress = params.to_address || '';
            this.assetId = params.asset_id || '';
            this.amount = params.amount || 0;
            this.asset.detail(this.neon.address, this.assetId).subscribe((res: Balance) => {
                this.loading = false;
                this.loadingMsg = '';
                this.balance = res;
                this.transfer.create(this.fromAddress, this.toAddress, this.assetId, this.amount).subscribe((tx) => {
                    this.dialog.open(PwdDialog, {
                        disableClose: true
                    }).afterClosed().subscribe((pwd) => {
                        if (pwd && pwd.length) {
                            this.global.log('start transfer with pwd');
                            this.resolveSign(tx, pwd);
                        } else {
                            this.creating = false;
                            this.global.log('cancel pay');
                        }
                    });
                }, (err) => {
                    this.creating = false;
                    this.global.snackBarTip('wentWrong');
                });
            });
        });
    }

    ngAfterViewInit(): void { }

    public submit() {
        if (this.creating) {
            return;
        }
        if (this.tx === undefined) {
            alert('Please follow the formal process');
            return;
        }
        if (this.balance.balance === undefined || this.balance.balance <= 0) {
            this.global.snackBarTip('balanceLack');
            return;
        }
        if (parseFloat(this.balance.balance.toString()) < parseFloat(this.amount.toString()) || this.amount === 0) {
            this.global.snackBarTip('balanceLack');
            return;
        }
        this.creating = true;
        this.resolveSend(this.tx);

    }

    public cancel() {
        this.chrome.windowCallback({
            data: 'cancel',
            target: 'transferRes'
        });
        window.close();
    }

    private resolveSign(tx: Transaction, pwd: string) {
        this.loading = true;
        this.loadingMsg = 'Wait';
        this.neon.wallet.accounts[0].decrypt(pwd).then((acc) => {
            tx.sign(acc);
            this.tx = tx;
            this.loading = false;
            this.loadingMsg = '';
            this.creating = false;
        }).catch((err) => {
            this.loading = false;
            this.loadingMsg = '';
            this.creating = false;
            this.global.snackBarTip('verifyFailed', err);
            this.dialog.open(PwdDialog, {
                disableClose: true
            }).afterClosed().subscribe((pwdText) => {
                if (pwdText && pwdText.length) {
                    this.global.log('start transfer with pwd');
                    this.resolveSign(tx, pwdText);
                } else {
                    this.creating = false;
                    this.global.log('cancel pay');
                }
            });
        });
    }

    private resolveSend(tx: Transaction) {
        this.loadingMsg = 'Wait';
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
            this.chrome.windowCallback({
                data: tx.hash,
                target: 'transferRes'
            });
            this.router.navigate([{
                outlets: {
                    transfer: ['transfer', 'result']
                }
            }]);
        }, err => {
            this.loading = false;
            this.loadingMsg = '';
            this.creating = false;
            this.chrome.windowCallback({
                data: 'rpcWrond',
                target: 'transferRes'
            });
            this.global.snackBarTip('transferFailed', err);
        });
    }

}
