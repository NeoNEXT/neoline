import { Component, OnInit, Inject } from '@angular/core';
import { MatDialogRef, MAT_DIALOG_DATA } from '@angular/material/dialog';
import { GlobalService } from '@app/core';
import { WalletInitConstant } from '@popup/_lib/constant';
import { Wallet as Wallet2 } from '@cityofzion/neon-core/lib/wallet';
import { Wallet as Wallet3 } from '@cityofzion/neon-core-neo3/lib/wallet';

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
        @Inject(MAT_DIALOG_DATA)
        public data: {
            account: any;
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
        this.data.account.accounts[0]
            .decrypt(this.pwd)
            .then((res) => {
                this.dialogRef.close(true);
            })
            .catch((err) => {
                this.global.snackBarTip('verifyFailed', err);
            });
    }
}
