import { Component, OnInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { GlobalService, NeonService, ChromeService, AssetState } from '@/app/core';
import { Transaction, TransactionInput, InvocationTransaction } from '@cityofzion/neon-core/lib/tx';
import { wallet, tx, sc, u, rpc } from '@cityofzion/neon-core';
import { MatDialog } from '@angular/material/dialog';
import { PwdDialog } from '@/app/transfer/+pwd/pwd.dialog';
import { HttpClient } from '@angular/common/http';
import { ERRORS, GAS, requestTarget } from '@/models/dapi';
import { ScriptBuilder } from '@cityofzion/neon-core/lib/sc';
import { Observable } from 'rxjs';
import { UTXO, NEO } from '@/models/models';
import { map } from 'rxjs/operators';
import { str2hexstring, Fixed8 } from '@cityofzion/neon-core/lib/u';
import { PopupInputDialogComponent, PopupEditFeeDialogComponent } from '../../_dialogs';
import { GasFeeSpeed } from '../../_lib/type';

@Component({
    templateUrl: 'deploy.component.html',
    styleUrls: ['deploy.component.scss']
})
export class PopupNoticeDeployComponent implements OnInit {
    public net: string = '';
    public dataJson: any = {};
    public feeMoney = '0';
    public rateCurrency = '';
    public txSerialize = ''
    public assetImageUrl = '';
    public fee = '';

    public pramsData: any;
    public tx: Transaction;
    public broadcastOverride = null;
    public loading = false;
    public loadingMsg: string;
    private messageID = 0;

    constructor(
        private aRoute: ActivatedRoute,
        private router: Router,
        private global: GlobalService,
        private neon: NeonService,
        private dialog: MatDialog,
        private http: HttpClient,
        private chrome: ChromeService,
        private assetState: AssetState
    ) { }

    ngOnInit(): void {
        this.assetState.getAssetImage(NEO).then(res => {
            this.assetImageUrl = res;
        });
        this.aRoute.queryParams.subscribe(async (params: any) => {
            this.pramsData = params;
            this.messageID = params.messageID;
            this.dataJson = this.pramsData;
            this.dataJson.messageID = undefined;
            if (this.pramsData.networkFee) {
                this.fee = this.pramsData.networkFee;
            } else {
                if (this.assetState.gasFeeSpeed) {
                    this.fee = this.assetState.gasFeeSpeed.propose_price;
                } else {
                    this.assetState.getGasFee().subscribe((res: GasFeeSpeed) => {
                        this.fee = res.propose_price;
                        this.signTx();
                    });
                }
            }
            if (Number(this.pramsData.fee) > 0) {
                this.assetState.getMoney('GAS', Number(this.fee)).then(res => {
                    this.feeMoney = res;
                })
            }
            if (params.network !== undefined) {
                if (params.network === 'MainNet') {
                    this.global.modifyNet('MainNet');
                } else {
                    this.global.modifyNet('TestNet');
                }
                this.net = this.global.net;
                this.broadcastOverride = this.pramsData.broadcastOverride === 'true' || false;
                this.signTx();
            } else {
                return;
            }
        });
        window.onbeforeunload = () => {
            this.chrome.windowCallback({
                error: ERRORS.CANCELLED,
                return: requestTarget.Deploy,
                ID: this.messageID
            });
        };
    }

    private resolveSign(transaction: Transaction) {
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
                transaction.sign(wif);
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
                return: requestTarget.Deploy,
                ID: this.messageID
            });
            window.close();
        }
    }

    private resolveSend(transaction: Transaction) {
        return rpc.Query.sendRawTransaction(transaction.serialize(true)).execute(this.global.RPCDomain).then(async res => {
            if (
                !res.result ||
                (res.result && typeof res.result === 'object' && res.result.succeed === false)
            ) {
                throw {
                    msg: 'Transaction rejected by RPC node.'
                };
            }
            this.loading = false;
            this.loadingMsg = '';
            if (!res.bool_status) {
                this.chrome.windowCallback({
                    error: ERRORS.RPC_ERROR,
                    return: requestTarget.Deploy,
                    ID: this.messageID
                });
                window.close();
                this.global.snackBarTip('transferFailed');
            } else {
                this.chrome.windowCallback({
                    data: {
                        txid: transaction.hash,
                        nodeUrl: `${this.global.RPCDomain}`
                    },
                    return: requestTarget.Deploy,
                    ID: this.messageID
                });
                window.close();
                const setData = {};
                setData[`${this.net}TxArr`] = await this.chrome.getLocalStorage(`${this.net}TxArr`) || [];
                setData[`${this.net}TxArr`].push('0x' + transaction.hash);
                this.chrome.setLocalStorage(setData);
                this.router.navigate([{
                    outlets: {
                        transfer: ['transfer', 'result']
                    }
                }]);
            }
        }).catch(err => {
            this.loading = false;
            this.loadingMsg = '';
            this.chrome.windowCallback({
                error: ERRORS.RPC_ERROR,
                return: requestTarget.Deploy,
                ID: this.messageID
            });
            this.global.snackBarTip('transferFailed', err.msg || err);
        });
    }

    private createTxForNEP5(): Promise<Transaction> {
        return new Promise(async (resolve, reject) => {
            const amount = (this.pramsData.dynamicInvoke === 'true' ? 500 : 0) + (this.pramsData.needsStorage === 'true' ? 400 : 0) + 90;
            const fromAddress = this.neon.wallet.accounts[0].address;
            let newTx = new tx.InvocationTransaction();
            // tslint:disable-next-line: no-bitwise
            const num = (this.pramsData.needsStorage === 'true' ? 1 : 0) | (this.pramsData.dynamicInvoke === 'true' ? 2 : 0) |
                (this.pramsData.isPayable === 'true' ? 4 : 0);
            const sb = new ScriptBuilder();
            sb.emitPush(str2hexstring(this.pramsData.description))
                .emitPush(str2hexstring(this.pramsData.email))
                .emitPush(str2hexstring(this.pramsData.author))
                .emitPush(str2hexstring(this.pramsData.version))
                .emitPush(str2hexstring(this.pramsData.name))
                .emitPush(num)
                .emitPush(this.pramsData.returnType || 'ff00')
                .emitPush(this.pramsData.parameterList)
                .emitPush(this.pramsData.code)
                .emitSysCall('Neo.Contract.Create');
            try {
                newTx.script = sb.str;
            } catch (error) {
                reject(error);
            }
            try {
                newTx = await this.addFee(fromAddress, newTx, amount + parseFloat(this.fee));
            } catch (error) {
                this.chrome.windowCallback({
                    error: ERRORS.INSUFFICIENT_FUNDS,
                    return: requestTarget.Deploy,
                    ID: this.messageID
                });
                window.close();
            }
            const remark = this.broadcastOverride ? 'From NeoLine' : `From NeoLine at ${new Date().getTime()}`;
            newTx.addAttribute(tx.TxAttrUsage.Remark1, u.str2hexstring(remark));
            newTx.gas = new Fixed8(amount);
            resolve(newTx);
        });
    }

    private getBalance(address: string, asset: string): Observable<UTXO[]> {
        return this.http.get(`${this.global.apiDomain}/v1/transactions/getutxoes?address=${address}&asset_id=${asset}`).pipe(map((res) => {
            return (res as any).result as UTXO[];
        }));
    }

    public addFee(from: string, newTx: InvocationTransaction, fee: number = 0): Promise<InvocationTransaction> {
        return new Promise((resolve, reject) => {
            this.getBalance(from, GAS).subscribe(res => {
                let curr = 0.0;
                for (const item of res) {
                    curr = this.global.mathAdd(curr, parseFloat(item.value) || 0);
                    newTx.inputs.push(new TransactionInput({
                        prevIndex: item.n,
                        prevHash: item.txid.startsWith('0x') && item.txid.length === 66 ?
                            item.txid.substring(2) : item.txid
                    }));
                    if (curr >= fee) {
                        break;
                    }
                }
                const payback = this.global.mathSub(curr, fee);
                if (payback < 0) {
                    reject('no enough GAS to fee');
                    return;
                }
                if (payback > 0) {
                    const fromScript = wallet.getScriptHashFromAddress(from);
                    let gasAssetId = res[0].asset_id;
                    if (gasAssetId.startsWith('0x') && gasAssetId.length === 66) {
                        gasAssetId = gasAssetId.substring(2);
                    }
                    newTx.addOutput({ assetId: gasAssetId, value: this.global.mathSub(curr, fee), scriptHash: fromScript });
                }
                resolve(newTx);
            });
        });
    }
    public exit() {
        this.chrome.windowCallback({
            error: ERRORS.CANCELLED,
            return: requestTarget.Deploy,
            ID: this.messageID
        });
        window.close();
    }

    public confirm() {
        if (this.broadcastOverride === true) {
            this.loading = false;
            this.loadingMsg = '';
            this.chrome.windowCallback({
                data: {
                    txid: this.tx.hash,
                    signedTx: this.tx.serialize(true)
                },
                return: requestTarget.Deploy,
                ID: this.messageID
            });
            window.close();
        } else {
            this.resolveSend(this.tx);
        }
    }
    public editFee() {
        this.dialog.open(PopupEditFeeDialogComponent, {
            panelClass: 'custom-dialog-panel',
            data: {
                fee: this.fee
            }
        }).afterClosed().subscribe(res => {
            if (res && res !== false) {
                this.fee = res;
                if (res === 0) {
                    this.feeMoney = '0';
                } else {

                    this.assetState.getMoney('GAS', Number(this.fee)).then(feeMoney => {
                        this.feeMoney = feeMoney;
                    });
                }
                this.signTx();
            }
        })
    }
    private signTx() {
        setTimeout(() => {
            this.loading = true;
            this.createTxForNEP5().then(result => {
                this.resolveSign(result);
            }).catch(err => {
                this.chrome.windowCallback({
                    error: ERRORS.MALFORMED_INPUT,
                    return: requestTarget.Deploy,
                    ID: this.messageID
                });
                window.close();
            });
        }, 0);
    }
}
