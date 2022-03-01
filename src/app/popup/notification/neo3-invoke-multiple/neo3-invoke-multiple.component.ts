import { Component, OnInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { GlobalService, NeonService, ChromeService, AssetState, NotificationService } from '@/app/core';
import { Transaction } from '@cityofzion/neon-core-neo3/lib/tx';
import { tx } from '@cityofzion/neon-js-neo3';
import { MatDialog } from '@angular/material/dialog';
import { ERRORS } from '@/models/dapi';
import { requestTargetN3 } from '@/models/dapi_neo3';
import { PopupDapiPromptComponent, PopupEditFeeDialogComponent } from '../../_dialogs';
import { GasFeeSpeed, RpcNetwork } from '../../_lib/type';
import { bignumber } from 'mathjs';
import { NEO3_CONTRACT, STORAGE_NAME } from '../../_lib';
import { Neo3InvokeService } from '../../transfer/neo3-invoke.service';
import { forkJoin } from 'rxjs';

@Component({
    templateUrl: 'neo3-invoke-multiple.component.html',
    styleUrls: ['neo3-invoke-multiple.component.scss']
})
export class PopupNoticeNeo3InvokeMultipleComponent implements OnInit {
    public n3Network: RpcNetwork;
    public dataJson: any = {};
    public rateCurrency = '';
    public txSerialize = '';
    public showFeeEdit: boolean = true;

    private pramsData: any;
    public tx: Transaction;
    public invokeArgs: any[] = [];
    public signers: any[] = [];
    public minFee = 0;
    public broadcastOverride = null;
    public loading = false;
    public loadingMsg: string;
    private messageID = 0;
    public invokeArgsArray: any[] = [];

    public fee = null;
    public systemFee;
    public networkFee;
    public totalFee;
    public totalMoney;

    public canSend = false;

    public signAddress;

    constructor(
        private aRoute: ActivatedRoute,
        private router: Router,
        private global: GlobalService,
        private neon: NeonService,
        private dialog: MatDialog,
        private chrome: ChromeService,
        private assetState: AssetState,
        private neo3Invoke: Neo3InvokeService,
        private notification: NotificationService
    ) {
        this.signAddress = this.neon.address;
        this.n3Network = this.global.n3Network;
    }

    ngOnInit(): void {
        this.rateCurrency = this.assetState.rateCurrency;
        this.aRoute.queryParams.subscribe(async ({ messageID }) => {
            let params: any;
            this.messageID = messageID;
            this.chrome.getStorage(STORAGE_NAME.InvokeArgsArray).subscribe(async invokeArgsArray => {
                this.invokeArgsArray = invokeArgsArray;
                params = invokeArgsArray.filter(item => (item as any).messageID === messageID)[0];
                if (!params || params.length <= 0) {
                    return;
                }
                this.dataJson = {
                    ...params,
                    messageID: undefined,
                    hostname: undefined,
                };
                this.pramsData = params;
                this.pramsData.invokeArgs.forEach(item => {
                    item = this.neo3Invoke.createInvokeInputs(item);
                    this.invokeArgs.push({
                        ...this.neo3Invoke.createInvokeInputs(item)
                    });
                });
                this.broadcastOverride = this.pramsData.broadcastOverride || false;
                this.signers = this.pramsData.signers;
                if (params.minReqFee) {
                    this.minFee = Number(params.minReqFee);
                }
                if (params.fee) {
                    this.fee = bignumber(params.fee).toFixed();
                } else {
                    this.fee = '0';
                    if (this.showFeeEdit) {
                        if (this.assetState.gasFeeSpeed) {
                            this.fee = bignumber(this.minFee).add(bignumber(this.assetState.gasFeeSpeed.propose_price)).toFixed();
                        } else {
                            const res_1 = await this.assetState.getGasFee().toPromise();
                            this.fee = bignumber(this.minFee).add(bignumber(res_1.propose_price)).toFixed();
                        }
                    }
                }
                this.signTx();
                this.prompt();
            });
        });
        window.onbeforeunload = () => {
            this.chrome.windowCallback({
                error: ERRORS.CANCELLED,
                return: requestTargetN3.InvokeMultiple,
                ID: this.messageID
            });
        };
    }
    public async getAssetRate() {
        this.assetState.getAssetRate('GAS').subscribe(rates => {
            const gasPrice = rates.gas || 0;
            this.totalFee = bignumber(this.systemFee).add(bignumber(this.networkFee)).toFixed();
            this.totalMoney = bignumber(this.totalFee).times(bignumber(gasPrice)).toFixed();
        })
    }

    public async getMoney(symbol: string, balance: number): Promise<string> {
        return new Promise((mResolve) => {
            if (balance === 0) {
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

    private async resolveSign(sendNow = false) {
        this.loading = true;
        this.loadingMsg = 'Wait';
        if (this.tx === null) {
            return;
        }
        try {
            const wif = this.neon.WIFArr[
                this.neon.walletArr.findIndex(item => item.accounts[0].address === this.neon.wallet.accounts[0].address)
            ]
            try {
                this.tx = this.tx.sign(wif, this.global.n3Network.magicNumber);
            } catch (error) {
                console.log(error);
            }
            this.txSerialize = this.tx.serialize(true);
            this.loading = false
            if (sendNow) {
                this.resolveSend();
            }
        } catch (error) {
            this.loading = false;
            this.loadingMsg = '';
            this.global.snackBarTip('verifyFailed', error);
            this.chrome.windowCallback({
                error: { ...ERRORS.DEFAULT, description: error?.message || error },
                return: requestTargetN3.InvokeMultiple,
                ID: this.messageID
            });
            window.close();
        }
    }

    private async resolveSend() {
        this.loading = true;
        this.loadingMsg = 'Wait';

        return this.neo3Invoke.sendNeo3Tx(
            this.neo3Invoke.hexToBase64(this.tx.serialize(true))
        ).then(async txHash => {
            if (
                !txHash || !txHash.startsWith('0x')
            ) {
                throw {
                    msg: 'Transaction rejected by RPC node.'
                };
            }
            this.loading = false;
            this.loadingMsg = '';
            this.chrome.windowCallback({
                data: {
                    txid: txHash,
                    nodeUrl: `${this.global.n3Network.rpcUrl}`
                },
                return: requestTargetN3.InvokeMultiple,
                ID: this.messageID
            });
            const setData = {};
            setData[`N3${this.n3Network.network}TxArr`] = await this.chrome.getLocalStorage(`N3${this.n3Network.network}TxArr`) || [];
            setData[`N3${this.n3Network.network}TxArr`].push(txHash);
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
                error: { ...ERRORS.RPC_ERROR, description: err?.message || err },
                return: requestTargetN3.InvokeMultiple,
                ID: this.messageID
            });
            this.global.snackBarTip('transferFailed', err.msg || err);
        });
    }

    public exit() {
        this.chrome.windowCallback({
            error: ERRORS.CANCELLED,
            return: requestTargetN3.InvokeMultiple,
            ID: this.messageID
        });
        window.close();
    }

    public confirm() {
        if (!this.tx) {
            this.signTx();
            return;
        }
        if (this.broadcastOverride) {
            this.loading = false;
            this.loadingMsg = '';
            this.chrome.windowCallback({
                data: {
                    txid: this.tx.hash(),
                    signedTx: this.tx.serialize(true)
                },
                return: requestTargetN3.InvokeMultiple,
                ID: this.messageID
            });
            this.signTx();
            window.close();
        } else {
            this.signTx(true);
        }
        const saveData = this.invokeArgsArray.filter(item => item.messageID !== this.messageID);
        this.chrome.setStorage(STORAGE_NAME.InvokeArgsArray, saveData);
    }

    public editFee() {
        this.dialog.open(PopupEditFeeDialogComponent, {
            panelClass: 'custom-dialog-panel',
            data: {
                fee: this.fee,
                minFee: this.minFee
            }
        }).afterClosed().subscribe(res => {
            if (res || res === 0) {
                this.fee = res;
                this.dataJson.fee = res;
                this.getAssetRate();
                this.signTx();
                if (res < this.minFee) {
                    this.fee = this.minFee;
                }
            }
        })
    }

    private signTx(sendNow = false) {
        setTimeout(() => {
            this.loading = true;
            this.neo3Invoke.createNeo3Tx({
                invokeArgs: this.invokeArgs,
                signers: this.signers,
                networkFee: this.fee,
                systemFee: this.pramsData.extraSystemFee
            }).subscribe(async (unSignTx: Transaction)  => {
                const hasChangeFee = unSignTx.systemFee.toString() !== this.systemFee || unSignTx.networkFee.toString() !== this.networkFee;
                this.systemFee = unSignTx.systemFee.toString();
                this.networkFee = unSignTx.networkFee.toString();
                this.tx = unSignTx;
                this.getAssetRate();
                const isEnoughFee = await this.neo3Invoke.isEnoughFee(this.neon.address, unSignTx.systemFee, unSignTx.networkFee);
                if (isEnoughFee) {
                    this.canSend = true;
                    if (sendNow && hasChangeFee) {
                        this.loading = false;
                        this.global.snackBarTip('SystemFeeHasChanged');
                    } else {
                        this.resolveSign(sendNow);
                    }
                } else {
                    this.loading = false;
                    this.canSend = false;
                    this.global.snackBarTip('InsufficientGas');
                }
            }, error => {
                console.log(error);
                let description;
                if (error.type === 'scriptError') {
                    description = this.notification.content.checkInput;
                    this.global.snackBarTip('checkInput');
                } else {
                    description = error.error.message || this.notification.content.rpcError;
                    this.global.snackBarTip(error.error.message || 'rpcError');
                }
                this.loading = false;
                this.chrome.windowCallback({
                    error: {
                        type: 'RPC_ERROR',
                        description
                    },
                    return: requestTargetN3.InvokeMultiple,
                    ID: this.messageID
                });
            })
        }, 0);
    }

    private prompt() {
        if (this.signers[0].scopes === tx.WitnessScope.Global) {
            this.dialog.open(PopupDapiPromptComponent, {
                panelClass: 'custom-dialog-panel',
                data: {
                    scopes: this.signers[0].scopes
                }
            }).afterClosed().subscribe(() => {});
        }
    }
}
