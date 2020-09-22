import { Component, OnInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { GlobalService, NeonService, ChromeService, AssetState } from '@/app/core';
import { Transaction, TransactionInput, InvocationTransaction } from '@cityofzion/neon-core/lib/tx';
import { wallet, tx, sc, u, rpc } from '@cityofzion/neon-core';
import Neon from '@cityofzion/neon-js';
import { MatDialog } from '@angular/material/dialog';
import { PwdDialog } from '@/app/transfer/+pwd/pwd.dialog';
import { HttpClient } from '@angular/common/http';
import { NEO, UTXO, GAS } from '@/models/models';
import { Observable } from 'rxjs';
import { Fixed8 } from '@cityofzion/neon-core/lib/u';
import { map } from 'rxjs/operators';
import { ERRORS, requestTarget, TxHashAttribute } from '@/models/dapi';
import { PopupInputDialogComponent, PopupEditFeeDialogComponent } from '../../_dialogs';



@Component({
    templateUrl: 'invoke.component.html',
    styleUrls: ['invoke.component.scss']
})
export class PopupNoticeInvokeComponent implements OnInit {

    public net: string = '';
    public dataJson: any = {};
    public feeMoney = '0';
    public rateCurrency = '';
    public txSerialize = ''
    public assetImageUrl = '';

    private pramsData: any;
    public scriptHash = '';
    public operation = '';
    public args = null;
    public tx: Transaction;
    public triggerContractVerification: boolean = false;
    public attachedAssets = null;
    public fee = null;
    public broadcastOverride = null;
    public assetIntentOverrides = null;
    public loading = false;
    public loadingMsg: string;
    private messageID = 0;
    private txHashAttributes: TxHashAttribute[] = null;
    private utxos: UTXO[] = []

    private extraWitness: [] = [];

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
            this.dataJson = this.pramsData
            this.dataJson.messageID = undefined;
            this.triggerContractVerification = params.triggerContractVerification !== undefined
                ? params.triggerContractVerification.toString() === 'true' : false
            if (params.scriptHash !== undefined && params.operation !== undefined && params.args !== undefined) {
                this.scriptHash = params.scriptHash;
                this.operation = params.operation;
                this.args = this.pramsData.args;
                this.args.forEach((item, index) => {
                    if (item.type === 'Address') {
                        const param2 = u.reverseHex(wallet.getScriptHashFromAddress(item.value));
                        this.args[index] = param2;
                    } else if (item.type === 'Boolean') {
                        if (typeof item.value === 'string') {
                            if ((item.value && item.value.toLowerCase()) === 'true') {
                                this.args[index] = true
                            } else if (item.value && item.value.toLowerCase() === 'false') {
                                this.args[index] = false;
                            } else {
                                this.chrome.windowCallback({
                                    error: ERRORS.MALFORMED_INPUT,
                                    return: requestTarget.Invoke,
                                    ID: this.messageID
                                });
                                window.close();
                            }
                        }
                    } else if (item.type === 'Integer') {
                        this.args[index] = Neon.create.contractParam('Integer', item.value.toString())
                    }
                });
                this.fee = parseFloat(params.fee) || 0;
                this.attachedAssets = this.pramsData.attachedAssets

                if (this.assetIntentOverrides == null && this.pramsData.assetIntentOverrides !== undefined) {
                    this.assetIntentOverrides = this.pramsData.assetIntentOverrides
                    this.fee = 0;
                    this.feeMoney = '0';
                    this.attachedAssets = null;
                }
                if (this.txHashAttributes === null && this.pramsData.txHashAttributes !== undefined) {
                    this.txHashAttributes = this.pramsData.txHashAttributes
                }
                this.broadcastOverride = this.pramsData.broadcastOverride === 'true' || false;
                if (params.extra_witness !== undefined) {
                    this.extraWitness = this.pramsData.extra_witness
                }
                setTimeout(() => {
                    this.createTxForNEP5().then(res => {
                        this.resolveSign(res);
                    }).catch(err => {
                        this.chrome.windowCallback({
                            error: ERRORS.MALFORMED_INPUT,
                            return: requestTarget.Invoke,
                            ID: this.messageID
                        });
                        window.close();
                    });
                }, 0);
            } else {
                return;
            }
        });
        window.onbeforeunload = () => {
            this.chrome.windowCallback({
                error: ERRORS.CANCELLED,
                return: requestTarget.Invoke,
                ID: this.messageID
            });
        };
    }

    private async resolveSign(transaction: Transaction) {
        this.loading = true;
        this.loadingMsg = 'Wait';
        if (this.triggerContractVerification) {
            transaction.scripts = [await this.neon.getVerificationSignatureForSmartContract(this.scriptHash), ...transaction.scripts];
        }
        if (this.extraWitness.length > 0) {
            this.extraWitness.forEach((item: any) => {
                if (item.invocationScript !== undefined || item.verificationScript !== undefined) {
                    const tempWitness = new tx.Witness({
                        invocationScript: item.invocationScript || '',
                        verificationScript: item.verificationScript || ''
                    })
                    tempWitness.scriptHash = item.scriptHash
                    transaction.scripts.push(tempWitness)
                }
            });
        }
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
                return: requestTarget.Invoke,
                ID: this.messageID
            });
            window.close();
        }
    }

    private async resolveSend(transaction: Transaction) {
        let serialize = ''
        try {
            serialize = transaction.serialize(true)
        } catch (error) {
            this.loading = false;
            this.loadingMsg = '';
            this.chrome.windowCallback({
                error: ERRORS.RPC_ERROR,
                return: requestTarget.Invoke,
                ID: this.messageID
            });
            this.global.snackBarTip('transferFailed', error.msg || error);
            return
        }
        return rpc.Query.sendRawTransaction(serialize).execute(this.global.RPCDomain).then(async res => {
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
            if (res.error !== undefined) {
                this.chrome.windowCallback({
                    error: ERRORS.RPC_ERROR,
                    return: requestTarget.Invoke,
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
                    return: requestTarget.Invoke,
                    ID: this.messageID
                });
                const setData = {};
                setData[`${this.net}TxArr`] = await this.chrome.getLocalStorage(`${this.net}TxArr`) || [];
                setData[`${this.net}TxArr`].push('0x' + transaction.hash);
                this.chrome.setLocalStorage(setData);
                this.router.navigate([{
                    outlets: {
                        transfer: ['transfer', 'result']
                    }
                }]);
                window.close();
            }
        }).catch(err => {
            console.log(err);
            this.loading = false;
            this.loadingMsg = '';
            this.chrome.windowCallback({
                error: ERRORS.RPC_ERROR,
                return: requestTarget.Invoke,
                ID: this.messageID
            });
            this.global.snackBarTip('transferFailed', err.msg || err);
        });
    }

    private createTxForNEP5(): Promise<Transaction> {
        return new Promise(async (resolve, reject) => {
            const fromScript = wallet.getScriptHashFromAddress(this.neon.address);
            const toScript = this.scriptHash.startsWith('0x') && this.scriptHash.length === 42
                ? this.scriptHash.substring(2) : this.scriptHash;
            let newTx = new tx.InvocationTransaction();
            if (this.scriptHash.length !== 42 && this.scriptHash.length !== 40) {
                this.chrome.windowCallback({
                    error: ERRORS.MALFORMED_INPUT,
                    return: requestTarget.Invoke,
                    ID: this.messageID
                });
                this.loading = false;
                this.loadingMsg = '';
                window.close();
                return null;
            }
            try {
                newTx.script = sc.createScript({
                    scriptHash: this.scriptHash.startsWith('0x') && this.scriptHash.length === 42
                        ? this.scriptHash.substring(2) : this.scriptHash,
                    operation: this.operation,
                    args: this.args
                });
            } catch (error) {
                reject(error);
            }
            if (this.assetIntentOverrides == null) {
                if (this.attachedAssets !== null && this.attachedAssets !== undefined) {
                    if (this.attachedAssets.NEO) {
                        try {
                            newTx = await this.addAttachedAssets(NEO, this.attachedAssets.NEO, fromScript, toScript, newTx);
                        } catch (error) {
                            this.chrome.windowCallback({
                                error: ERRORS.MALFORMED_INPUT,
                                return: requestTarget.Invoke,
                                ID: this.messageID
                            });
                            window.close();
                        }
                    }
                    if (this.attachedAssets.GAS) {
                        try {
                            newTx = await this.addAttachedAssets(GAS, this.attachedAssets.GAS, fromScript, toScript, newTx, this.fee);
                        } catch (error) {
                            console.log(error);
                        }
                    } else {
                        if (this.fee > 0) {
                            try {
                                newTx = await this.addFee(this.neon.wallet.accounts[0].address, newTx, this.fee);
                            } catch (error) {
                                console.log(error);
                            }
                        }
                    }
                } else {
                    if (this.fee > 0) {
                        try {
                            newTx = await this.addFee(this.neon.wallet.accounts[0].address, newTx, this.fee);
                        } catch (error) {
                            console.log(error);
                        }
                    }
                }
            } else {
                this.assetIntentOverrides.outputs.forEach(element => {
                    const toScripts = wallet.getScriptHashFromAddress(element.address)
                    let assetId = element.asset;
                    if (element.asset.toString().toLowerCase() === 'gas') {
                        assetId = GAS;
                    }
                    if (element.asset.toString().toLowerCase() === 'neo') {
                        assetId = NEO;
                    }
                    newTx.addOutput({
                        assetId: assetId.startsWith('0x') ? assetId.substring(2) : assetId,
                        value: new Fixed8(Number(element.value)),
                        scriptHash: toScripts.startsWith('0x') &&
                            toScripts.length === 42 ? toScripts.substring(2) : toScripts
                    })
                });
                this.assetIntentOverrides.inputs.forEach(element => {
                    newTx.inputs.push(new TransactionInput({
                        prevIndex: element.index,
                        prevHash: element.txid.startsWith('0x') && element.txid.length === 66 ? element.txid.substring(2) : element.txid
                    }))
                });
            }
            newTx = await this.addAttributes(newTx);
            resolve(newTx);
        });
    }

    private async addAttributes(transaction: InvocationTransaction): Promise<InvocationTransaction> {
        const fromScript = wallet.getScriptHashFromAddress(this.neon.address);
        if (this.txHashAttributes !== null) {
            this.txHashAttributes.forEach((item, index) => {
                this.txHashAttributes[index] = this.neon.parseTxHashAttr(this.txHashAttributes[index]);
                const info = this.txHashAttributes[index];
                if (tx.TxAttrUsage[info.txAttrUsage]) {
                    transaction.addAttribute(tx.TxAttrUsage[info.txAttrUsage], info.value);
                }
            });
        }
        if (this.assetIntentOverrides && this.assetIntentOverrides.inputs && this.assetIntentOverrides.inputs.length) {
            this.utxos = this.utxos.concat(await this.getBalance(this.neon.address, NEO));
            this.utxos = this.utxos.concat(await this.getBalance(this.neon.address, GAS));
        }
        if (this.triggerContractVerification) {
            transaction.addAttribute(tx.TxAttrUsage.Script, u.reverseHex(this.scriptHash));
        } else if (
            (transaction.inputs.length === 0 && transaction.outputs.length === 0 && !this.assetIntentOverrides) ||
            this.assetIntentOverrides && this.assetIntentOverrides.inputs && this.assetIntentOverrides.inputs.length &&
            // tslint:disable-next-line: max-line-length
            !this.assetIntentOverrides.inputs.filter(({ index, txid }) => this.utxos.find(utxo => utxo.n === index && (utxo.txid === txid || utxo.txid.slice(2) === txid))).length
        ) {
            transaction.addAttribute(tx.TxAttrUsage.Script, u.reverseHex(fromScript));
        }
        const remark = this.broadcastOverride ? 'From NeoLine' : `From NeoLine at ${new Date().getTime()}`;
        transaction.addAttribute(tx.TxAttrUsage.Remark1, u.str2hexstring(remark));
        return transaction;

    }

    private getBalance(address: string, asset: string): Promise<UTXO[]> {
        return new Promise(mResolve => {
            this.http.get(`${this.global.apiDomain}/v1/transactions/getutxoes?address=${address}&asset_id=${asset}`).pipe(map((res) => {
                mResolve((res as any).result as UTXO[]);
            })).toPromise();
        });
    }

    private addAttachedAssets(assetid: string, amount: number, fromScript: string,
        toScript: string, newTx: InvocationTransaction, fee: number = 0): Promise<InvocationTransaction> {
        return new Promise((resolve, reject) => {
            this.getBalance(this.neon.address, assetid).then((balances: any) => {
                if (balances.length === 0) {
                    reject('no balance');
                }
                let assetId = balances[0].asset_id;
                if (assetId.startsWith('0x') && assetId.length === 66) {
                    assetId = assetId.substring(2);
                }
                newTx.addOutput({ assetId, value: new Fixed8(amount), scriptHash: toScript });
                let curr = 0.0;
                for (const item of balances) {
                    curr = this.global.mathAdd(curr, parseFloat(item.value) || 0);
                    newTx.inputs.push(new TransactionInput({
                        prevIndex: item.n, prevHash: item.txid.startsWith('0x') && item.txid.length === 66
                            ? item.txid.substring(2) : item.txid
                    }));
                    if (curr >= amount + fee) {
                        break;
                    }
                }
                const payback = (assetId === GAS || assetId === GAS.substring(2)) ?
                    this.global.mathSub(this.global.mathSub(curr, amount), fee) : this.global.mathSub(curr, amount);
                if (payback < 0) {
                    reject('no enough balance to pay');
                }
                if (payback > 0) {
                    newTx.addOutput({ assetId, value: new Fixed8(payback), scriptHash: fromScript });
                }
                resolve(newTx);
            });
        });
    }

    public addFee(from: string, newTx: InvocationTransaction, fee: number = 0): Promise<InvocationTransaction> {
        return new Promise((resolve, reject) => {
            this.getBalance(from, GAS).then(res => {
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
                    this.chrome.windowCallback({
                        error: ERRORS.INSUFFICIENT_FUNDS,
                        return: requestTarget.Invoke,
                        ID: this.messageID
                    });
                    this.global.snackBarTip('no enough GAS to fee');
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
            return: requestTarget.Invoke,
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
                return: requestTarget.Invoke,
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
            if (res !== false) {
                this.fee = res;
                if (res === 0) {
                    this.feeMoney = '0';
                } else {

                    this.assetState.getMoney('GAS', Number(this.fee)).then(feeMoney => {
                        this.feeMoney = feeMoney;
                    });
                }
            }
        })
    }
}
