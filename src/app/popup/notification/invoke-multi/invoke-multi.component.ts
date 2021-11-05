import { Component, OnInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { GlobalService, NeonService, ChromeService, AssetState, HttpService, TransactionState } from '@/app/core';
import { Transaction, TransactionInput, InvocationTransaction } from '@cityofzion/neon-core/lib/tx';
import { wallet, tx, sc, u, rpc } from '@cityofzion/neon-core';


import { MatDialog } from '@angular/material/dialog';
import { NEO, UTXO, GAS } from '@/models/models';
import { Fixed8 } from '@cityofzion/neon-core/lib/u';
import { map } from 'rxjs/operators';
import { ERRORS, requestTarget, Invoke, TxHashAttribute } from '@/models/dapi';
import { PopupEditFeeDialogComponent } from '../../_dialogs';
import Neon from '@cityofzion/neon-js';
import { GasFeeSpeed } from '../../_lib/type';
import { bignumber, min } from 'mathjs';


@Component({
    templateUrl: 'invoke-multi.component.html',
    styleUrls: ['invoke-multi.component.scss']
})
export class PopupNoticeInvokeMultiComponent implements OnInit {
    public net: string = '';
    public dataJson: any = {};
    public feeMoney = '0';
    public rateCurrency = '';
    public txSerialize = ''
    public showFeeEdit: boolean = true;

    private pramsData: any;
    public tx: Transaction;
    public invokeArgs: Invoke[] = [];
    public fee = null;
    public minFee = 0;
    public broadcastOverride = null;
    public assetIntentOverrides = null;
    public loading = false;
    public loadingMsg: string;
    private messageID = 0;
    private txHashAttributes: TxHashAttribute[] = null;
    private utxos: UTXO[] = []

    private extraWitness: [] = [];

    public signAddress;

    constructor(
        private aRoute: ActivatedRoute,
        private router: Router,
        private global: GlobalService,
        private neon: NeonService,
        private dialog: MatDialog,
        private http: HttpService,
        private chrome: ChromeService,
        private assetState: AssetState,
        private txState: TransactionState
    ) {
        this.signAddress = this.neon.address;
    }

    ngOnInit(): void {
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
            this.pramsData.invokeArgs.forEach((item, index) => {
                item.args.forEach((arg, argIndex) => {
                    if (arg.type === 'Address') {
                        const param2 = u.reverseHex(wallet.getScriptHashFromAddress(arg.value));
                        this.pramsData.invokeArgs[index].args[argIndex] = param2;
                    } else if (arg.type === 'Boolean') {
                        if (typeof arg.value === 'string') {
                            if ((arg.value && arg.value.toLowerCase()) === 'true') {
                                this.pramsData.invokeArgs[index].args[argIndex] = true
                            } else if (arg.value && arg.value.toLowerCase() === 'false') {
                                this.pramsData.invokeArgs[index].args[argIndex] = false;
                            } else {
                                this.chrome.windowCallback({
                                    error: ERRORS.MALFORMED_INPUT,
                                    return: requestTarget.InvokeMulti,
                                    ID: this.messageID
                                });
                                window.close();
                            }
                        }
                    } else if (item.type === 'Integer') {
                        this.pramsData.invokeArgs[index].args[argIndex] = Neon.create.contractParam('Integer', item.value.toString())
                    }
                });
                this.invokeArgs.push({
                    scriptHash: item.scriptHash,
                    operation: item.operation,
                    args: this.pramsData.invokeArgs[index].args,
                    triggerContractVerification: item.triggerContractVerification !== undefined
                        ? item.triggerContractVerification.toString() === 'true' : false,
                    attachedAssets: item.attachedAssets
                });
                if ((item.scriptHash === 'f46719e2d16bf50cddcef9d4bbfece901f73cbb6'
                    && item.operation === 'refund' && this.pramsData.hostname.indexOf('flamingo') >= 0)) {
                    this.showFeeEdit = false;
                }
            });
            if (this.pramsData.hostname.indexOf('switcheo') >= 0) {
                this.showFeeEdit = false;
            }
            if (params.minReqFee) {
                this.minFee = Number(params.minReqFee);
            }
            if (params.fee) {
                this.fee = Number(params.fee) || 0;
            } else {
                this.fee = 0;
                if (this.showFeeEdit) {
                    if (this.assetState.gasFeeSpeed) {
                        this.fee = bignumber(this.minFee).add(bignumber(this.assetState.gasFeeSpeed.propose_price)).toNumber();
                    } else {
                        const tempGasFeeSpeed = await this.assetState.getGasFee().toPromise();
                        this.fee = bignumber(this.minFee).add(bignumber(tempGasFeeSpeed.propose_price)).toNumber();
                    }
                }
            }
            if (this.assetIntentOverrides === null && this.pramsData.assetIntentOverrides !== undefined) {
                this.assetIntentOverrides = this.pramsData.assetIntentOverrides
                if(!this.showFeeEdit) {
                    this.fee = 0;
                    this.feeMoney = '0';
                }
                this.invokeArgs.forEach(item => {
                    item.attachedAssets = null;
                });
            }
            if (this.txHashAttributes === null && this.pramsData.txHashAttributes !== undefined) {
                this.txHashAttributes = this.pramsData.txHashAttributes
            }
            if (params.extra_witness !== undefined) {
                this.extraWitness = this.pramsData.extra_witness
            }
            this.broadcastOverride = this.pramsData.broadcastOverride === true || false;
            this.signTx();
        });
        window.onbeforeunload = () => {
            this.chrome.windowCallback({
                error: ERRORS.CANCELLED,
                return: requestTarget.InvokeMulti,
                ID: this.messageID
            });
        };
    }

    private resolveSign(transaction: Transaction) {
        this.loading = true;
        this.loadingMsg = 'Wait';
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
                this.tx = transaction.sign(wif);
            } catch (error) {
                console.log(error);
            }
            this.txSerialize = this.tx.serialize(true);

            this.loading = false
        } catch (error) {
            this.loading = false;
            this.loadingMsg = '';
            this.global.snackBarTip('verifyFailed', error);
            this.chrome.windowCallback({
                error: ERRORS.DEFAULT,
                return: requestTarget.InvokeMulti,
                ID: this.messageID
            });
            window.close();
        }
    }

    private async resolveSend(transaction: Transaction) {

        this.loading = true;
        this.loadingMsg = 'Wait';
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
            let serialize = ''
            try {
                serialize = transaction.serialize(true)
            } catch (error) {
                this.loading = false;
                this.loadingMsg = '';
                this.chrome.windowCallback({
                    error: ERRORS.RPC_ERROR,
                    return: requestTarget.InvokeMulti,
                    ID: this.messageID
                });
                this.global.snackBarTip('transferFailed', error.msg || error);
                return
            }
            return this.txState.rpcSendRawTransaction(serialize).then(async res => {
                if (
                    !res
                ) {
                    throw {
                        msg: 'Transaction rejected by RPC node.'
                    };
                }
                this.loading = false;
                this.loadingMsg = '';
                if (res.error !== undefined) {
                    this.chrome.windowCallback({
                        error: { ...ERRORS.RPC_ERROR, description: res.error.message },
                        return: requestTarget.InvokeMulti,
                        ID: this.messageID
                    });
                    this.global.handlePrcError(res.error, 'Neo2');
                    window.close();
                } else {
                    this.chrome.windowCallback({
                        data: {
                            txid: transaction.hash,
                            nodeUrl: `${this.global.n2Network.rpcUrl}`
                        },
                        return: requestTarget.InvokeMulti,
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
                this.loading = false;
                this.loadingMsg = '';
                this.chrome.windowCallback({
                    error: ERRORS.RPC_ERROR,
                    return: requestTarget.InvokeMulti,
                    ID: this.messageID
                });
                this.global.handlePrcError(err, 'Neo2');
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
                    if (item.attachedAssets !== null && item.attachedAssets !== undefined) {
                        if (item.attachedAssets.NEO) {
                            try {
                                newTx.addOutput({
                                    assetId: NEO.substring(2),
                                    value: new Fixed8(Number(item.attachedAssets.NEO)),
                                    scriptHash: toScript
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
                                    value: new Fixed8(Number(item.attachedAssets.GAS)),
                                    scriptHash: toScript
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
                    try {
                        newTx = await this.addInputs(NEO, NEOAmount, fromScript, newTx);
                    } catch (error) {
                        this.chrome.windowCallback({
                            error: ERRORS.INSUFFICIENT_FUNDS,
                            return: requestTarget.InvokeMulti,
                            ID: this.messageID
                        });
                        window.close();
                    }
                }
                if (GASAmount > 0) {
                    try {
                        newTx = await this.addInputs(GAS, GASAmount, fromScript, newTx, this.fee);
                    } catch (error) {
                        this.chrome.windowCallback({
                            error: ERRORS.INSUFFICIENT_FUNDS,
                            return: requestTarget.InvokeMulti,
                            ID: this.messageID
                        });
                        window.close();
                    }
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
                if (this.fee > 0 && this.showFeeEdit) {
                    try {
                        newTx = await this.addFee(this.neon.wallet.accounts[0].address, newTx, this.fee);
                    } catch (error) {
                        console.log(error);
                    }
                }
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
        if (this.assetIntentOverrides && this.assetIntentOverrides.inputs && this.assetIntentOverrides.inputs.length) {
            this.utxos = this.utxos.concat(await this.assetState.getNeo2Utxo(this.neon.address, NEO).toPromise());
            this.utxos = this.utxos.concat(await this.assetState.getNeo2Utxo(this.neon.address, GAS).toPromise());
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

    private addInputs(assetid: string, amount: number, fromScript: string,
        newTx: InvocationTransaction, fee: number = 0): Promise<InvocationTransaction> {
        return new Promise((mResolve, reject) => {
            this.assetState.getNeo2Utxo(this.neon.address, assetid).subscribe((balances: any) => {
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
            this.assetState.getNeo2Utxo(from, GAS).subscribe(res => {
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
                    this.fee = curr;
                    // reject('no enough GAS to fee');
                    // this.chrome.windowCallback({
                    //     error: ERRORS.INSUFFICIENT_FUNDS,
                    //     return: requestTarget.Deploy,
                    //     ID: this.messageID
                    // });
                    // this.global.snackBarTip('transferFailed', 'no enough GAS to fee');
                }
                if (payback > 0) {
                    const fromScript = wallet.getScriptHashFromAddress(from);
                    let gasAssetId = res[0].asset_id;
                    if (gasAssetId.startsWith('0x') && gasAssetId.length === 66) {
                        gasAssetId = gasAssetId.substring(2);
                    }
                    newTx.addOutput({
                        assetId: gasAssetId, value: this.global.mathSub(curr, fee), scriptHash: fromScript
                    });
                }
                mResolve(newTx);
            });
        });
    }

    public exit() {
        this.chrome.windowCallback({
            error: ERRORS.CANCELLED,
            return: requestTarget.InvokeMulti,
            ID: this.messageID
        });
        window.close();
    }

    public confirm() {
        if (this.broadcastOverride) {
            this.loading = false;
            this.loadingMsg = '';
            this.chrome.windowCallback({
                data: {
                    txid: this.tx.hash,
                    signedTx: this.tx.serialize(true)
                },
                return: requestTarget.InvokeMulti,
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
                fee: this.fee,
                minFee: this.minFee
            }
        }).afterClosed().subscribe(res => {
            if (res || res === 0) {
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
            }
            this.signTx();
        })
    }

    private signTx() {
        setTimeout(() => {
            this.loading = true;
            this.createTxForNEP5().then(result => {
                this.resolveSign(result);
            }).catch(err => {
                if(err === 'no enough GAS to fee') {
                    return;
                }
                this.chrome.windowCallback({
                    error: ERRORS.MALFORMED_INPUT,
                    return: requestTarget.InvokeMulti,
                    ID: this.messageID
                });
                window.close();
            });
        }, 0);
    }
}
