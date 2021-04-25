import { Component, OnInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { GlobalService, NeonService, ChromeService, AssetState, HttpService, NotificationService } from '@/app/core';
import { Transaction } from '@cityofzion/neon-core-neo3/lib/tx';
import { wallet, tx, sc, u, rpc } from '@cityofzion/neon-core-neo3/lib';
import Neon from '@cityofzion/neon-js-neo3';
import { MatDialog } from '@angular/material/dialog';
import { Observable, from } from 'rxjs';
import { ERRORS, requestTarget, TxHashAttribute } from '@/models/dapi';
import { PopupEditFeeDialogComponent } from '../../_dialogs';
import { GasFeeSpeed } from '../../_lib/type';
import { bignumber } from 'mathjs';
import { NEO3_MAGIC_NUMBER_TESTNET, NEO3_CONTRACT, GAS3_CONTRACT, NEW_POLICY_CONTRACT } from '../../_lib';
import { Neo3TransferService } from '../../transfer/neo3-transfer.service';

@Component({
    templateUrl: 'neo3Invoke.component.html',
    styleUrls: ['neo3Invoke.component.scss']
})
export class PopupNoticeNeo3InvokeComponent implements OnInit {
    public net: string = '';
    public dataJson: any = {};
    public feeMoney = '0';
    public rateCurrency = '';
    public txSerialize = ''
    public assetImageUrl = '';
    public showFeeEdit: boolean = true;

    private pramsData: any;
    public scriptHash = '';
    public operation = '';
    public args = null;
    public tx: Transaction;
    public triggerContractVerification: boolean = false;
    public fee = null;
    public signers = null;
    public minFee = 0;
    public broadcastOverride = null;
    public loading = false;
    public loadingMsg: string;
    private messageID = 0;
    private txHashAttributes: TxHashAttribute[] = null;
    constructor(
        private aRoute: ActivatedRoute,
        private router: Router,
        private global: GlobalService,
        private neon: NeonService,
        private dialog: MatDialog,
        private http: HttpService,
        private chrome: ChromeService,
        private assetState: AssetState,
        private globalService: GlobalService,
        private notification: NotificationService,
        private neo3Transfer: Neo3TransferService,
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
            this.dataJson = this.pramsData;
            this.dataJson.messageID = undefined;
            this.triggerContractVerification = params.triggerContractVerification !== undefined
                ? params.triggerContractVerification.toString() === 'true' : false
            if (params.scriptHash !== undefined && params.operation !== undefined && params.args !== undefined) {
                this.scriptHash = params.scriptHash;
                this.operation = params.operation;
                this.args = this.pramsData.args;
                this.args.forEach((item, index) => {
                    if (item === null || typeof item !== 'object') {
                        return;
                    } else if (item.type === 'Address') {
                        const param2 = sc.ContractParam.hash160(item.value);
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
                        // this.args[index] = Neon.create.contractParam('Integer', item.value.toString());
                    }
                });
                // this.fee = parseFloat(params.fee) || 0;
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
                    this.signers = this.pramsData.signers;
                }
                this.signTx();
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
                return: requestTarget.Invoke,
                ID: this.messageID
            });
            window.close();
        }
    }

    private async resolveSend(transaction: Transaction) {
        this.loading = true;
        this.loadingMsg = 'Wait';
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
        return this.neo3Transfer.sendNeo3Tx(transaction).then(async txHash => {
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
                    nodeUrl: `${this.global.Neo3RPCDomain}`
                },
                return: requestTarget.Invoke,
                ID: this.messageID
            });
            const setData = {};
            setData[`${this.net}TxArr`] = await this.chrome.getLocalStorage(`${this.net}TxArr`) || [];
            setData[`${this.net}TxArr`].push(txHash);
            this.chrome.setLocalStorage(setData);
            this.router.navigate([{
                outlets: {
                    transfer: ['transfer', 'result']
                }
            }]);
            window.close();
        }).catch(err => {
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
            this.signTx()
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
                this.createTxForNeo3()
            }
        })
    }

    public exit() {
        this.chrome.windowCallback({
            error: ERRORS.CANCELLED,
            return: requestTarget.Invoke,
            ID: this.messageID
        });
        window.close();
    }

    private createTxForNeo3(): Observable<Transaction> {
        const rpcClientTemp = new rpc.RPCClient(this.globalService.Neo3RPCDomain);
        const inputs = {
            tokenScriptHash: this.scriptHash,
            systemFee: 0,
            networkFee: bignumber(this.fee).toNumber() || 0,
            operation: this.operation,
            args: this.args,
            signers: this.signers,
            txHashAttributes: this.txHashAttributes
        };
        const vars: any = {};
        async function createTransaction() {
            console.log(`\n\n --- Today's Task ---`);
            // Since the token is now an NEP-5 token, we transfer using a VM script.
            const script = sc.createScript({
                scriptHash: inputs.tokenScriptHash,
                operation: inputs.operation,
                args: inputs.args,
            });

            // We retrieve the current block height as we need to
            const currentHeight = await rpcClientTemp.getBlockCount();
            vars.tx = new tx.Transaction({
                signers: inputs.signers,
                validUntilBlock: currentHeight + 30,
                systemFee: vars.systemFee,
                script,
            });
            console.log('\u001b[32m  ✓ Transaction created \u001b[0m');
        }
        async function checkNetworkFee() {
            const feePerByteInvokeResponse: any = await rpcClientTemp.invokeFunction(
                NEW_POLICY_CONTRACT,
                'getExecFeeFactor',
            );
            if (feePerByteInvokeResponse.state !== 'HALT') {
                if (inputs.networkFee === 0) {
                    throw {
                        msg: 'Unable to retrieve data to calculate network fee.'
                    };
                } else {
                    console.log(
                        '\u001b[31m  ✗ Unable to get information to calculate network fee.  Using user provided value.\u001b[0m'
                    );
                    vars.tx.networkFee = new u.Fixed8(inputs.networkFee);
                }
            }
            const feePerByte = u.Fixed8.fromRawNumber(
                feePerByteInvokeResponse.stack[0].value
            );
            // Account for witness size
            const transactionByteSize = vars.tx.serialize().length / 2 + 109;
            // Hardcoded. Running a witness is always the same cost for the basic account.
            const witnessProcessingFee = u.Fixed8.fromRawNumber(1236390);
            const networkFeeEstimate = feePerByte
                .mul(transactionByteSize)
                .add(witnessProcessingFee);
            vars.tx.networkFee = new u.Fixed8(inputs.networkFee).add(networkFeeEstimate);
            vars.networkFeeEstimate = networkFeeEstimate;
            console.log(
                `\u001b[32m  ✓ Network Fee set: ${vars.tx.networkFee} \u001b[0m`
            );
        }
        async function checkSystemFee() {
            const script = sc.createScript({
                scriptHash: inputs.tokenScriptHash,
                operation: inputs.operation,
                args: inputs.args,
            });
            const invokeFunctionResponse = await rpcClientTemp.invokeScript(
                hexToBase64(script),
                inputs.signers
            );
            if (invokeFunctionResponse.state !== 'HALT') {
                throw {
                    msg: 'Transfer script errored out! You might not have sufficient funds for this transfer.'
                };
            }
            const requiredSystemFee = u.Fixed8.fromRawNumber(invokeFunctionResponse.gasconsumed);
            if (inputs.systemFee && new u.Fixed8(inputs.systemFee) >= requiredSystemFee) {
                vars.tx.systemFee = new u.Fixed8(inputs.systemFee);
                console.log(
                    `  i Node indicates ${requiredSystemFee} systemFee but using user provided value of ${inputs.systemFee}`
                );
            } else {
                vars.tx.systemFee = requiredSystemFee;
            }
            console.log(
                `\u001b[32m  ✓ SystemFee set: ${vars.tx.systemFee.toString()}\u001b[0m`
            );
        }

        function hexToBase64(str: string) {
            return Buffer.from(str, 'hex').toString('base64');
        }
        return from(
            createTransaction()
                .then(checkNetworkFee)
                .then(checkSystemFee)
                .then(() => {
                    return vars.tx;
                })
        );
    }

    private signTx() {
        setTimeout(() => {
            this.loading = true;
            this.createTxForNeo3().subscribe(result => {
                this.resolveSign(result);
            })
        }, 0);
    }
}
