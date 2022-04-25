import { Component, OnInit, Inject } from '@angular/core';
import { MatDialogRef, MAT_DIALOG_DATA } from '@angular/material/dialog';
import { GlobalService, UtilServiceState } from '@app/core';
import { Wallet as Wallet2 } from '@cityofzion/neon-core/lib/wallet';
import { Wallet as Wallet3 } from '@cityofzion/neon-core-neo3/lib/wallet';
import { ChainType } from '../../_lib';

@Component({
    templateUrl: './password.dialog.html',
    styleUrls: ['./password.dialog.scss'],
})
export class PopupPasswordDialogComponent implements OnInit {
    pwd = '';
    showAddress = '';

    constructor(
        private dialogRef: MatDialogRef<PopupPasswordDialogComponent>,
        private global: GlobalService,
        private util: UtilServiceState,
        @Inject(MAT_DIALOG_DATA)
        public data: {
            account: Wallet2 | Wallet3;
            chainType: ChainType;
        }
    ) {}

    ngOnInit() {
        const address: string = this.data.account.accounts[0].address;
        this.showAddress = address.slice(0, 6) + '...' + address.slice(-6);
    }

    public cancel() {
        this.dialogRef.close();
    }

    verify() {
        const account =
            this.data.chainType === 'Neo2'
                ? this.data.account.accounts[0]
                : this.util.getNeo3Account(this.data.account.accounts[0]);
        account
            .decrypt(this.pwd)
            .then(() => {
                this.dialogRef.close(true);
            })
            .catch((err) => {
                this.global.snackBarTip('verifyFailed', err);
            });
    }
}
