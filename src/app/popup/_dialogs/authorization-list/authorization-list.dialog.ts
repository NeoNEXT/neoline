import { Component, OnInit } from '@angular/core';
import { MatDialogRef, MatDialog } from '@angular/material/dialog';
import { ChromeService, NeonService } from '@/app/core';
import { PopupConfirmDialogComponent } from '../confirm/confirm.dialog';

@Component({
    templateUrl: 'authorization-list.dialog.html',
    styleUrls: ['authorization-list.dialog.scss']
})
export class PopupAuthorizationListDialogComponent implements OnInit {
    public authorizationList = [];
    constructor(
        private chrome: ChromeService,
        private dialog: MatDialog,
        private neon: NeonService
    ) {}

    ngOnInit() {
        this.chrome.getAuthorization().subscribe(res => {
            if (res[this.neon.wallet.accounts[0].address] === undefined) {
                res[this.neon.wallet.accounts[0].address] = [];
            }
            this.chrome.setAuthorization(res);
            this.authorizationList = res[this.neon.wallet.accounts[0].address];
        });
    }

    public delItem(hostname: string) {
        const index = this.authorizationList.findIndex(
            item => item.hostname === hostname
        );
        this.authorizationList.splice(index, 1);
        this.chrome.getAuthorization().subscribe(res => {
            res[this.neon.wallet.accounts[0].address] = this.authorizationList;
            this.chrome.setAuthorization(res);
        });
    }

    public delAll() {
        this.dialog
            .open(PopupConfirmDialogComponent, {
                data: 'delAllAuthListConfirm',
                panelClass: 'custom-dialog-panel'
            })
            .afterClosed()
            .subscribe(confirm => {
                if (confirm) {
                    this.authorizationList = [];
                    this.chrome.getAuthorization().subscribe(res => {
                        res[this.neon.wallet.accounts[0].address] = [];
                        this.chrome.setAuthorization(res);
                    });
                }
            });
    }
}
