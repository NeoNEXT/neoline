import { Component, OnInit, AfterViewInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import {
    AssetState,
    NeonService,
    HttpService,
    GlobalService,
    ChromeService,
    TransactionState,
} from '@/app/core';
import { NEO } from '@/models/models';
import { Transaction as Transaction3 } from '@cityofzion/neon-core-neo3/lib/tx';
import { TransferService } from '@/app/popup/transfer/transfer.service';
import { ERRORS } from '@/models/dapi';
import { requestTargetN3 } from '@/models/dapi_neo3';
import { rpc } from '@cityofzion/neon-core-neo3/lib';
import { MatDialog } from '@angular/material/dialog';
import { PopupEditFeeDialogComponent } from '../../_dialogs';
import { GasFeeSpeed, RpcNetwork } from '../../_lib/type';
import { STORAGE_NAME } from '../../_lib';
import { Neo3TransferService } from '../../transfer/neo3-transfer.service';
import { bignumber } from 'mathjs';

@Component({
    templateUrl: 'neo3-transfer.component.html',
    styleUrls: ['neo3-transfer.component.scss'],
})
export class PopupNoticeNeo3TransferComponent implements OnInit, AfterViewInit {
    NEO = NEO;
    public rpcClient;
    public dataJson: any = {};
    public rateCurrency = '';
    public txSerialize = '';
    public tx: Transaction3;
    public money = '';
    public feeMoney = '0';
    public totalMoney = '';

    public balance: any;
    public creating = false;
    public fromAddress: string = '';
    public toAddress: string = '';
    public assetId: string = '';
    public symbol: string = '';
    public amount: string = '0';
    public remark: string = '';
    public loading = false;
    public loadingMsg: string;
    public wallet: any;

    public fee: number;
    public init = false;
    private broadcastOverride = false;
    private messageID = 0;
    public systemFee;
    public networkFee;
    public systemFeeMoney;
    public networkFeeMoney;

    public n3Network: RpcNetwork;
    public canSend = false;
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
        private dialog: MatDialog,
        private neo3Transfer: Neo3TransferService,
        private globalService: GlobalService
    ) {
        this.rpcClient = new rpc.RPCClient(this.globalService.n3Network.rpcUrl);
        this.n3Network = this.global.n3Network;
    }

    ngOnInit(): void {
        this.rateCurrency = this.asset.rateCurrency;
        this.fromAddress = this.neon.address;
        this.wallet = this.neon.wallet;
        this.aRoute.queryParams.subscribe(async (params: any) => {
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
                    return: requestTargetN3.Send,
                    ID: this.messageID,
                });
            };
            this.toAddress = params.toAddress || '';
            this.assetId = params.asset || '';
            this.amount = params.amount || 0;
            this.symbol = params.symbol || '';
            this.fee = params.fee || 0;
            if (params.fee) {
                this.fee = parseFloat(params.fee);
            } else {
                if (this.asset.gasFeeSpeed) {
                    this.fee = Number(this.asset.gasFeeSpeed.propose_price);
                } else {
                    this.asset
                        .fetchNeo3GasFee()
                        .subscribe((res: GasFeeSpeed) => {
                            this.fee = Number(res.propose_price);
                        });
                }
            }
            this.remark = params.remark || '';
            this.asset
                .getAddressBalances(this.neon.address, 'Neo3')
                .then((res) => {
                    const filterAsset = res.filter(
                        (item) => item.asset_id === params.asset
                    );
                    if (filterAsset.length > 0) {
                        this.init = true;
                        this.symbol = filterAsset[0].symbol;
                        this.balance = filterAsset[0];
                        this.submit();
                    }
                });
        });
    }

    ngAfterViewInit(): void {}

    public submit() {
        this.loading = true;
        this.loadingMsg = 'Loading';
        this.creating = true;
        this.loading = false;
        this.loadingMsg = '';
        this.transfer.create(this.fromAddress, this.toAddress, this.assetId, this.amount, this.fee, this.balance.decimals,
            this.broadcastOverride).subscribe((tx: any) => {
                this.systemFee = tx.systemFee.toFixed();
                this.networkFee = tx.networkFee.toFixed();
                this.getAssetRate();
                this.canSend = true;
                this.resolveSign(tx);
            }, (err) => {
                this.creating = false;
                this.canSend = false;
                this.global.snackBarTip(err);
            });
    }

    public cancel() {
        this.chrome.windowCallback({
            error: ERRORS.CANCELLED,
            return: requestTargetN3.Send,
            ID: this.messageID,
        });
        window.close();
    }

    private resolveSign(transaction) {
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
                transaction.sign(wif, this.global.n3Network.magicNumber);
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
                error: ERRORS.DEFAULT,
                return: requestTargetN3.Send,
                ID: this.messageID,
            });
            window.close();
        }
    }

    private resolveSend(tx: Transaction3) {
        this.loadingMsg = 'Wait';
        this.loading = true;
        return this.rpcClient
            .sendRawTransaction(
                this.neo3Transfer.hexToBase64(tx.serialize(true))
            )
            .then(async (TxHash) => {
                if (!TxHash) {
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
                        txid: TxHash,
                        nodeUrl: `${this.global.n3Network.rpcUrl}`,
                    },
                    return: requestTargetN3.Send,
                    ID: this.messageID,
                });
                const setData = {};
                setData[`N3${this.n3Network.network}TxArr`] =
                    (await this.chrome.getLocalStorage(
                        `N3${this.n3Network.network}TxArr`
                    )) || [];
                setData[`N3${this.n3Network.network}TxArr`].push(TxHash);
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
                console.log(err);
                this.loading = false;
                this.loadingMsg = '';
                this.creating = false;
                this.chrome.windowCallback({
                    error: ERRORS.RPC_ERROR,
                    return: requestTargetN3.Send,
                    ID: this.messageID,
                });
                this.global.snackBarTip('transferFailed', err.msg || err);
            });
    }

    public pushTransaction(transaction: object) {
        const net = this.n3Network.network;
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
            this.txState.pushTxSource();
        });
    }

    public async getAssetRate() {
        const rateSymbols = this.symbol === 'GAS' ? 'GAS' : `${this.symbol},GAS`;
        this.asset.getAssetRate(rateSymbols).subscribe(rates => {
            const gasPrice = rates.gas || 0;
            const transferAssetPrice = rates[this.symbol.toLowerCase()] || 0;
            this.money = bignumber(this.amount).times(bignumber(transferAssetPrice)).toFixed();
            this.feeMoney = bignumber(this.fee).times(bignumber(gasPrice)).toFixed();
            this.systemFeeMoney = bignumber(this.systemFee).times(bignumber(gasPrice)).toFixed();
            this.networkFeeMoney = bignumber(this.networkFee).times(bignumber(gasPrice)).toFixed();
        })
    }

    public exit() {
        this.chrome.windowCallback({
            error: ERRORS.CANCELLED,
            return: requestTargetN3.Send,
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
                return: requestTargetN3.Send,
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
                if (res || res === 0) {
                    this.fee = res;
                    if (res === 0 || res === '0') {
                        this.feeMoney = '0';
                    } else {
                        this.asset
                            .getMoney('GAS', Number(this.fee))
                            .then((feeMoney) => {
                                this.feeMoney = feeMoney;
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
