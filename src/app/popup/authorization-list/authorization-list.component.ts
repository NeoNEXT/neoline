import { Component, OnInit } from '@angular/core';
import { AuthorizationData } from '@/models/models';
import { ChromeService, NeonService } from '@/app/core';
import { MatDialog } from '@angular/material';
import { PopupConfirmDialogComponent } from '../_dialogs';

@Component({
    selector: 'app-authorization-list',
    templateUrl: './authorization-list.component.html',
    styleUrls: ['./authorization-list.component.scss']
})
export class PopupAuthorizationListComponent implements OnInit {
    public authorizationList = [];
    constructor(
        private chrome: ChromeService,
        private dialog: MatDialog,
        private neon: NeonService
    ) { }

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
        const index = this.authorizationList.findIndex(item => item.hostname === hostname);
        this.authorizationList.splice(index, 1);
        this.chrome.getAuthorization().subscribe(res => {
            res[this.neon.wallet.accounts[0].address] = this.authorizationList;
            this.chrome.setAuthorization(res);
        });
    }

    public delAll() {
        this.dialog.open(PopupConfirmDialogComponent, {
            data: 'delAllAuthListConfirm'
        }).afterClosed().subscribe((confirm) => {
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
