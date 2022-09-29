import { Component, OnInit } from '@angular/core';
import { Router, ActivatedRoute } from '@angular/router';
import { GAS, Asset, NftToken } from '@/models/models';
import {
    AssetState,
    NeonService,
    GlobalService,
    HttpService,
    ChromeService,
    TransactionState,
    NftState,
    LedgerService,
    UtilServiceState,
} from '@/app/core';
import { MatDialog } from '@angular/material/dialog';
import { TransferService } from '../transfer.service';
import { Transaction } from '@cityofzion/neon-core/lib/tx';
import { Transaction as Transaction3 } from '@cityofzion/neon-core-neo3/lib/tx';
import { wallet as wallet2 } from '@cityofzion/neon-core';
import { wallet as wallet3 } from '@cityofzion/neon-core-neo3';
import {
    PopupAddressDialogComponent,
    PopupAssetDialogComponent,
    PopupTransferSuccessDialogComponent,
    PopupEditFeeDialogComponent,
} from '../../_dialogs';
import { PopupTransferConfirmComponent } from '../confirm/confirm.component';
import { bignumber } from 'mathjs';
import { GasFeeSpeed } from '../../_lib/type';
import { Neo3TransferService } from '../neo3-transfer.service';
import { GAS3_CONTRACT, STORAGE_NAME, LedgerStatuses } from '../../_lib';
import { interval, forkJoin } from 'rxjs';
import BigNumber from 'bignumber.js';

@Component({
    templateUrl: 'create.component.html',
    styleUrls: ['create.component.scss'],
})
export class TransferCreateComponent implements OnInit {
    public amount: string;
    public fee: any;
    public loading = false;
    public loadingMsg: string;
    gasFeeSpeed: GasFeeSpeed;
    public fromAddress: string;
    public toAddress: string;
    nnsAddress: string;
    public creating: boolean = false;

    public chooseAsset: Asset;

    public balances: Array<Asset> = [];
    public assetId: string;
    public networkId: number;

    istransferAll = false;

