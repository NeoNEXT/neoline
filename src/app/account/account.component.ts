import { Component, OnInit } from '@angular/core';
import { Wallet as Wallet2 } from '@cityofzion/neon-core/lib/wallet';
import { Wallet as Wallet3 } from '@cityofzion/neon-core-neo3/lib/wallet';
import { NeonService, GlobalService } from '@app/core';
import { Router } from '@angular/router';
import { MatDialog } from '@angular/material/dialog';
import { PopupNameDialogComponent } from '@popup/_dialogs';

declare var QRCode: any;

@Component({
    templateUrl: 'account.component.html',
    styleUrls: ['account.component.scss']
})
export class AccountComponent implements OnInit {
    public w: Wallet2 | Wallet3;
    public address: string;
    constructor(
        private neon: NeonService,
        private router: Router,
        private dialog: MatDialog,
        private global: GlobalService
    ) {}

    ngOnInit(): void {
        this.w = this.neon.wallet;
        this.address = this.neon.address;
        if (QRCode) {
            let qrcode = new QRCode('qrcode', {
                text: this.address,
                width: 160,
                height: 160,
                colorDark: '#333333',
                colorLight: '#ffffff',
                correctLevel: QRCode.CorrectLevel.H
            });
        }
    }

    public copied() {
        this.global.snackBarTip('copied');
    }

    public export() {
        this.router.navigate([
            {
                outlets: {
                    transfer: ['transfer', 'export']
                }
            }
        ]);
    }

    public updateName() {
        return this.dialog.open(PopupNameDialogComponent, {
            panelClass: 'custom-dialog-panel'
        });
    }
}
