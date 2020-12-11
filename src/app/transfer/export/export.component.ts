import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { NeonService, GlobalService } from '@/app/core';
import { Wallet } from '@cityofzion/neon-core/lib/wallet';
import { MatDialog } from '@angular/material/dialog';
import { PopupNameDialogComponent } from '@/app/popup/_dialogs';

@Component({
    templateUrl: 'export.component.html',
    styleUrls: ['export.component.scss']
})
export class TransferExportComponent implements OnInit {
    public wallet;
    public address: string;
    public verified = false;
    public loading = false;
    public pwd = '';
    public wif: string;
    constructor(
        private router: Router,
        private neon: NeonService,
        private global: GlobalService,
        private dialog: MatDialog
    ) {}

    ngOnInit(): void {
        this.wallet = this.neon.wallet;
        this.address = this.neon.address;
    }

    public verify() {
        if (this.loading) {
            return;
        }
        if (!this.pwd || !this.pwd.length) {
            this.global.snackBarTip('checkInput');
            return;
        }
        this.loading = true;
        this.wallet.accounts[0]
            .decrypt(this.pwd)
            .then(res => {
                this.loading = false;
                this.verified = true;
                this.wif = res.WIF;
            })
            .catch(err => {
                this.loading = false;
                this.global.snackBarTip('verifyFailed', err);
            });
    }
    public close() {
        this.router.navigate([
            {
                outlets: {
                    transfer: null
                }
            }
        ]);
    }

    copy(value: string) {
        const input = document.createElement('input');
        input.setAttribute('readonly', 'readonly');
        input.setAttribute('value', value);
        document.body.appendChild(input);
        input.select();
        if (document.execCommand('copy')) {
            document.execCommand('copy');
            this.global.snackBarTip('copied');
        }
        document.body.removeChild(input);
    }

    public updateName() {
        return this.dialog.open(PopupNameDialogComponent, {
            panelClass: 'custom-dialog-panel'
        });
    }
}
