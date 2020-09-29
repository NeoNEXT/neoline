import { Component, OnInit } from '@angular/core';
import { MatDialog } from '@angular/material/dialog';
import { PopupBackupTipDialogComponent } from '../_dialogs';
import { NeonService, GlobalService } from '@/app/core';

declare var QRCode: any;

@Component({
    templateUrl: 'backup.component.html',
    styleUrls: ['backup.component.scss']
})
export class PopupBackupComponent implements OnInit {
    showKey = false;
    public address: string;

    constructor(private neon: NeonService, private global: GlobalService, private dialog: MatDialog) {}

    ngOnInit(): void {
        this.address = this.neon.address;
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
        if (QRCode) {
            setTimeout(() => {
                const qrcode = new QRCode('key-qrcode', {
                    text: this.address,
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
        input.setAttribute('value', this.address);
        document.body.appendChild(input);
        input.select();
        if (document.execCommand('copy')) {
            document.execCommand('copy');
            this.global.snackBarTip('copied');
        }
        document.body.removeChild(input);
    }
}
