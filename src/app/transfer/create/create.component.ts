import {
    Component,
    OnInit
} from '@angular/core';
import {
    Router,
    ActivatedRoute
} from '@angular/router';
import {
    Balance, NEO, GAS
} from '@/models/models';
import {
    AssetState,
    NeonService,
    GlobalService,
    HttpService,
    BlockState,
    ChromeService,
    TransactionState
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
import { wallet } from '@cityofzion/neon-core';

@Component({
    templateUrl: 'create.component.html',
    styleUrls: ['create.component.scss']
})
export class TransferCreateomponent implements OnInit {
    public balance: Balance;
    public amount: number;
    public fee: number;
    public fromAddress: string;
    public toAddress: string;
    public creating: boolean = false;
    public NEO = NEO;
    public GAS = GAS;

    public assetId: string;
    public net: string;
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
        private txState: TransactionState
    ) { }

    ngOnInit(): void {
        this.net = this.global.net;
        this.fromAddress = this.neon.address;
        this.aRoute.params.subscribe((params) => {
            this.asset.detail(this.neon.address, params.id).subscribe((res: Balance) => {
                res.balance = Number(res.balance);
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
            this.global.snackBarTip('checkInput');
            return;
        }
        if (wallet.isAddress(this.toAddress) === false) {
            this.global.snackBarTip('wrongAddress');
            return;
        }
        if (this.balance.balance === undefined || this.balance.balance <= 0) {
            this.global.snackBarTip('balanceLack');
            return;
        }
        if (parseFloat(this.balance.balance.toString()) < parseFloat(this.amount.toString())) {
            this.global.snackBarTip('balanceLack');
            return;
        }
        this.creating = true;
        this.transfer.create(this.fromAddress, this.toAddress, this.balance.asset_id, this.amount, this.fee).subscribe((res) => {
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
            this.global.snackBarTip('wentWrong', err);
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
            this.global.snackBarTip('signFailed', err);
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
                const txTarget = {
                    txid: '0x' + tx.hash,
                    value: -this.amount,
                    block_time: res.response_time
                };
                this.pushTransaction(txTarget);
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
            this.global.snackBarTip('transferFailed', err);
        });
    }

    public pushTransaction(transaction: object) {
        const net = this.net;
        const address = this.fromAddress;
        const assetId = this.assetId;
        this.chrome.getTransaction().subscribe(res => {
            if (res === null || res === undefined) {
                res = {};
            }
            if (res[net] === undefined) {
                res[net] = {};
            }
            if (res[net][address] === undefined) {
                res[net][address] = {};
            }
            if (res[net][address][assetId] === undefined) {
                res[net][address][assetId] = [];
            }
            res[net][address][assetId].unshift(transaction);
            this.chrome.setTransaction(res);
            this.txState.pushTxSource();
        });
    }
}
