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
import {
    Transaction as Transaction3
} from '@cityofzion/neon-core-neo3/lib/tx';
import { wallet as wallet2 } from '@cityofzion/neon-core';
import { wallet as wallet3 } from '@cityofzion/neon-core-neo3';
import { rpc } from '@cityofzion/neon-js';
import { PopupAddressDialogComponent, PopupAssetDialogComponent, PopupTransferSuccessDialogComponent, PopupEditFeeDialogComponent } from '../../_dialogs';
import { PopupTransferConfirmComponent } from '../confirm/confirm.component';
import { bignumber } from 'mathjs';
import { GasFeeSpeed } from '../../_lib/type';
import { Neo3TransferService } from '../neo3-transfer.service';
import { GAS3_CONTRACT, NEO3_MAGIC_NUMBER } from '../../_lib';

@Component({
    templateUrl: 'create.component.html',
    styleUrls: ['create.component.scss']
})
export class TransferCreateComponent implements OnInit {
    neonWallet: any = wallet2;

    public amount: string;
    public fee: any;
    public loading = false;
    public loadingMsg: string;
    gasFeeSpeed: GasFeeSpeed;
    public fromAddress: string;
    public toAddress: string;
    public creating: boolean = false;

    public assetLogoUrl = '';
    public chooseAsset: Asset;

    public balances: Array<Asset> = [];
    public assetId: string;
    public net: string;

