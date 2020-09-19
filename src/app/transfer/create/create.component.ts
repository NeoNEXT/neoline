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
    MatDialog
} from '@angular/material/dialog';
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
import { rpc } from '@cityofzion/neon-js';
import { bignumber } from 'mathjs';


@Component({
    templateUrl: 'create.component.html',
    styleUrls: ['create.component.scss']
})
export class TransferCreateComponent implements OnInit {
    public balance: Balance;
    public amount: string;
    public fee: number = 0.0011;
    public fromAddress: string;
    public toAddress: string;
    public creating: boolean = false;
    public checkFee: boolean = false;

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
        if (bignumber(this.balance.balance.toString()).comparedTo(bignumber(this.amount.toString())) === -1) {
            this.global.snackBarTip('balanceLack');
            return;
        }
        this.creating = true;
        this.transfer.create(this.fromAddress, this.toAddress, this.balance.asset_id, this.amount,
            this.checkFee ? this.fee : 0, this.balance.decimals).subscribe((res) => {
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
        return rpc.Query.sendRawTransaction(tx.serialize(true)).execute(this.global.RPCDomain).then(res => {
            if (
                !res.result ||
                (res.result && typeof res.result === 'object' && res.result.succeed === false)
            ) {
                throw {
                    msg: 'Transaction rejected by RPC node.'
                };
            }
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
            return res;
        }).catch(err => {
            this.creating = false;
            this.global.snackBarTip('transferFailed', err.msg || err);
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
