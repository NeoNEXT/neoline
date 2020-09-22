import {
    Component,
    OnInit
} from '@angular/core';
import {
    Router,
    ActivatedRoute
} from '@angular/router';
import {
    Balance, NEO, GAS, Asset
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
    Transaction
} from '@cityofzion/neon-core/lib/tx';
import { wallet } from '@cityofzion/neon-core';
import { rpc } from '@cityofzion/neon-js';
import { PopupAddressDialogComponent, PopupAssetDialogComponent, PopupTransferSuccessDialogComponent, PopupEditFeeDialogComponent } from '../../_dialogs';
import { PopupTransferConfirmComponent } from '../confirm/confirm.component';
import { bignumber } from 'mathjs';
import { GasFeeSpeed } from '../../_lib/type';

@Component({
    templateUrl: 'create.component.html',
    styleUrls: ['create.component.scss']
})
export class TransferCreateComponent implements OnInit {
    public amount: string;
    public fee: any;
    gasFeeSpeed: GasFeeSpeed;
    public fromAddress: string;
    public toAddress: string;
    public creating: boolean = false;

    public assetLogoUrl = '';
    public chooseAsset: Balance;

    public balances: Array<Balance> = [];
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
            if (params.id) {
                this.asset.detail(this.neon.address, params.id).subscribe(async (res: Balance) => {
                    res.balance = Number(res.balance);
                    this.chooseAsset = res;
                    this.assetId = res.asset_id;
                    this.assetLogoUrl = await this.asset.getAssetImage(this.assetId);
                });
            }
            this.asset.fetchBalance(this.neon.address).subscribe(async balanceArr => {
                this.balances = balanceArr;
                if (!params.id) {
                    this.assetId = this.balances[0].asset_id;
                    this.chooseAsset = this.balances[0];
                    this.assetLogoUrl = await this.asset.getAssetImage(this.assetId);
                }
            });
        });
        if (this.asset.gasFeeSpeed) {
            this.gasFeeSpeed = this.asset.gasFeeSpeed;
            this.fee = this.asset.gasFeeSpeed.propose_price;
        } else {
            this.asset.getGasFee().subscribe((res: GasFeeSpeed) => {
                this.gasFeeSpeed = res;
                this.fee = res.propose_price;
            });
        }
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
        if (this.chooseAsset.balance === undefined || this.chooseAsset.balance <= 0) {
            this.global.snackBarTip('balanceLack');
            return;
        }
        if (bignumber(this.chooseAsset.balance.toString()).comparedTo( bignumber(this.amount.toString())) === -1) {
            this.global.snackBarTip('balanceLack');
            return;
        }
        try {
            bignumber(this.amount)
        } catch (error) {
            this.global.snackBarTip('checkInput');
            return;
        }
        this.creating = true;
        this.transfer.create(this.fromAddress, this.toAddress, this.chooseAsset.asset_id, this.amount,
            this.fee || 0, this.chooseAsset.decimals).subscribe((res) => {
                this.global.log('start transfer');
                this.resolveSign(res);
            }, (err) => {
                this.creating = false;
                this.global.snackBarTip('wentWrong', err);
            });
    }

    public cancel() {
        history.go(-1);
    }

    private resolveSign(tx: Transaction) {
        try {
            const wif = this.neon.WIFArr[
                this.neon.walletArr.findIndex(item => item.accounts[0].address === this.neon.wallet.accounts[0].address)
            ]
            tx.sign(wif);
            this.global.log('signed tx', tx);
            this.dialog.open(PopupTransferConfirmComponent, {
                panelClass: 'custom-dialog-panel-full',
                height: '600px',
                width: '100%',
                hasBackdrop: false,
                maxWidth: '400px',
                autoFocus: false,
                data: {
                    fromAddress: this.fromAddress,
                    toAddress: this.toAddress,
                    asset: this.assetId,
                    symbol: this.chooseAsset.symbol,
                    amount: this.amount,
                    fee: this.fee || '0',
                    network: this.net,
                    txSerialize: tx.serialize(true)
                },
            }).afterClosed().subscribe((isConfirm) => {
                this.creating = false;
                if (isConfirm !== false) {
                    if (this.fee !== isConfirm) {
                        this.fee = isConfirm;
                        this.transfer.create(this.fromAddress, this.toAddress, this.chooseAsset.asset_id, this.amount,
                            this.fee || 0, this.chooseAsset.decimals).subscribe((res) => {
                                this.global.log('start transfer');
                                this.resolveSend(tx);
                            }, (err) => {
                                this.global.snackBarTip('wentWrong', err);
                            });
                    } else {
                        this.resolveSend(tx);
                    }
                }
            });
        } catch (error) {
            console.log(tx, error);
            this.creating = false;
            this.global.snackBarTip('signFailed', error);
        }
    }
    private async resolveSend(tx: Transaction) {
        try {
            const res = await rpc.Query.sendRawTransaction(tx.serialize(true)).execute(this.global.RPCDomain);
            if (!res.result ||
                (res.result && typeof res.result === 'object' && res.result.succeed === false)) {
                throw {
                    msg: 'Transaction rejected by RPC node.'
                };
            }
            this.creating = false;
            if (this.fromAddress !== this.toAddress) {
                const txTarget = {
                    txid: '0x' + tx.hash,
                    value: -this.amount,
                    block_time: new Date().getTime() / 1000
                };
                this.pushTransaction(txTarget);
            }
            // todo transfer done
            this.global.log('transfer done', 'res');
            this.dialog.open(PopupTransferSuccessDialogComponent, {
                panelClass: 'custom-dialog-panel'
            }).afterClosed().subscribe(() => {
                history.go(-1);
            })
            return res;
        }
        catch (err) {
            this.creating = false;
            this.global.snackBarTip('transferFailed', err.msg || err);
        }
    }

    public pushTransaction(transaction: any) {
        const net = this.net;
        const address = this.fromAddress;
        const assetId = this.assetId;
        this.chrome.getTransaction().subscribe(async res => {
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
            const setData = {};
            setData[`${this.net}TxArr`] = await this.chrome.getLocalStorage(`${this.net}TxArr`) || [];
            setData[`${this.net}TxArr`].push(transaction.txid);
            this.chrome.setLocalStorage(setData);
        });
    }

    public selectToAddress() {
        this.dialog.open(PopupAddressDialogComponent, {
            data: {},
            maxHeight: 500,
            panelClass: 'custom-dialog-panel'
        }).afterClosed().subscribe((address: string) => {
            this.toAddress = address;
        });
    }

    public selectAsset() {
        if (this.balances.length > 0) {
            this.dialog.open(PopupAssetDialogComponent, {
                data: {
                    balances: this.balances,
                    selected: this.balances.findIndex(item => item.asset_id === this.assetId)
                },
                maxHeight: 500,
                panelClass: 'custom-dialog-panel'
            }).afterClosed().subscribe(async (index: number) => {
                if (index === undefined) {
                    return
                }
                this.chooseAsset = this.balances[index];
                this.assetId = this.chooseAsset.asset_id;
                this.assetLogoUrl = await this.asset.getAssetImage(this.assetId);
            });
        }
    }

    public getAddresSub() {
        if (wallet.isAddress(this.toAddress)) {
            return `${this.toAddress.substr(0, 6)}...${this.toAddress.substr(this.toAddress.length - 7, this.toAddress.length - 1)} `
        } else {
            return ''
        }
    }

    public numberCheck(event) {
        const inputStr = String.fromCharCode(event.keyCode);
        let re = /^[0-9\.]+$/;
        if (this.amount !== undefined && this.amount.indexOf('.') >= 0) {
            re = /^[0-9]+$/;
        }
        if (!re.test(inputStr)) {
            return false;
        }
    }

    public editFee() {
        this.dialog.open(PopupEditFeeDialogComponent, {
            panelClass: 'custom-dialog-panel',
            data: {
                fee: this.fee,
                speedFee: this.gasFeeSpeed
            }
        }).afterClosed().subscribe(res => {
            if (typeof res === 'number') {
                this.fee = res;
            }
        })
    }
}
