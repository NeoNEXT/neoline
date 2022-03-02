import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { MatDialog } from '@angular/material/dialog';

import { PopupQRCodeDialogComponent } from '@popup/_dialogs';
import { PopupNameDialogComponent } from '@popup/_dialogs';

import { GlobalService, NeonService } from '@app/core';
import { wallet } from '@cityofzion/neon-core';
import { wallet as wallet3 } from '@cityofzion/neon-core-neo3';

@Component({
    templateUrl: 'account.component.html',
    styleUrls: ['account.component.scss']
})
export class PopupAccountComponent implements OnInit {
    public address: string;
    public walletName: string;
    publicKey: string;

    constructor(
        private router: Router,
        private global: GlobalService,
        private neon: NeonService,
        private dialog: MatDialog
    ) {
        this.address = '';
        this.walletName = '';
    }

    ngOnInit(): void {
        this.address = this.neon.address;
        this.neon.walletSub().subscribe(() => {
            this.walletName = this.neon.wallet.name;
        });
        this.getPublicKey();
    }

    getPublicKey() {
        const wif =
            this.neon.WIFArr[
                this.neon.walletArr.findIndex(
                    (item) => item.accounts[0].address === this.address
                )
            ];
        const walletThis = this.neon.currentWalletChainType === 'Neo2' ? wallet : wallet3;
        const privateKey = walletThis.getPrivateKeyFromWIF(wif);
        this.publicKey = walletThis.getPublicKeyFromPrivateKey(privateKey);
    }

    public wif() {
        this.router.navigate([
            {
                outlets: {
                    transfer: ['transfer', 'export']
                }
            }
        ]);
    }

    public qrcode() {
        return this.dialog.open(PopupQRCodeDialogComponent, {
            data: this.address
        });
    }

    public updateName() {
        return this.dialog.open(PopupNameDialogComponent, {
            panelClass: 'custom-dialog-panel'
        });
    }

    toWeb() {
        switch (this.neon.currentWalletChainType) {
            case 'Neo2':
                if (this.global.n2Network.explorer) {
                    window.open(`${this.global.n2Network.explorer}address/${this.neon.address}/page/1`)
                }
                break;
            case 'Neo3':
                if (this.global.n3Network.explorer) {
                    window.open(`${this.global.n3Network.explorer}address/${this.neon.address}`)
                }
                break;
        }
    }

    copy(message: string) {
        const input = document.createElement('input');
        input.setAttribute('readonly', 'readonly');
        input.setAttribute('value', message);
        document.body.appendChild(input);
        input.select();
        if (document.execCommand('copy')) {
            document.execCommand('copy');
            this.global.snackBarTip('copied');
        }
        document.body.removeChild(input);
    }
}
