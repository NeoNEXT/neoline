import { Component, OnInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { GlobalService, NeonService, ChromeService, AssetState, NotificationService, LedgerService } from '@/app/core';
import { Transaction, Witness } from '@cityofzion/neon-core-neo3/lib/tx';
import { tx, wallet } from '@cityofzion/neon-js-neo3';
import { MatDialog } from '@angular/material/dialog';
import { ERRORS } from '@/models/dapi';
import { requestTargetN3 } from '@/models/dapi_neo3';
import { PopupDapiPromptComponent, PopupEditFeeDialogComponent } from '../../_dialogs';
import { GasFeeSpeed, RpcNetwork } from '../../_lib/type';
import { bignumber } from 'mathjs';
import { NEO3_CONTRACT, STORAGE_NAME, GAS3_CONTRACT } from '../../_lib';
import { Neo3InvokeService } from '../../transfer/neo3-invoke.service';
import { forkJoin } from 'rxjs';
import BigNumber from 'bignumber.js';
import { LedgerStatuses } from '../../_lib';
import { interval } from 'rxjs';

@Component({
    templateUrl: 'neo3-invoke.component.html',
    styleUrls: ['neo3-invoke.component.scss']
})
export class PopupNoticeNeo3InvokeComponent implements OnInit {
    public dataJson: any = {};
    public rateCurrency = '';
    public txSerialize = '';
    public showFeeEdit: boolean = true;

    private pramsData: any;
    public scriptHash = '';
    public operation = '';
    public args = null;
    public tx: Transaction;
    public invokeArgs: any[] = [];
    public signers = null;
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
    public n3Network: RpcNetwork;
    getStatusInterval;

    constructor(
        private aRoute: ActivatedRoute,
        private router: Router,
        private global: GlobalService,
        private neon: NeonService,
        private dialog: MatDialog,
        private chrome: ChromeService,
        private assetState: AssetState,
        private neo3Invoke: Neo3InvokeService,
        private notification: NotificationService,
        private ledger: LedgerService
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
                this.pramsData.invokeArgs = this.neo3Invoke.createInvokeInputs(this.pramsData);
                this.invokeArgs.push({
                    ...this.neo3Invoke.createInvokeInputs(this.pramsData)
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
                this.prompt();
                this.signTx();
            });
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
        this.assetState.getAssetRate('gas', GAS3_CONTRACT).then(rate => {
            const gasPrice = rate || 0;
            this.totalFee = new BigNumber(this.systemFee).plus(new BigNumber(this.networkFee)).toFixed();
            this.totalMoney = new BigNumber(this.totalFee).times(gasPrice).toFixed();
        })
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
            this.loadingMsg = ''
            this.chrome.windowCallback({
                data: {
                    txid: txHash,
                    nodeUrl: `${this.global.n3Network.rpcUrl}`
                },
                return: requestTargetN3.Invoke,
                ID: this.messageID
            });
            const setData = {};
            setData[`TxArr_${this.global.n3Network.id}`] = await this.chrome.getLocalStorage(`TxArr_${this.global.n3Network.id}`) || [];
            setData[`TxArr_${this.global.n3Network.id}`].push(txHash);
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
                error: { ...ERRORS.RPC_ERROR, description: err?.error },
                return: requestTargetN3.Invoke,
                ID: this.messageID
            });
            this.global.snackBarTip('transferFailed', err.msg || err);
        });
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
                return: requestTargetN3.Invoke,
                ID: this.messageID
            });
            this.signTx();
            window.close();
        } else {
            this.getSignTx();
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
                if (res < this.minFee) {
                    this.fee = this.minFee;
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
            this.neo3Invoke.createNeo3Tx({
                invokeArgs: this.invokeArgs,
                signers: this.signers,
                networkFee: this.fee,
                systemFee: this.pramsData.extraSystemFee
            }).subscribe(async (unSignTx: Transaction) => {
                const hasChangeFee = unSignTx.systemFee.toString() !== this.systemFee || unSignTx.networkFee.toString() !== this.networkFee;
                this.systemFee = unSignTx.systemFee.toString();
                this.networkFee = unSignTx.networkFee.toString();
                this.getAssetRate();
                this.tx = unSignTx;
                this.txSerialize = this.tx.serialize(false);
                let checkAddress = this.neon.address;
                if (this.signers.length > 1) {
                    const scriptHash = this.signers[0].account.startsWith('0x') ? this.signers[0].account.substr(2) : this.signers[0].account;
                    checkAddress = wallet.getAddressFromScriptHash(scriptHash);
                }
                const isEnoughFee = await this.neo3Invoke.isEnoughFee(checkAddress, unSignTx.systemFee, unSignTx.networkFee);
                if (isEnoughFee) {
                    this.canSend = true;
                    if (hasChangeFee) {
                        this.loading = false;
                        this.global.snackBarTip('SystemFeeHasChanged');
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
                    return: requestTargetN3.Invoke,
                    ID: this.messageID
                });
            });
        }, 0);
    }

    private prompt() {
        if (this.signers[0].scopes === tx.WitnessScope.Global) {
            this.dialog.open(PopupDapiPromptComponent, {
                panelClass: 'custom-dialog-panel',
                data: {
                    scopes: this.signers[0].scopes
                }
            }).afterClosed().subscribe(() => { });
        }
    }

    public getUrlArgStr(){
        const q=location.search.substr(1);
        const qs=q.split('&');
        let argStr='';
        if(qs){
          // tslint:disable-next-line:prefer-for-of
          for(let i=0;i < qs.length; i++){
            argStr+=qs[i].substring(0,qs[i].indexOf('='))+'='+qs[i].substring(qs[i].indexOf('=')+1)+'&';
          }
        }
        return argStr;
    }


    private getLedgerStatus() {
        this.ledger
            .getDeviceStatus(this.neon.currentWalletChainType)
            .then(async (res) => {
                this.loadingMsg = LedgerStatuses[res].msgNeo3 || LedgerStatuses[res].msg;
                if (LedgerStatuses[res] === LedgerStatuses.READY) {
                    this.getStatusInterval.unsubscribe();
                    this.loadingMsg = 'signTheTransaction';
                    this.ledger
                        .getLedgerSignedTx(
                            this.tx,
                            this.neon.wallet,
                            this.neon.currentWalletChainType,
                            this.global.n3Network.magicNumber
                        )
                        .then((tx) => {
                            this.loading = false;
                            this.loadingMsg = '';
                            this.tx = tx;
                            if (this.signers.length === 2) {
                                this.tx.witnesses.unshift(new Witness({verificationScript: '', invocationScript: ''}))
                            }
                            this.resolveSend();
                        })
                        .catch((error) => {
                            this.loading = false;
                            this.loadingMsg = '';
                            this.global.snackBarTip(
                                'TransactionDeniedByUser',
                                error
                            );
                        });
                }
            });
    }

    public getSignTx() {
        if (this.neon.wallet.accounts[0]?.extra?.ledgerSLIP44) {
            this.loading = true;
            this.loadingMsg = LedgerStatuses.DISCONNECTED.msg;
            this.getLedgerStatus();
            this.getStatusInterval = interval(5000).subscribe(() => {
                this.getLedgerStatus();
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
        this.tx.sign(wif, this.global.n3Network.magicNumber);
        if (this.signers.length === 2) {
            this.tx.witnesses.unshift(new Witness({verificationScript: '', invocationScript: ''}))
        }
        this.resolveSend();
    }
}