    istransferAll = false;
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
        private txState: TransactionState,
        private neo3Transfer: Neo3TransferService,
    ) {
        switch(this.neon.currentWalletChainType) {
            case 'Neo2':
                this.neonWallet = wallet2;
                break;
            case 'Neo3':
                this.neonWallet = wallet3;
                break;
        }
    }

    ngOnInit(): void {
        this.net = this.global.net;
        this.fromAddress = this.neon.address;
        this.aRoute.params.subscribe((params) => {
            if (params.id) {
                this.asset.detail(this.neon.address, params.id).subscribe(async (res: Asset) => {
                    res.balance = bignumber(res.balance).toFixed();
                    this.chooseAsset = res;
                    this.assetId = res.asset_id;
                    this.assetLogoUrl = await this.asset.getAssetImage(res);
                });
            }
            this.asset.fetchBalance(this.neon.address).subscribe(async balanceArr => {
                this.balances = balanceArr;
                if (!params.id) {
                    this.assetId = this.balances[0].asset_id;
                    this.chooseAsset = this.balances[0];
                    this.assetLogoUrl = await this.asset.getAssetImage(this.balances[0]);
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
        if (this.neonWallet.isAddress(this.toAddress) === false) {
            this.global.snackBarTip('wrongAddress');
            return;
        }
        if (this.chooseAsset.balance === undefined || bignumber(this.chooseAsset.balance).comparedTo(0) === -1) {
            this.global.snackBarTip('balanceLack');
            return;
        }

        try {
            bignumber(this.amount)
        } catch (error) {
            this.global.snackBarTip('checkInput');
            return;
        }

        if (bignumber(this.chooseAsset.balance.toString()).comparedTo(bignumber(this.amount.toString())) === -1) {
            this.global.snackBarTip('balanceLack');
            return;
        }

        this.creating = true;
        this.loading = true;
        this.transfer.create(this.fromAddress, this.toAddress, this.chooseAsset.asset_id, this.amount,
            this.fee || 0, this.chooseAsset.decimals).subscribe((res) => {
                this.global.log('start transfer');
                this.resolveSign(res);
                this.loading = false;
            }, (err) => {
                this.creating = false;
                this.loading = false;
                if (this.neon.currentWalletChainType === 'Neo3' && err) {
                    this.global.snackBarTip('wentWrong', err, 10000);
                } else {
                    this.global.snackBarTip('wentWrong', err);
                }
            });
    }

    public cancel() {
        history.go(-1);
    }

    private resolveSign(tx: Transaction | Transaction3) {
        try {
            const wif = this.neon.WIFArr[
                this.neon.walletArr.findIndex(item => item.accounts[0].address === this.neon.wallet.accounts[0].address)
            ]
            switch(this.neon.currentWalletChainType) {
                case 'Neo2':
                    tx.sign(wif);
                    break;
                case 'Neo3':
                    tx.sign(wif, NEO3_MAGIC_NUMBER[this.net]);
                    break;
            }
            this.global.log('signed tx', tx);
            const diaglogData: any = {
                fromAddress: this.fromAddress,
                toAddress: this.toAddress,
                asset: this.assetId,
                symbol: this.chooseAsset.symbol,
                amount: this.amount,
                fee: this.fee || '0',
                network: this.net,
                txSerialize: tx.serialize(true)
            };
            if (this.neon.currentWalletChainType === 'Neo3') {
                diaglogData.systemFee = (tx as Transaction3).systemFee.toString();
                diaglogData.networkFee = bignumber((tx as Transaction3).networkFee.toString()).minus(this.fee).toFixed();
            }
            this.dialog.open(PopupTransferConfirmComponent, {
                panelClass: 'custom-dialog-panel-full',
                height: '600px',
                width: '100%',
                hasBackdrop: false,
                maxWidth: '400px',
                autoFocus: false,
                data: diaglogData
            }).afterClosed().subscribe((isConfirm) => {
                this.creating = false;
                if (isConfirm !== false) {
                    if (this.fee != isConfirm) {
                        this.fee = isConfirm;
                        this.transfer.create(this.fromAddress, this.toAddress, this.chooseAsset.asset_id, this.amount,
                            this.fee || 0, this.chooseAsset.decimals).subscribe((res) => {
                                switch(this.neon.currentWalletChainType) {
                                    case 'Neo2':
                                        res.sign(wif);
                                        break;
                                    case 'Neo3':
                                        res.sign(wif, NEO3_MAGIC_NUMBER[this.net]);
                                        break;
                                }
                                this.resolveSend(res);
                            }, (err) => {
                                console.log(err);
                                if (this.neon.currentWalletChainType === 'Neo3' && err) {
                                    this.global.snackBarTip('wentWrong', err, 10000);
                                } else {
                                    this.global.snackBarTip('wentWrong', err);
                                }
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
    private async resolveSend(tx: Transaction | Transaction3) {
        this.loading = true;
        this.loadingMsg = 'Wait';
        try {
            let res;
            let txid: string;
            switch(this.neon.currentWalletChainType) {
                case 'Neo2':
                    res = await this.txState.rpcSendRawTransaction(tx.serialize(true));
                    if (!res.result ||
                        (res.result && typeof res.result === 'object' && res.result.succeed === false)) {
                        throw {
                            msg: 'Transaction rejected by RPC node.'
                        };
                    }
                    txid = '0x' + tx.hash;
                    break;
                case 'Neo3':
                    res = await this.neo3Transfer.sendNeo3Tx(tx as Transaction3);
                    if (!res) {
                        throw {
                            msg: 'Transaction rejected by RPC node.'
                        };
                    }
                    txid = res;
                    break;
            }
            this.creating = false;
            if (this.fromAddress !== this.toAddress) {
                const txTarget = {
                    txid,
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
            this.loading = false;
            this.loadingMsg = '';
            return res;
        }
        catch (err) {
            this.creating = false;
            this.global.handlePrcError(err.error, 'Neo2');
        }
        this.loading = false;
        this.loadingMsg = '';
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
                this.assetLogoUrl = await this.asset.getAssetImage(this.chooseAsset);
            });
        }
    }

    public getAddresSub() {
        if (this.neonWallet.isAddress(this.toAddress)) {
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
            if (res !== false) {
                this.fee = res;
            }
        })
    }

    // 点击转全部资产
    transferAll(fee = this.fee || 0) {
        if (this.istransferAll) {
            return;
        }
        this.istransferAll = true;
        // 不是 GAS 资产时
        if (this.chooseAsset.asset_id !== GAS && this.chooseAsset.asset_id !== GAS3_CONTRACT) {
            this.amount = this.chooseAsset.balance;
            this.istransferAll = false;
            return;
        }
        const tAmount = bignumber(this.chooseAsset.balance).minus(fee);
        let tempAmount;
        if (tAmount.comparedTo(0) <= 0) {
            fee = 0;
            this.fee = 0; // 优先费大于全部资产时，小费重设为0
            tempAmount = this.chooseAsset.balance;
        } else {
            tempAmount = tAmount.toString();
        }
        // neo2 的 GAS
        if (this.chooseAsset.asset_id === GAS) {
            this.amount = tempAmount;
            this.istransferAll = false;
            return;
        }
        // neo3 的GAS
        const param = {
            addressFrom: this.fromAddress,
            addressTo: this.toAddress || this.fromAddress,
            tokenScriptHash: this.chooseAsset.asset_id,
            amount: tempAmount,
            networkFee: fee,
            decimals: this.chooseAsset.decimals,
        };
        this.loading = true;
        this.neo3Transfer.createNeo3Tx(param, true).subscribe(tx => {
            this.amount = bignumber(this.chooseAsset.balance).minus(tx.networkFee.toString()).minus(tx.systemFee.toString()).toString();
            this.fee = fee;
            this.loading = false;
            this.istransferAll = false;
        }, () => {
            this.loading = false;
            this.istransferAll = false;
        })
    }
}
