import { Component, OnInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { GlobalService, NeonService, ChromeService, AssetState } from '@/app/core';
import { Transaction } from '@cityofzion/neon-core-neo3/lib/tx';
import { sc } from '@cityofzion/neon-core-neo3/lib';
import Neon from '@cityofzion/neon-js-neo3';
import { MatDialog } from '@angular/material/dialog';
import { ERRORS, TxHashAttribute } from '@/models/dapi';
import { requestTargetN3 } from '@/models/dapi_neo3';
import { PopupEditFeeDialogComponent } from '../../_dialogs';
import { GasFeeSpeed } from '../../_lib/type';
import { bignumber } from 'mathjs';
import { NEO3_MAGIC_NUMBER_TESTNET, NEO3_CONTRACT } from '../../_lib';
import { Neo3DapiTransferService } from '../../transfer/neo3-dapi-transfer.service';
import { forkJoin } from 'rxjs';

@Component({
    templateUrl: 'neo3-invoke.component.html',
    styleUrls: ['neo3-invoke.component.scss']
})
export class PopupNoticeNeo3InvokeComponent implements OnInit {
    public net: string = '';
    public dataJson: any = {};
    public rateCurrency = '';
    public txSerialize = '';
    public assetImageUrl = '';
    public showFeeEdit: boolean = true;

    private pramsData: any;
    public scriptHash = '';
    public operation = '';
    public args = null;
    public tx: Transaction;
    public invokeArgs: any[] = [];
    public triggerContractVerification: boolean = false;
    public signers = null;
    public minFee = 0;
    public broadcastOverride = null;
    public loading = false;
    public loadingMsg: string;
    private messageID = 0;
    private txHashAttributes: TxHashAttribute[] = null;

    public fee = null;
    public systemFee;
    public networkFee;
    public feeMoney = '0';
    public systemFeeMoney;
    public networkFeeMoney;
    public totalFee;
    public totalMoney;

    constructor(
        private aRoute: ActivatedRoute,
        private router: Router,
        private global: GlobalService,
        private neon: NeonService,
        private dialog: MatDialog,
        private chrome: ChromeService,
        private assetState: AssetState,
        private neo3DapiTrans: Neo3DapiTransferService,
    ) {
    }

    ngOnInit(): void {
        this.assetImageUrl = this.assetState.getAssetImageFromAssetId(NEO3_CONTRACT);
        this.aRoute.queryParams.subscribe(async (params: any) => {
            this.pramsData = JSON.parse(JSON.stringify(params));
            this.messageID = params.messageID;
            if (params.network !== undefined) {
                if (params.network === 'MainNet') {
                    this.global.modifyNet('MainNet');
                } else {
                    this.global.modifyNet('TestNet');
                }
            }
            this.net = this.global.net;
            for (const key in this.pramsData) {
                if (Object.prototype.hasOwnProperty.call(this.pramsData, key)) {
                    let tempObject: any
                    try {
                        tempObject = this.pramsData[key].replace(/([a-zA-Z0-9]+?):/g, '"$1":').replace(/'/g, '"');
                        tempObject = JSON.parse(tempObject);
                    } catch (error) {
                        tempObject = this.pramsData[key];
                    };
                    this.pramsData[key] = tempObject;
                }
            }
            if (Number(this.pramsData.fee) > 0) {
                this.assetState.getMoney('GAS', Number(this.pramsData.fee)).then(res => {
                    this.feeMoney = res;
                })
            }
            this.dataJson = JSON.parse(JSON.stringify(this.pramsData));
            this.dataJson.messageID = undefined;
            this.triggerContractVerification = params.triggerContractVerification !== undefined
                ? params.triggerContractVerification.toString() === 'true' : false
            if (params.scriptHash !== undefined && params.operation !== undefined && params.args !== undefined) {
                this.pramsData.args.forEach((item, index) => {
                    if (item === null) {
                        return;
                    }
                    if (item.type === 'Address') {
                        this.pramsData.args[index] = sc.ContractParam.hash160(item.value);
                    } else if (item.type === 'Boolean') {
                        if (typeof item.value === 'string') {
                            if ((item.value && item.value.toLowerCase()) === 'true') {
                                this.pramsData.args[index] = true
                            } else if (item.value && item.value.toLowerCase() === 'false') {
                                this.pramsData.args[index] = false;
                            } else {
                                this.chrome.windowCallback({
                                    error: ERRORS.MALFORMED_INPUT,
                                    return: requestTargetN3.Invoke,
                                    ID: this.messageID
                                });
                                window.close();
                            }
                        }
                    } else if (item.type === 'Integer') {
                        this.pramsData.args[index] = item.value;
                        // this.pramsData.args[index] = (Neon as any).create.contractParam('Integer', item.value.toString());
                    }
                });
                if (
                    params.operation === 'transfer' &&
                    this.pramsData.args[this.pramsData.args.length] === undefined
                ) {
                    this.pramsData.args[this.pramsData.args.length] = null;
                }
                this.invokeArgs.push({
                    scriptHash: this.pramsData.scriptHash,
                    operation: this.pramsData.operation,
                    args: this.pramsData.args
                });
                if (params.minReqFee) {
                    this.minFee = Number(params.minReqFee);
                }
                if (params.fee) {
                    this.fee = Number(params.fee);
                } else {
                    this.fee = 0;
                    if (this.showFeeEdit) {
                        if (this.assetState.gasFeeSpeed) {
                            this.fee = bignumber(this.minFee).add(bignumber(this.assetState.gasFeeSpeed.propose_price)).toNumber();
                        } else {
                            this.assetState.getGasFee().subscribe((res: GasFeeSpeed) => {
                                this.fee = bignumber(this.minFee).add(bignumber(res.propose_price)).toNumber();
                                this.signTx();
                            });
                        }
                    }
                }
                this.broadcastOverride = this.pramsData.broadcastOverride === true || false;
                if (this.txHashAttributes === null && this.pramsData.txHashAttributes !== undefined) {
                    this.txHashAttributes = this.pramsData.txHashAttributes
                }
                if (this.signers === null && this.pramsData.signers !== undefined) {
                    this.signers = this.pramsData.signers.map(item => {
                        return {
                            account: item.account,
                            scopes: this.neo3DapiTrans.getTxAuthority(item.scopes)
                        };
                    });
                }
                this.signTx();
            } else {
                return;
            }
        });
        window.onbeforeunload = () => {
            this.chrome.windowCallback({
                error: ERRORS.CANCELLED,
                return: requestTargetN3.Invoke,
                ID: this.messageID
            });
        };
    }

    public async getAssetRate() {
        const getFeeMoney = this.getMoney('GAS', Number(this.fee));
        const getSystemFeeMoney = this.getMoney('GAS', this.systemFee || 0);
        const getNetworkFeeMoney = this.getMoney('GAS', this.networkFee || 0);
        this.totalFee = bignumber(this.fee).add(this.systemFee || 0).add(this.networkFee || 0);
        forkJoin([getFeeMoney, getSystemFeeMoney, getNetworkFeeMoney]).subscribe(res => {
            this.feeMoney = res[0];
            this.systemFeeMoney = res[1];
            this.networkFeeMoney = res[2];
            this.totalMoney = bignumber(this.feeMoney).add(this.systemFeeMoney).add(this.networkFeeMoney);
        });
    }

    public async getMoney(symbol: string, balance: number): Promise<string> {
        return new Promise((mResolve) => {
            if (balance == 0) {
                mResolve('0');
            }
            this.assetState.getAssetRate(symbol).subscribe(rate => {
                if (symbol.toLowerCase() in rate) {
                    mResolve(this.global.mathmul(Number(rate[symbol.toLowerCase()]), Number(balance)).toString());
                } else {
                    mResolve('0');
                }
            });
        })
    }

    private async resolveSign(transaction: Transaction) {
        this.loading = true;
        this.loadingMsg = 'Wait';
        if (transaction === null) {
            return;
        }
        try {
            const wif = this.neon.WIFArr[
                this.neon.walletArr.findIndex(item => item.accounts[0].address === this.neon.wallet.accounts[0].address)
            ]
            try {
                transaction.sign(wif, NEO3_MAGIC_NUMBER_TESTNET);
            } catch (error) {
                console.log(error);
            }
            this.tx = transaction;
            this.txSerialize = this.tx.serialize(true);
            this.loading = false
        } catch (error) {
            this.loading = false;
            this.loadingMsg = '';
            this.global.snackBarTip('verifyFailed', error);
            this.chrome.windowCallback({
                error: ERRORS.DEFAULT,
                return: requestTargetN3.Invoke,
                ID: this.messageID
            });
            window.close();
        }
    }

    private async resolveSend() {
        this.loading = true;
        this.loadingMsg = 'Wait';
        return this.neo3DapiTrans.sendNeo3Tx(
            this.neo3DapiTrans.hexToBase64(this.tx.serialize(true))
        ).then(async txHash => {
            if (
                !txHash || !txHash.startsWith('0x')
            ) {
                throw {
                    msg: 'Transaction rejected by RPC node.'
                };
            }
            this.loading = false;
            this.loadingMsg = ''
            this.chrome.windowCallback({
                data: {
                    txid: txHash,
                    nodeUrl: `${this.global.Neo3RPCDomain}`
                },
                return: requestTargetN3.Invoke,
                ID: this.messageID
            });
            const setData = {};
            setData[`N3${this.net}TxArr`] = await this.chrome.getLocalStorage(`N3${this.net}TxArr`) || [];
            setData[`N3${this.net}TxArr`].push(txHash);
            this.chrome.setLocalStorage(setData);
            this.router.navigate([{
                outlets: {
                    transfer: ['transfer', 'result']
                }
            }]);
        }).catch(err => {
            this.loading = false;
            this.loadingMsg = '';
            this.chrome.windowCallback({
                error: ERRORS.RPC_ERROR,
                return: requestTargetN3.Invoke,
                ID: this.messageID
            });
            this.global.snackBarTip('transferFailed', err.msg || err);
        });
    }

    public confirm() {
        if (this.broadcastOverride === true) {
            this.loading = false;
            this.loadingMsg = '';
            this.chrome.windowCallback({
                data: {
                    txid: this.tx.hash(),
                    signedTx: this.tx.serialize(true)
                },
                return: requestTargetN3.Invoke,
                ID: this.messageID
            });
            this.signTx();
            window.close();
        } else {
            this.resolveSend();
        }
    }

    public editFee() {
        this.dialog.open(PopupEditFeeDialogComponent, {
            panelClass: 'custom-dialog-panel',
            data: {
                fee: this.fee,
                minFee: this.minFee
            }
        }).afterClosed().subscribe(res => {
            if (res !== false) {
                this.fee = res;
                if (res < this.minFee) {
                    this.fee = this.minFee;
                }
                if (res === 0 || res === '0') {
                    this.feeMoney = '0';
                } else {
                    this.assetState.getMoney('GAS', Number(this.fee)).then(feeMoney => {
                        this.feeMoney = feeMoney;
                    });
                }
                this.signTx()
            }
        })
    }

    public exit() {
        this.chrome.windowCallback({
            error: ERRORS.CANCELLED,
            return: requestTargetN3.Invoke,
            ID: this.messageID
        });
        window.close();
    }

    private signTx() {
        setTimeout(() => {
            this.loading = true;
            this.neo3DapiTrans.createNeo3Tx({
                invokeArgs: this.invokeArgs,
                signers: this.signers,
                networkFee: this.fee,
            }).subscribe((unSignTx: Transaction)  => {
                this.systemFee = unSignTx.systemFee.toString();
                this.networkFee = unSignTx.networkFee.toString();
                this.getAssetRate();
                this.resolveSign(unSignTx);
            }, error => {
                console.log(error);
            });
        }, 0);
    }
}
