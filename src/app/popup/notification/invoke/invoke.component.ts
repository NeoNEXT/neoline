import { Component, OnInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { GlobalService, NeonService, ChromeService } from '@/app/core';
import { Transaction } from '@cityofzion/neon-core/lib/tx';
import { wallet, tx, sc, u } from '@cityofzion/neon-core';
import { MatDialog } from '@angular/material';
import { PwdDialog } from '@/app/transfer/+pwd/pwd.dialog';
import { HttpClient } from '@angular/common/http';

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
                            this.resolveSign(this.createTxForNEP5(), pwd);
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
        }).subscribe(res => {
            this.loading = false;
            this.loadingMsg = '';
            this.chrome.windowCallback({
                data: transaction.hash,
                target: 'invokeRes'
            });
            this.router.navigate([{
                outlets: {
                    transfer: ['transfer', 'result']
                }
            }]);
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

    private createTxForNEP5(): Transaction {
        const fromScript = wallet.getScriptHashFromAddress(this.neon.address);
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
        newTx.addAttribute(tx.TxAttrUsage.Script, u.reverseHex(fromScript));
        const uniqTag = `from NEOLine at ${new Date().getTime()}`;
        newTx.addAttribute(tx.TxAttrUsage.Remark1, u.reverseHex(u.str2hexstring(uniqTag)));
        return newTx;
    }

}
