import { Component, OnInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { GlobalService, NeonService, ChromeService } from '@/app/core';
import { Transaction, TransactionInput } from '@cityofzion/neon-core/lib/tx';
import { wallet, tx, sc, u } from '@cityofzion/neon-core';
import { MatDialog } from '@angular/material';
import { PwdDialog } from '@/app/transfer/+pwd/pwd.dialog';
import { HttpClient } from '@angular/common/http';
import { NEO, UTXO } from '@/models/models';
import { Observable } from 'rxjs';
import { Fixed8 } from '@cityofzion/neon-core/lib/u';
import { map } from 'rxjs/operators';

@Component({
    templateUrl: 'invoke.component.html',
    styleUrls: ['invoke.component.scss']
})
export class PopupNoticeInvokeComponent implements OnInit {

    public scriptHash = '';
    public operation = '';
    public args = null;
    public tx: Transaction;
    public loading = false;
    public loadingMsg: string;

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
            if (params.network !== undefined) {
                if (params.network === 'MainNet') {
                    this.global.modifyNet('main');
                } else {
                    this.global.modifyNet('test');
                }
            }
            if (params.script_hash !== undefined && params.operation !== undefined && params.args !== undefined) {
                this.scriptHash = params.script_hash;
                this.operation = params.operation;
                if (params.args !== undefined) {
                    let newJson = params.args.replace(/([a-zA-Z0-9]+?):/g, '"$1":');
                    newJson = newJson.replace(/'/g, '"');
                    this.args = JSON.parse(newJson);
                }
                setTimeout(() => {
                    this.dialog.open(PwdDialog, {
                        disableClose: true
                    }).afterClosed().subscribe((pwd) => {
                        if (pwd && pwd.length) {
                            this.global.log('start transfer with pwd');
                            this.createTxForNEP5().then(res => {
                                this.resolveSign(res, pwd);
                            })
                        } else {
                            this.global.log('cancel pay');
                        }
                    });
                }, 0);
            } else {
                return;
            }
        });
    }

    private resolveSign(transaction: Transaction, pwd: string) {
        this.loading = true;
        this.loadingMsg = 'Wait';
        if (transaction === null) {
            return ;
        }
        this.neon.wallet.accounts[0].decrypt(pwd).then((acc) => {
            transaction.sign(acc);
            this.tx = transaction;
            this.resolveSend(this.tx);
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

    private resolveSend(transaction: Transaction) {
        return this.http.post(`${this.global.apiDomain}/v1/transactions/transfer`, {
            signature_transaction: transaction.serialize(true)
        }).subscribe((res: any) => {
            this.loading = false;
            this.loadingMsg = '';
            if (!res.bool_status) {
                this.chrome.windowCallback({
                    data: 'rpcWrong',
                    target: 'invokeRes'
                });
                this.global.snackBarTip('transferFailed');
            } else {
                this.chrome.windowCallback({
                    data: transaction.hash,
                    target: 'invokeRes'
                });
                this.router.navigate([{
                    outlets: {
                        transfer: ['transfer', 'result']
                    }
                }]);
            }
        }, err => {
            this.loading = false;
            this.loadingMsg = '';
            this.chrome.windowCallback({
                data: 'rpcWrong',
                target: 'invokeRes'
            });
            this.global.snackBarTip('transferFailed', err);
        });
    }

    private createTxForNEP5(): Promise<Transaction> {
        return new Promise(resolve => {
            const fromScript = wallet.getScriptHashFromAddress(this.neon.address);
            const toScript = this.scriptHash.startsWith('0x') && this.scriptHash.length === 42 ? this.scriptHash.substring(2) : this.scriptHash;
            const newTx = new tx.InvocationTransaction();
            if (this.scriptHash.length !== 42  && this.scriptHash.length !== 40 ) {
                this.chrome.windowCallback({
                    data: 'invalid_arguments',
                    target: 'invokeRes'
                });
                this.loading = false;
                this.loadingMsg = '';
                return null;
            }
            newTx.script = sc.createScript({
                scriptHash: this.scriptHash.startsWith('0x') && this.scriptHash.length === 42 ? this.scriptHash.substring(2) : this.scriptHash,
                operation: this.operation,
                args: this.args
            }) + 'f1';
            // this.getBalance(this.neon.address, NEO).subscribe((balances: any) => {
            //     balances = balances.result;
            //     if (fromScript.length !== 40 || toScript.length !== 40) {
            //         throw new Error('target address error');
            //     }
            //     if (balances.length === 0) {
            //         throw new Error('no balance');
            //     }
            //     let assetId = balances[0].asset_id;
            //     if (assetId.startsWith('0x') && assetId.length === 66) {
            //         assetId = assetId.substring(2);
            //     }
            //     newTx.addOutput({ assetId, value: new Fixed8(1), scriptHash: toScript });
            //     let curr = 0.0;
            //     for (const item of balances) {
            //         curr += parseFloat(item.value) || 0;
            //         newTx.inputs.push(new TransactionInput({
            //             prevIndex: item.n, prevHash: item.txid.startsWith('0x') && item.txid.length == 66 ? item.txid.substring(2) : item.txid }));
            //         if (curr >= 1) {
            //             break;
            //         }
            //     }
            //     const payback = curr - 1;
            //     if (payback < 0) {
            //         throw new Error('no enough balance to pay');
            //     }
            //     if (payback > 0) {
            //         newTx.addOutput({ assetId, value: new Fixed8(payback), scriptHash: fromScript });
            //     }
            // });
            newTx.addAttribute(tx.TxAttrUsage.Script, u.reverseHex(fromScript));
            const uniqTag = `from NEOLine at ${new Date().getTime()}`;
            newTx.addAttribute(tx.TxAttrUsage.Remark1, u.reverseHex(u.str2hexstring(uniqTag)));
            resolve(newTx);
        });
    }

    private getBalance(address: string, asset: string): Observable<UTXO[]> {
        return this.http.get(`${this.global.apiDomain}/v1/transactions/getutxoes?address=${address}&asset_id=${asset}`).pipe(map((res) => {
            return res as UTXO[];
        }));
    }

}
