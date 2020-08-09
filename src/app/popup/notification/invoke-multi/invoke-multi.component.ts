import { Component, OnInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { GlobalService, NeonService, ChromeService } from '@/app/core';
import { Transaction, TransactionInput, InvocationTransaction } from '@cityofzion/neon-core/lib/tx';
import { wallet, tx, sc, u } from '@cityofzion/neon-core';

import { MatDialog } from '@angular/material/dialog';
import { PwdDialog } from '@/app/transfer/+pwd/pwd.dialog';
import { HttpClient } from '@angular/common/http';
import { NEO, UTXO, GAS } from '@/models/models';
import { Observable } from 'rxjs';
import { Fixed8 } from '@cityofzion/neon-core/lib/u';
import { map } from 'rxjs/operators';
import { ERRORS, requestTarget, Invoke, TxHashAttribute } from '@/models/dapi';
import { resolve } from 'path';
import { type } from 'os';
import { string } from 'mathjs';

@Component({
    templateUrl: 'invoke-multi.component.html',
    styleUrls: ['invoke-multi.component.scss']
})
export class PopupNoticeInvokeMultiComponent implements OnInit {
    private pramsData: any;
    public tx: Transaction;
    public invokeArgs: Invoke[] = [];
    public fee = null;
    public broadcastOverride = null;
    public assetIntentOverrides = null;
    public loading = false;
    public loadingMsg: string;
    private messageID = 0;
    private txHashAttributes: TxHashAttribute[] = null;
    private utxos: UTXO[] = []

    constructor(
        private aRoute: ActivatedRoute,
        private router: Router,
        private global: GlobalService,
        private neon: NeonService,
        private dialog: MatDialog,
        private http: HttpClient,
        private chrome: ChromeService
    ) { }

    ngOnInit(): void {
        this.aRoute.queryParams.subscribe((params: any) => {
            this.pramsData = params;
            this.messageID = params.messageID;
            if (params.network !== undefined) {
                if (params.network === 'MainNet') {
                    this.global.modifyNet('MainNet');
                } else {
                    this.global.modifyNet('TestNet');
                }
            }
            let newJson = this.pramsData.invokeArgs.replace(/([a-zA-Z0-9]+?):/g, '"$1":').replace(/'/g, '"');
            const tempInvokeArgs = JSON.parse(newJson);
            tempInvokeArgs.forEach((item, index) => {
                item.args.forEach((arg, argIndex) => {
                    if (arg.type === 'Address') {
                        const param2 = u.reverseHex(wallet.getScriptHashFromAddress(arg.value));
                        tempInvokeArgs[index].args[argIndex] = param2;
                    } else if(arg.type === 'Boolean') {
                        if(typeof arg.value === 'string') {
                            if((arg.value && arg.value.toLowerCase()) === 'true') {
                                tempInvokeArgs[index].args[argIndex] = true
                            } else if(arg.value && arg.value.toLowerCase() === 'false') {
                                tempInvokeArgs[index].args[argIndex] = false;
                            } else {
                                this.chrome.windowCallback({
                                    error: ERRORS.MALFORMED_INPUT,
                                    return: requestTarget.InvokeMulti,
                                    ID: this.messageID
                                });
                                window.close();
                            }
                        }
                    }
                });
                this.invokeArgs.push({
                    scriptHash: item.scriptHash,
                    operation: item.operation,
                    args: tempInvokeArgs[index].args,
                    triggerContractVerification: item.triggerContractVerification !== undefined
                        ? item.triggerContractVerification.toString() === 'true' : false,
                    attachedAssets: item.attachedAssets
                });
            });
            this.fee = parseFloat(params.fee) || 0;
            if (this.assetIntentOverrides === null && this.pramsData.assetIntentOverrides !== undefined) {
                newJson = this.pramsData.assetIntentOverrides.replace(/([a-zA-Z0-9]+?):/g, '"$1":').replace(/'/g, '"');
                this.assetIntentOverrides = JSON.parse(newJson);
                this.fee = 0;
                this.invokeArgs.forEach(item => {
                    item.attachedAssets = null;
                });
            }
            if (this.txHashAttributes === null && this.pramsData.txHashAttributes !== undefined) {
                newJson = this.pramsData.txHashAttributes.replace(/([a-zA-Z0-9]+?):/g, '"$1":').replace(/'/g, '"')
                this.txHashAttributes = JSON.parse(newJson);
            }
            this.broadcastOverride = this.pramsData.broadcastOverride === 'true' || false;
            setTimeout(() => {
                this.pwdDialog();
            }, 0);
        });
        window.onbeforeunload = () => {
            this.chrome.windowCallback({
                error: ERRORS.CANCELLED,
                return: requestTarget.InvokeMulti,
                ID: this.messageID
            });
        };
    }

    private pwdDialog() {
        this.dialog.open(PwdDialog, {
            disableClose: true
        }).afterClosed().subscribe((pwd) => {
            if (pwd && pwd.length) {
                this.global.log('start transfer with pwd');
                this.createTxForNEP5().then(res => {
                    this.resolveSign(res, pwd);
                }).catch(err => {
                    this.chrome.windowCallback({
                        error: ERRORS.MALFORMED_INPUT,
                        return: requestTarget.InvokeMulti,
                        ID: this.messageID
                    });
                    window.close();
                });
            } else {
                this.global.log('cancel pay');
            }
        });
    }

    private resolveSign(transaction: Transaction, pwd: string) {
        this.loading = true;
        this.loadingMsg = 'Wait';
        if (transaction === null) {
            return;
        }
        this.neon.wallet.accounts[0].decrypt(pwd).then((acc) => {
            try {
                transaction.sign(acc);
            } catch (error) {
                console.log(error);
            }
            this.tx = transaction;
            if (this.broadcastOverride === true) {
                this.loading = false;
                this.loadingMsg = '';
                this.chrome.windowCallback({
                    data: {
                        txid: transaction.hash,
                        signedTx: this.tx.serialize(true)
                    },
                    return: requestTarget.InvokeMulti,
                    ID: this.messageID
                });
                window.close();
            } else {
                console.log(this.tx);
                // this.resolveSend(this.tx);
            }
        }).catch((err) => {
            this.loading = false;
            this.loadingMsg = '';
            this.global.snackBarTip('verifyFailed', err);
            this.dialog.open(PwdDialog, {
                disableClose: true
            }).afterClosed().subscribe((pwdText) => {
                if (pwdText && pwdText.length) {
                    this.global.log('start transfer with pwd');
                    this.resolveSign(transaction, pwdText);
                } else {
                    this.global.log('cancel pay');
                }
            });
        });
    }

    private async resolveSend(transaction: Transaction) {
        new Promise((myResolve) => {
            myResolve(true)
        }).then(res => {
            const triggerContracts = Object.keys(this.invokeArgs.reduce((accum, { scriptHash, triggerContractVerification }) => {
                if (triggerContractVerification) {
                    accum[scriptHash] = true;
                }
                return accum;
            }, {}));
            return Promise.all(triggerContracts.map(scriptHash => this.neon.getVerificationSignatureForSmartContract(scriptHash)))
        }).then(scripts => {
            transaction.scripts = [...scripts, ...transaction.scripts];
            return this.http.post(`${this.global.apiDomain}/v1/transactions/transfer`, {
                signature_transaction: transaction.serialize(true)
            }).subscribe(async (res: any) => {
                this.loading = false;
                this.loadingMsg = '';
                if (!res.bool_status) {
                    this.chrome.windowCallback({
                        error: ERRORS.RPC_ERROR,
                        return: requestTarget.InvokeMulti,
                        ID: this.messageID
                    });
                    this.global.snackBarTip('transferFailed');
                    window.close();
                } else {
                    this.chrome.windowCallback({
                        data: {
                            txid: transaction.hash,
                            nodeUrl: `${this.global.apiDomain}`
                        },
                        return: requestTarget.InvokeMulti,
                        ID: this.messageID
                    });
                    const setData = {};
                    setData[`${this.pramsData.network}TxArr`] = await this.chrome.getLocalStorage(`${this.pramsData.network}TxArr`) || [];
                    setData[`${this.pramsData.network}TxArr`].push('0x' + transaction.hash);
                    this.chrome.setLocalStorage(setData);
                    this.router.navigate([{
                        outlets: {
                            transfer: ['transfer', 'result']
                        }
                    }]);
                    window.close();
                }
            }, err => {
                this.loading = false;
                this.loadingMsg = '';
                this.chrome.windowCallback({
                    error: ERRORS.RPC_ERROR,
                    return: requestTarget.InvokeMulti,
                    ID: this.messageID
                });
                this.global.snackBarTip('transferFailed', err);
            });
        })

    }

    private createTxForNEP5(): Promise<Transaction> {
        return new Promise(async (mResolve, reject) => {
            const fromScript = wallet.getScriptHashFromAddress(this.neon.address);
            let newTx = new tx.InvocationTransaction();
            let script = '';
            let NEOAmount = 0;
            let GASAmount = 0;
            this.invokeArgs.forEach(item => {
                if (this.assetIntentOverrides == null) {
                    if (item.attachedAssets !== null && item.attachedAssets !== undefined) {
                        NEOAmount += Number(item.attachedAssets.NEO || '0');
                        GASAmount += Number(item.attachedAssets.GAS || '0');
                    }
                }
                if (item.scriptHash.length !== 42 && item.scriptHash.length !== 40) {
                    this.chrome.windowCallback({
                        error: ERRORS.MALFORMED_INPUT,
                        return: requestTarget.InvokeMulti,
                        ID: this.messageID
                    });
                    this.loading = false;
                    this.loadingMsg = '';
                    window.close();
                    return null;
                }
                try {
                    script += sc.createScript({
                        scriptHash: item.scriptHash.startsWith('0x')
                            && item.scriptHash.length === 42 ? item.scriptHash.substring(2) : item.scriptHash,
                        operation: item.operation,
                        args: item.args
                    });
                } catch (error) {
                    console.log(error);
                    reject(error);
                }
            });
            newTx.script = script;
            if (this.assetIntentOverrides == null) {
                this.invokeArgs.forEach(async item => {
                    const toScript = item.scriptHash.startsWith('0x') &&
                        item.scriptHash.length === 42 ? item.scriptHash.substring(2) : item.scriptHash;
                    if (item.attachedAssets) {
                        if (item.attachedAssets.NEO) {
                            try {
                                newTx.addOutput({
                                    assetId: NEO.substring(2),
                                    value: new Fixed8(Number(item.attachedAssets.NEO)), scriptHash: toScript
                                });
                            } catch (error) {
                                this.chrome.windowCallback({
                                    error: ERRORS.MALFORMED_INPUT,
                                    return: requestTarget.InvokeMulti,
                                    ID: this.messageID
                                });
                                window.close();
                            }
                        }
                        if (item.attachedAssets.GAS) {
                            try {
                                newTx.addOutput({
                                    assetId: GAS.substring(2),
                                    value: new Fixed8(Number(item.attachedAssets.GAS)), scriptHash: toScript
                                });
                            } catch (error) {
                                this.chrome.windowCallback({
                                    error: ERRORS.MALFORMED_INPUT,
                                    return: requestTarget.InvokeMulti,
                                    ID: this.messageID
                                });
                                console.log(error);
                                window.close();
                            }
                        }
                    }
                });
                if (NEOAmount > 0) {
                    newTx = await this.addInputs(NEO, NEOAmount, fromScript, newTx);
                }
                if (GASAmount > 0) {
                    newTx = await this.addInputs(GAS, GASAmount, fromScript, newTx, this.fee);
                }
                if (this.fee > 0 && GASAmount === 0) {
                    try {
                        newTx = await this.addFee(this.neon.wallet.accounts[0].address, newTx, this.fee);
                    } catch (error) {
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
            mResolve(await this.addAttributes(newTx))
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
        let addScriptHash = '';
        // tslint:disable-next-line:prefer-for-of
        for (let i = 0; i < this.invokeArgs.length; i++) {
            if (this.invokeArgs[i].triggerContractVerification) {
                addScriptHash = this.invokeArgs[i].scriptHash
            }
        }
        if(this.assetIntentOverrides && this.assetIntentOverrides.inputs && this.assetIntentOverrides.inputs.length) {
            this.utxos = this.utxos.concat(await this.getBalance(this.neon.address, NEO));
            this.utxos = this.utxos.concat(await this.getBalance(this.neon.address, GAS));
        }
        if (addScriptHash !== '') {
            transaction.addAttribute(tx.TxAttrUsage.Script, u.reverseHex(addScriptHash));
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

    private addInputs(assetid: string, amount: number, fromScript: string,
        newTx: InvocationTransaction, fee: number = 0): Promise<InvocationTransaction> {
        return new Promise((mResolve, reject) => {
            this.getBalance(this.neon.address, assetid).then((balances: any) => {
                if (balances.length === 0) {
                    reject('no balance');
                }
                let assetId = balances[0].asset_id;
                if (assetId.startsWith('0x') && assetId.length === 66) {
                    assetId = assetId.substring(2);
                }
                let curr = 0.0;
                for (const item of balances) {
                    curr = this.global.mathAdd(curr, parseFloat(item.value) || 0);
                    newTx.inputs.push(new TransactionInput({
                        prevIndex: item.n,
                        prevHash: item.txid.startsWith('0x') && item.txid.length === 66 ? item.txid.substring(2) : item.txid
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
                mResolve(newTx);
            });
        });
    }

    public addFee(from: string, newTx: InvocationTransaction, fee: number = 0): Promise<InvocationTransaction> {
        return new Promise((mResolve, reject) => {
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
                        return: requestTarget.Deploy,
                        ID: this.messageID
                    });
                    window.close();
                }
                if (payback > 0) {
                    const fromScript = wallet.getScriptHashFromAddress(from);
                    let gasAssetId = res[0].asset_id;
                    if (gasAssetId.startsWith('0x') && gasAssetId.length === 66) {
                        gasAssetId = gasAssetId.substring(2);
                    }
                    newTx.addOutput({ assetId: gasAssetId, value: this.global.mathSub(curr, fee), scriptHash: fromScript });
                }
                mResolve(newTx);
            });
        });
    }

}
