import { Component, OnInit, AfterViewInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import {
    AssetState,
    NeonService,
    HttpService,
    GlobalService,
    ChromeService,
    TransactionState,
    TransferService,
} from '@/app/core';
import { Balance, NEO, GAS } from '@/models/models';
import { tx as tx2, u } from '@cityofzion/neon-js';
import { Transaction } from '@cityofzion/neon-core/lib/tx';
import { ERRORS, requestTarget, TxHashAttribute } from '@/models/dapi';
import { rpc } from '@cityofzion/neon-js';
import { MatDialog } from '@angular/material/dialog';
import { PopupEditFeeDialogComponent } from '../../_dialogs';
import { bignumber } from 'mathjs';
import { GasFeeSpeed, RpcNetwork } from '../../_lib/type';
import { STORAGE_NAME } from '../../_lib';
import BigNumber from 'bignumber.js';

@Component({
    templateUrl: 'transfer.component.html',
    styleUrls: ['transfer.component.scss'],
})
export class PopupNoticeTransferComponent implements OnInit, AfterViewInit {
    NEO = NEO;
    public dataJson: any = {};
    public rateCurrency = '';
    public txSerialize = '';
    public tx: Transaction;
    public money = '';
    public feeMoney = '0';
    public totalMoney = '';

    public balance: Balance;
    public creating = false;
    public fromAddress: string = '';
    public toAddress: string = '';
    public assetId: string = '';
    public symbol: string = '';
    public amount: string = '0';
    public remark: string = '';
    public n2Network: RpcNetwork;
    public loading = false;
    public loadingMsg: string;
    public wallet: any;
    private txHashAttributes: TxHashAttribute[] = null;

    public fee: number;
    public init = false;
    private broadcastOverride = false;
    private messageID = 0;

    constructor(
        private router: Router,
        private aRoute: ActivatedRoute,
        private asset: AssetState,
        private transfer: TransferService,
        private neon: NeonService,
        private http: HttpService,
        private global: GlobalService,
        private chrome: ChromeService,
        private txState: TransactionState,
        private dialog: MatDialog
    ) {}

    ngOnInit(): void {
        this.n2Network = this.global.n2Network;
        this.rateCurrency = this.asset.rateCurrency;
        this.fromAddress = this.neon.address;
        this.wallet = this.neon.wallet;
        this.aRoute.queryParams.subscribe((params: any) => {
            const pramsData = JSON.parse(JSON.stringify(params));
            this.dataJson = JSON.stringify(params);
            this.messageID = params.messageID;
            if (JSON.stringify(params) === '{}') {
                return;
            }
            for (const key in pramsData) {
                if (Object.prototype.hasOwnProperty.call(pramsData, key)) {
                    let tempObject: any;
                    try {
                        tempObject = pramsData[key]
                            .replace(/([a-zA-Z0-9]+?):/g, '"$1":')
                            .replace(/'/g, '"');
                        tempObject = JSON.parse(tempObject);
                    } catch (error) {
                        tempObject = pramsData[key];
                    }
                    pramsData[key] = tempObject;
                }
            }
            this.dataJson = pramsData;
            this.dataJson.messageID = undefined;
            this.broadcastOverride =
                params.broadcastOverride === 'true' ||
                params.broadcastOverride === true;
            window.onbeforeunload = () => {
                this.chrome.windowCallback({
                    error: ERRORS.CANCELLED,
                    return: requestTarget.Send,
                    ID: this.messageID,
                });
            };
            this.toAddress = params.toAddress || '';
            this.assetId = params.asset || '';
            this.amount = params.amount || 0;
            this.symbol = params.symbol || '';
            if (
                this.txHashAttributes === null &&
                this.dataJson.txHashAttributes !== undefined
            ) {
                this.txHashAttributes = this.dataJson.txHashAttributes;
            }
            // this.fee = params.fee || 0;
            if (params.fee) {
                this.fee = parseFloat(params.fee);
            } else {
                if (this.asset.gasFeeSpeed) {
                    this.fee = Number(this.asset.gasFeeSpeed.propose_price);
                } else {
                    this.asset.getGasFee().subscribe((res: GasFeeSpeed) => {
                        this.fee = Number(res.propose_price);
                    });
                }
            }
            this.remark = params.remark || '';
            if (this.assetId !== undefined && this.assetId !== '') {
                this.asset
                    .getAssetDetail(this.neon.address, this.assetId)
                    .then((res: Balance) => {
                        this.init = true;
                        this.symbol = res.symbol;
                        this.balance = res;
                        this.submit();
                        this.getAssetRate();
                    });
            } else {
                this.asset.getAddressBalances(this.neon.address).then((res) => {
                    const filterAsset = res.filter(
                        (item) => item.asset_id === params.asset
                    );
                    if (filterAsset.length > 0) {
                        this.init = true;
                        this.symbol = filterAsset[0].symbol;
                        this.balance = filterAsset[0];
                    } else {
                        this.global.snackBarTip('balanceLack');
                        return;
                    }
                    this.submit();
                    this.getAssetRate();
                });
            }
        });
    }

    ngAfterViewInit(): void {}

    public submit() {
        this.loading = true;
        this.loadingMsg = 'Loading';
        if (
            this.balance.balance === undefined ||
            bignumber(this.balance.balance).comparedTo(0) < 1
        ) {
            this.global.snackBarTip('balanceLack');
            return;
        }
        if (
            bignumber(this.balance.balance.toString()).comparedTo(
                bignumber(this.amount.toString())
            ) === -1 ||
            this.amount === '0'
        ) {
            this.global.snackBarTip('balanceLack');
            return;
        }
        this.creating = true;
        this.asset
            .getAssetDetail(this.neon.address, this.assetId)
            .then((res: Balance) => {
                this.loading = false;
                this.loadingMsg = '';
                this.balance = res;
                this.transfer
                    .create(
                        this.fromAddress,
                        this.toAddress,
                        this.assetId,
                        this.amount,
                        this.fee,
                        res.decimals,
                        this.broadcastOverride
                    )
                    .subscribe(
                        (tx) => {
                            if (this.remark !== '') {
                                tx.addAttribute(
                                    tx2.TxAttrUsage.Remark2,
                                    u.str2hexstring(this.remark)
                                );
                            }
                            if (this.txHashAttributes !== null) {
                                this.txHashAttributes.forEach((item, index) => {
                                    const info = this.neon.parseTxHashAttr(
                                        this.txHashAttributes[index],
                                        true
                                    );
                                    if (tx2.TxAttrUsage[info.txAttrUsage]) {
                                        tx.addAttribute(
                                            tx2.TxAttrUsage[info.txAttrUsage],
                                            info.value
                                        );
                                    }
                                });
                            }
                            this.resolveSign(tx);
                        },
                        (err) => {
                            this.creating = false;
                            this.global.snackBarTip('wentWrong');
                        }
                    );
            });
    }

    public cancel() {
        this.chrome.windowCallback({
            error: ERRORS.CANCELLED,
            return: requestTarget.Send,
            ID: this.messageID,
        });
        window.close();
    }

    private resolveSign(transaction: Transaction) {
        this.loading = true;
        this.loadingMsg = 'Wait';
        try {
            const wif =
                this.neon.WIFArr[
                    this.neon.walletArr.findIndex(
                        (item) =>
                            item.accounts[0].address ===
                            this.neon.wallet.accounts[0].address
                    )
                ];
            try {
                transaction.sign(wif);
            } catch (error) {
                console.log(error);
            }
            this.tx = transaction;
            this.txSerialize = this.tx.serialize(true);
            this.loading = false;
            this.loadingMsg = '';
            this.creating = false;
        } catch (error) {
            this.loading = false;
            this.loadingMsg = '';
            this.creating = false;
            this.global.snackBarTip('verifyFailed', error);
            this.chrome.windowCallback({
                error: { ...ERRORS.DEFAULT, description: error?.message || error },
                return: requestTarget.Invoke,
                ID: this.messageID,
            });
            window.close();
        }
    }

    private resolveSend(tx: Transaction) {
        this.loadingMsg = 'Wait';
        this.loading = true;
        return this.txState
            .rpcSendRawTransaction(tx.serialize(true))
            .then(async (res) => {
                if (
                    !res
                ) {
                    throw {
                        msg: 'Transaction rejected by RPC node.',
                    };
                }
                this.loading = false;
                this.loadingMsg = '';
                this.creating = false;
                if (this.fromAddress !== this.toAddress) {
                    const txTarget = {
                        txid: '0x' + tx.hash,
                        value: -this.amount,
                        block_time: new Date().getTime() / 1000,
                    };
                    this.pushTransaction(txTarget);
                }
                this.chrome.windowCallback({
                    data: {
                        txid: tx.hash,
                        nodeUrl: `${this.global.n2Network.rpcUrl}`,
                    },
                    return: requestTarget.Send,
                    ID: this.messageID,
                });
                const setData = {};
                setData[`${this.n2Network.network}TxArr`] =
                    (await this.chrome.getLocalStorage(
                        `${this.n2Network.network}TxArr`
                    )) || [];
                setData[`${this.n2Network.network}TxArr`].push('0x' + tx.hash);
                this.chrome.setLocalStorage(setData);
                this.router.navigate([
                    {
                        outlets: {
                            transfer: ['transfer', 'result'],
                        },
                    },
                ]);
            })
            .catch((err) => {
                this.loading = false;
                this.loadingMsg = '';
                this.creating = false;
                this.chrome.windowCallback({
                    error: { ...ERRORS.RPC_ERROR, description: err },
                    return: requestTarget.Send,
                    ID: this.messageID,
                });
                this.global.handlePrcError(err, 'Neo2');
            });
    }

    public pushTransaction(transaction: object) {
        const net = this.n2Network.network;
        const address = this.fromAddress;
        const assetId = this.assetId;
        this.chrome.getStorage(STORAGE_NAME.transaction).subscribe((res) => {
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
            this.chrome.setStorage(STORAGE_NAME.transaction, res);
        });
    }

    public async getAssetRate() {
        if (Number(this.fee) > 0) {
            const rate = await this.asset.getAssetRate('GAS', GAS);
            this.feeMoney = new BigNumber(this.fee).times(rate || 0).toFixed();
        }
        const assetRate = await this.asset.getAssetRate(this.symbol, this.assetId)
        this.money = new BigNumber(this.amount).times(assetRate || 0).toFixed();
        this.totalMoney = this.global
            .mathAdd(Number(this.feeMoney), Number(this.money))
            .toString();
    }

    public exit() {
        this.chrome.windowCallback({
            error: ERRORS.CANCELLED,
            return: requestTarget.Send,
            ID: this.messageID,
        });
        window.close();
    }

    public confirm() {
        if (this.creating) {
            return;
        }
        if (this.broadcastOverride) {
            this.loading = false;
            this.loadingMsg = '';
            this.chrome.windowCallback({
                data: {
                    txid: this.tx.hash,
                    signedTx: this.tx.serialize(true),
                },
                return: requestTarget.Send,
                ID: this.messageID,
            });
            window.close();
        } else {
            this.resolveSend(this.tx);
        }
    }
    public editFee() {
        this.dialog
            .open(PopupEditFeeDialogComponent, {
                panelClass: 'custom-dialog-panel',
                data: {
                    fee: this.fee,
                },
            })
            .afterClosed()
            .subscribe((res) => {
                if (res !== false) {
                    this.fee = res;
                    if (res === 0 || res === '0') {
                        this.feeMoney = '0';
                    } else {
                        this.asset
                            .getAssetRate('GAS', GAS)
                            .then((rate) => {
                                this.feeMoney = new BigNumber(this.fee).times(rate || 0).toFixed();
                                this.totalMoney = this.global
                                    .mathAdd(
                                        Number(this.feeMoney),
                                        Number(this.money)
                                    )
                                    .toString();
                            });
                    }
                    this.submit();
                }
            });
    }

    public getAddressSub(address: string) {
        return `${address.substr(0, 3)}...${address.substr(
            address.length - 4,
            address.length - 1
        )} `;
    }
}
