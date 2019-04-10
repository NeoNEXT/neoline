import { Component, OnInit } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { GlobalService, NeonService } from '@/app/core';
import { Transaction } from '@cityofzion/neon-core/lib/tx';
import { wallet, tx, sc, u } from '@cityofzion/neon-core';
import Neon from '@cityofzion/neon-js';
import { MatDialog } from '@angular/material';
import { PwdDialog } from '@/app/transfer/+pwd/pwd.dialog';

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
        private global: GlobalService,
        private neon: NeonService,
        private dialog: MatDialog
    ) { }

    ngOnInit(): void {
        console.log(Neon.create.scriptBuilder());
        this.aRoute.queryParams.subscribe((params: any) => {
            if (params.network === 'MainNet') {
                this.global.modifyNet('main');
            } else {
                this.global.modifyNet('test');
            }
            this.scriptHash = params.script_hash;
            this.operation = params.operation;

            let newJson = params.args.replace(/([a-zA-Z0-9]+?):/g, '"$1":');
            newJson = newJson.replace(/'/g, '"');
            this.args = JSON.parse(newJson);
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
        });
    }

    private resolveSign(transaction: Transaction, pwd: string) {
        this.neon.wallet.accounts[0].decrypt(pwd).then((acc) => {
            transaction.sign(acc);
            this.tx = transaction;
            this.resolveSend(this.tx);
        }).catch((err) => {
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
        console.log(transaction.serialize(true));
    }

    private createTxForNEP5(): Transaction {
        const fromScript = wallet.getScriptHashFromAddress(this.neon.address);
        const newTx = new tx.InvocationTransaction();
        newTx.script = sc.createScript({
            scriptHash: this.scriptHash,
            operation: this.operation,
            args: this.args
        }) + 'f1';
        newTx.addAttribute(tx.TxAttrUsage.Script, u.reverseHex(fromScript));
        const uniqTag = `from NEOLine at ${new Date().getTime()}`;
        newTx.addAttribute(tx.TxAttrUsage.Remark1, u.reverseHex(u.str2hexstring(uniqTag)));
        return newTx;
    }

}
