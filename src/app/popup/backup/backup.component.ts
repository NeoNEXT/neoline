import { Component, OnInit } from '@angular/core';
import { MatDialog } from '@angular/material/dialog';
import { PopupBackupTipDialogComponent } from '../_dialogs';
import { NeonService, GlobalService, ChromeService } from '@/app/core';

declare var QRCode: any;

@Component({
    templateUrl: 'backup.component.html',
    styleUrls: ['backup.component.scss']
})
export class PopupBackupComponent implements OnInit {
    showKey = false;
    WIF = '';

    constructor(private neon: NeonService, private global: GlobalService, private dialog: MatDialog,
        private chrome: ChromeService) { }

    ngOnInit(): void {
        this.WIF = this.neon.WIFArr[
            this.neon.walletArr.findIndex(item => item.accounts[0].address === this.neon.wallet.accounts[0].address)
        ]
    }

    backup() {
        this.dialog
            .open(PopupBackupTipDialogComponent, {
                panelClass: 'custom-dialog-panel',
                disableClose: true
            })
            .afterClosed()
            .subscribe(confirm => {
                if (confirm) {
                    this.showKey = true;
                    this.showKeyQrCode();
                }
            });
    }

    showKeyQrCode() {
        this.updateWalletStatus();
        if (QRCode) {
            setTimeout(() => {
                const qrcode = new QRCode('key-qrcode', {
                    text: this.WIF,
                    width: 140,
                    height: 140,
                    colorDark: '#333333',
                    colorLight: '#ffffff',
                    correctLevel: QRCode.CorrectLevel.H
                });
            }, 0);
        }
    }

    copy() {
        const input = document.createElement('input');
        input.setAttribute('readonly', 'readonly');
        input.setAttribute('value', this.WIF);
        document.body.appendChild(input);
        input.select();
        if (document.execCommand('copy')) {
            document.execCommand('copy');
            this.global.snackBarTip('copied');
        }
        document.body.removeChild(input);
    }

    updateWalletStatus() {
        this.chrome.setHaveBackupTip(false);
        this.chrome.setWalletsStatus(this.neon.address);
    }
}