    nftContract: string;
    nftTokens: NftToken[];
    chooseNftToken: NftToken;
    getStatusInterval;
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
        private txState: TransactionState,
        private neo3Transfer: Neo3TransferService,
        private nftState: NftState,
        private ledger: LedgerService,
        private util: UtilServiceState
    ) {
        switch (this.neon.currentWalletChainType) {
            case 'Neo2':
                this.networkId = this.global.n2Network.id;
                break;
            case 'Neo3':
                this.networkId = this.global.n3Network.id;
                break;
        }
    }

    ngOnInit(): void {
        this.fromAddress = this.neon.address;
        this.aRoute.params.subscribe((params) => {
            if (params.nftContract) {
                this.nftContract = params.nftContract;
                this.getNftTokens();
            } else {
                if (params.id) {
                    this.asset
                        .getAssetDetail(this.neon.address, params.id)
                        .then(async (res: Asset) => {
                            res.balance = bignumber(res.balance).toFixed();
                            this.chooseAsset = res;
                            this.assetId = res.asset_id;
                        });
                }
                this.getAddressAllBalances(params);
            }
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

    async getAddressAllBalances(params) {
        const getMoneyBalance = this.asset.getAddressBalances(
            this.neon.address
        );
        const getWatch = this.chrome.getWatch(
            this.networkId,
            this.neon.address
        );
        forkJoin([getMoneyBalance, getWatch]).subscribe((res) => {
            const [moneyAssets, watch] = [...res];
            let showAssets = [...moneyAssets];
            watch.forEach(async (item) => {
                const index = moneyAssets.findIndex(
                    (m) => m.asset_id === item.asset_id
                );
                if (index >= 0) {
                    if (item.watching === false) {
                        showAssets.splice(index, 1);
                    }
                } else {
                    if (item.watching === true) {
                        const balance = await this.asset.getAddressAssetBalance(
                            this.neon.address,
                            item.asset_id,
                            this.neon.currentWalletChainType
                        );
                        if (new BigNumber(balance).comparedTo(0) > 0) {
                            const decimals = await this.util.getAssetDecimals(
                                [item.asset_id],
                                this.neon.currentWalletChainType
                            );
                            item.balance = new BigNumber(balance)
                                .shiftedBy(-decimals[0])
                                .toFixed();
                            showAssets.push(item);
                        }
                    }
                }
            });
            this.balances = showAssets;
            if (!params.id) {
                this.assetId = this.balances[0].asset_id;
                this.chooseAsset = this.balances[0];
            }
        });
    }

    getNftTokens() {
        this.nftState
            .getNftTokens(this.neon.address, this.nftContract)
            .then((res) => {
                this.nftTokens = res.tokens;
                this.chooseNftToken = this.nftTokens[0];
                this.assetId = this.chooseNftToken.tokenid;
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

        if (this.nftContract) {
            this.nftSubmit();
            return;
        }

        if (
            this.chooseAsset.balance === undefined ||
            bignumber(this.chooseAsset.balance).comparedTo(0) === -1
        ) {
            this.global.snackBarTip('balanceLack');
            return;
        }

        try {
            bignumber(this.amount);
        } catch (error) {
            this.global.snackBarTip('checkInput');
            return;
        }

        if (
            bignumber(this.chooseAsset.balance.toString()).comparedTo(
                bignumber(this.amount.toString())
            ) === -1
        ) {
            this.global.snackBarTip('balanceLack');
            return;
        }

        this.creating = true;
        this.loading = true;
        this.transfer
            .create(
                this.fromAddress,
                this.nnsAddress || this.toAddress,
                this.chooseAsset.asset_id,
                this.amount,
                this.fee || 0,
                this.chooseAsset.decimals
            )
            .subscribe(
                (res) => {
                    this.global.log('start transfer');
                    this.resolveSign(res);
                    this.loading = false;
                },
                (err) => {
                    this.creating = false;
                    this.loading = false;
                    if (this.neon.currentWalletChainType === 'Neo3' && err) {
                        this.global.snackBarTip('wentWrong', err, 10000);
                    } else {
                        this.global.snackBarTip('wentWrong', err);
                    }
                }
            );
    }

    private nftSubmit() {
        this.creating = true;
        this.loading = true;
        this.transfer
            .create(
                this.fromAddress,
                this.nnsAddress || this.toAddress,
                this.nftContract,
                this.chooseNftToken.amount,
                this.fee || 0,
                0,
                false,
                this.chooseNftToken.tokenid
            )
            .subscribe(
                (res) => {
                    this.global.log('start transfer');
                    this.resolveNftSign(res);
                    this.loading = false;
                },
                (err) => {
                    this.creating = false;
                    this.loading = false;
                    this.global.snackBarTip('wentWrong', err, 10000);
                }
            );
    }

    public cancel() {
        history.go(-1);
    }

    private resolveNftSign(tx: Transaction | Transaction3) {
        try {
            const diaglogData: any = {
                fromAddress: this.fromAddress,
                toAddress: this.nnsAddress || this.toAddress,
                asset: this.nftContract,
                symbol: this.chooseNftToken.symbol,
                amount: this.chooseNftToken.amount,
                fee: this.fee || '0',
                networkId: this.networkId,
                txSerialize: tx.serialize(false),
            };
            if (this.nnsAddress) {
                diaglogData.NeoNSName = this.toAddress;
            }
            diaglogData.systemFee = (tx as Transaction3).systemFee.toString();
            diaglogData.networkFee = bignumber(
                (tx as Transaction3).networkFee.toString()
            )
                .minus(this.fee)
                .toFixed();
            this.dialog
                .open(PopupTransferConfirmComponent, {
                    panelClass: 'custom-dialog-panel-full',
                    height: '600px',
                    width: '100%',
                    hasBackdrop: false,
                    maxWidth: '400px',
                    autoFocus: false,
                    data: diaglogData,
                })
                .afterClosed()
                .subscribe((isConfirm) => {
                    this.creating = false;
                    if (isConfirm !== false) {
                        if (this.fee != isConfirm) {
                            this.fee = isConfirm;
                            this.transfer
                                .create(
                                    this.fromAddress,
                                    this.nnsAddress || this.toAddress,
                                    this.nftContract,
                                    this.amount,
                                    this.fee || 0,
                                    this.chooseAsset.decimals || 0,
                                    false,
                                    this.chooseNftToken.tokenid
                                )
                                .subscribe(
                                    (res) => {
                                        this.getSignTx(res, true);
                                    },
                                    (err) => {
                                        console.log(err);
                                        if (
                                            this.neon.currentWalletChainType ===
                                                'Neo3' &&
                                            err
                                        ) {
                                            this.global.snackBarTip(
                                                'wentWrong',
                                                err,
                                                10000
                                            );
                                        } else {
                                            this.global.snackBarTip(
                                                'wentWrong',
                                                err
                                            );
                                        }
                                    }
                                );
                        } else {
                            this.getSignTx(tx, true);
                        }
                    }
                });
        } catch (error) {
            console.log(tx, error);
            this.creating = false;
            this.global.snackBarTip('signFailed', error);
        }
    }

    private getLedgerStatus(tx, isNft = false) {
        this.ledger
            .getDeviceStatus(this.neon.currentWalletChainType)
            .then(async (res) => {
                this.loadingMsg =
                    this.neon.currentWalletChainType === 'Neo2'
                        ? LedgerStatuses[res].msg
                        : LedgerStatuses[res].msgNeo3 ||
                          LedgerStatuses[res].msg;
                if (LedgerStatuses[res] === LedgerStatuses.READY) {
                    this.getStatusInterval.unsubscribe();
                    this.loadingMsg = 'signTheTransaction';
                    this.ledger
                        .getLedgerSignedTx(
                            tx,
                            this.neon.wallet,
                            this.neon.currentWalletChainType,
                            this.global.n3Network.magicNumber
                        )
                        .then((tx) => {
                            this.loading = false;
                            this.loadingMsg = '';
                            isNft
                                ? this.resolveNftSend(tx)
                                : this.resolveSend(tx);
                        })
                        .catch((error) => {
                            this.loading = false;
                            this.loadingMsg = '';
                            this.ledger.handleLedgerError(error);
                        });
                }
            });
    }

    private getSignTx(tx: Transaction | Transaction3, isNft = false) {
        if (this.neon.wallet.accounts[0]?.extra?.ledgerSLIP44) {
            this.loading = true;
            this.loadingMsg = LedgerStatuses.DISCONNECTED.msg;
            this.getLedgerStatus(tx, isNft);
            this.getStatusInterval = interval(5000).subscribe(() => {
                this.getLedgerStatus(tx, isNft);
            });
            return;
        }
        const wif =
            this.neon.WIFArr[
                this.neon.walletArr.findIndex(
                    (item) =>
                        item.accounts[0].address ===
                        this.neon.wallet.accounts[0].address
                )
            ];
        switch (this.neon.currentWalletChainType) {
            case 'Neo2':
                tx.sign(wif);
                break;
            case 'Neo3':
                tx.sign(wif, this.global.n3Network.magicNumber);
                break;
        }
        isNft ? this.resolveNftSend(tx) : this.resolveSend(tx);
    }

    private async resolveSign(tx: Transaction | Transaction3) {
        try {
            this.global.log('unsigned tx', tx.export());
            const diaglogData: any = {
                fromAddress: this.fromAddress,
                toAddress: this.nnsAddress || this.toAddress,
                asset: this.assetId,
                symbol: this.chooseAsset.symbol,
                amount: this.amount,
                fee: this.fee || '0',
                networkId: this.networkId,
                txSerialize: tx.serialize(false),
            };
            if (this.nnsAddress) {
                diaglogData.NeoNSName = this.toAddress;
            }
            if (this.neon.currentWalletChainType === 'Neo3') {
                diaglogData.systemFee = (
                    tx as Transaction3
                ).systemFee.toString();
                diaglogData.networkFee = bignumber(
                    (tx as Transaction3).networkFee.toString()
                )
                    .minus(this.fee)
                    .toFixed();
            }
            this.dialog
                .open(PopupTransferConfirmComponent, {
                    panelClass: 'custom-dialog-panel-full',
                    height: '600px',
                    width: '100%',
                    hasBackdrop: false,
                    maxWidth: '400px',
                    autoFocus: false,
                    data: diaglogData,
                })
                .afterClosed()
                .subscribe(async (isConfirm) => {
                    this.creating = false;
                    if (isConfirm !== false) {
                        if (this.fee != isConfirm) {
                            this.fee = isConfirm;
                            this.transfer
                                .create(
                                    this.fromAddress,
                                    this.nnsAddress || this.toAddress,
                                    this.chooseAsset.asset_id,
                                    this.amount,
                                    this.fee || 0,
                                    this.chooseAsset.decimals
                                )
                                .subscribe(
                                    async (res) => {
                                        this.getSignTx(res);
                                    },
                                    (err) => {
                                        console.log(err);
                                        if (
                                            this.neon.currentWalletChainType ===
                                                'Neo3' &&
                                            err
                                        ) {
                                            this.global.snackBarTip(
                                                'wentWrong',
                                                err,
                                                10000
                                            );
                                        } else {
                                            this.global.snackBarTip(
                                                'wentWrong',
                                                err
                                            );
                                        }
                                    }
                                );
                        } else {
                            this.getSignTx(tx);
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
            switch (this.neon.currentWalletChainType) {
                case 'Neo2':
                    try {
                        res = await this.txState.rpcSendRawTransaction(
                            tx.serialize(true)
                        );
                    } catch (error) {
                        throw {
                            msg: 'Transaction rejected by RPC node.',
                        };
                    }
                    txid = '0x' + tx.hash;
                    break;
                case 'Neo3':
                    try {
                        res = await this.neo3Transfer.sendNeo3Tx(
                            tx as Transaction3
                        );
                    } catch (error) {
                        throw {
                            msg: 'Transaction rejected by RPC node.',
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
                    block_time: Math.floor(new Date().getTime() / 1000),
                };
                this.pushTransaction(txTarget);
            }
            // todo transfer done
            this.global.log('transfer done', 'res');
            this.dialog
                .open(PopupTransferSuccessDialogComponent, {
                    panelClass: 'custom-dialog-panel',
                })
                .afterClosed()
                .subscribe(() => {
                    history.go(-1);
                });
            this.loading = false;
            this.loadingMsg = '';
            return res;
        } catch (err) {
            this.creating = false;
            this.global.handlePrcError(err, 'Neo2');
        }
        this.loading = false;
        this.loadingMsg = '';
    }

    private async resolveNftSend(tx: Transaction | Transaction3) {
        this.loading = true;
        this.loadingMsg = 'Wait';
        try {
            let res;
            let txid: string;
            res = await this.neo3Transfer.sendNeo3Tx(tx as Transaction3);
            if (!res) {
                throw {
                    msg: 'Transaction rejected by RPC node.',
                };
            }
            txid = res;
            this.creating = false;
            if (this.fromAddress !== this.toAddress) {
                const txTarget = {
                    txid,
                    value: -this.chooseNftToken.amount,
                    block_time: new Date().getTime(),
                    token_id: this.chooseNftToken.tokenid,
                };
                this.pushTransaction(txTarget);
            }
            // todo transfer done
            this.global.log('transfer done', 'res');
            this.dialog
                .open(PopupTransferSuccessDialogComponent, {
                    panelClass: 'custom-dialog-panel',
                })
                .afterClosed()
                .subscribe(() => {
                    history.go(-1);
                });
            this.loading = false;
            this.loadingMsg = '';
            return res;
        } catch (err) {
            this.creating = false;
            this.global.handlePrcError(err.error, 'Neo2');
        }
        this.loading = false;
        this.loadingMsg = '';
    }

    public pushTransaction(transaction: any) {
        const networkId = this.networkId;
        const address = this.fromAddress;
        const assetId = this.assetId;
        this.chrome
            .getStorage(STORAGE_NAME.transaction)
            .subscribe(async (res) => {
                if (res === null || res === undefined) {
                    res = {};
                }
                if (res[networkId] === undefined) {
                    res[networkId] = {};
                }
                if (res[networkId][address] === undefined) {
                    res[networkId][address] = {};
                }
                if (res[networkId][address][assetId] === undefined) {
                    res[networkId][address][assetId] = [];
                }
                res[networkId][address][assetId].unshift(transaction);
                this.chrome.setStorage(STORAGE_NAME.transaction, res);
                const setData = {};
                setData[`TxArr_${networkId}`] =
                    (await this.chrome.getLocalStorage(`TxArr_${networkId}`)) ||
                    [];
                setData[`TxArr_${networkId}`].push(transaction.txid);
                this.chrome.setLocalStorage(setData);
            });
    }

    public selectToAddress() {
        this.dialog
            .open(PopupAddressDialogComponent, {
                data: {},
                maxHeight: 500,
                panelClass: 'custom-dialog-panel',
            })
            .afterClosed()
            .subscribe((res) => {
                if (typeof res === 'string') {
                    this.toAddress = res;
                    this.nnsAddress = null;
                }
                if (typeof res === 'object') {
                    this.toAddress = res.address;
                    this.nnsAddress = res.nnsAddress;
                }
            });
    }

    public selectAsset() {
        if (this.balances.length > 0) {
            this.dialog
                .open(PopupAssetDialogComponent, {
                    data: {
                        balances: this.balances,
                        selected: this.balances.findIndex(
                            (item) => item.asset_id === this.assetId
                        ),
                    },
                    maxHeight: 500,
                    panelClass: 'custom-dialog-panel',
                })
                .afterClosed()
                .subscribe(async (index: number) => {
                    if (index === undefined) {
                        return;
                    }
                    this.chooseAsset = this.balances[index];
                    this.assetId = this.chooseAsset.asset_id;
                });
        }
    }

    selectNftAsset() {
        if (this.nftTokens.length > 0) {
            this.dialog
                .open(PopupAssetDialogComponent, {
                    data: {
                        isNft: true,
                        nftTokens: this.nftTokens,
                        selected: this.nftTokens.findIndex(
                            (item) =>
                                item.tokenid === this.chooseNftToken.tokenid
                        ),
                    },
                    maxHeight: 500,
                    panelClass: 'custom-dialog-panel',
                })
                .afterClosed()
                .subscribe(async (index: number) => {
                    if (index === undefined) {
                        return;
                    }
                    this.chooseNftToken = this.nftTokens[index];
                    this.assetId = this.nftContract;
                });
        }
    }

    public getAddresSub() {
        if (
            this.neon.currentWalletChainType === 'Neo2'
                ? wallet2.isAddress(this.toAddress)
                : wallet3.isAddress(this.toAddress, 53)
        ) {
            return `${this.toAddress.substr(0, 6)}...${this.toAddress.substr(
                this.toAddress.length - 7,
                this.toAddress.length - 1
            )} `;
        } else {
            return this.toAddress;
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
        this.dialog
            .open(PopupEditFeeDialogComponent, {
                panelClass: 'custom-dialog-panel',
                data: {
                    fee: this.fee,
                    speedFee: this.gasFeeSpeed,
                },
            })
            .afterClosed()
            .subscribe((res) => {
                if (res !== false) {
                    this.fee = res;
                }
            });
    }

    // 点击转全部资产
    transferAll(fee = this.fee || 0) {
        if (this.istransferAll) {
            return;
        }
        this.istransferAll = true;
        // 不是 GAS 资产时
        if (
            this.chooseAsset.asset_id !== GAS &&
            this.chooseAsset.asset_id !== GAS3_CONTRACT
        ) {
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
            addressTo: this.fromAddress,
            tokenScriptHash: this.chooseAsset.asset_id,
            amount: tempAmount,
            networkFee: fee,
            decimals: this.chooseAsset.decimals,
        };
        this.loading = true;
        this.neo3Transfer.createNeo3Tx(param, true).subscribe(
            (tx) => {
                this.amount = bignumber(this.chooseAsset.balance)
                    .minus(tx.networkFee.toString())
                    .minus(tx.systemFee.toString())
                    .toString();
                this.fee = fee;
                this.loading = false;
                this.istransferAll = false;
            },
            () => {
                this.loading = false;
                this.istransferAll = false;
            }
        );
    }

    getInputAddressTip() {
        if (this.neon.currentWalletChainType === 'Neo2') {
            return 'inputNeo2AddressTip';
        } else {
            if (this.networkId === 6 || this.networkId === 3) {
                return 'inputN3NNSAddressTip';
            }
            return 'inputN3AddressTip';
        }
    }
}
