import { Component, OnInit } from '@angular/core';
import { AuthorizationData } from '@/models/models';
import { ChromeService } from '@/app/core';
import { MatDialog } from '@angular/material';
import { PopupConfirmDialogComponent } from '../_dialogs';

@Component({
    selector: 'app-authorization-list',
    templateUrl: './authorization-list.component.html',
    styleUrls: ['./authorization-list.component.scss']
})
export class PopupAuthorizationListComponent implements OnInit {
    public objectKeys = Object.keys;
    public authorizationList = {};
    constructor(
        private chrome: ChromeService,
        private dialog: MatDialog
    ) { }

    ngOnInit() {
        this.chrome.getAuthorization().subscribe(res => {
            this.authorizationList = res;
        });
    }

    public delItem(hostname: string) {
        delete this.authorizationList[hostname];
        this.chrome.setAuthorization(this.authorizationList);
    }

    public delAll() {
        this.dialog.open(PopupConfirmDialogComponent, {
            data: 'delAllAuthListConfirm'
        }).afterClosed().subscribe((confirm) => {
            if (confirm) {
                this.authorizationList = {};
                this.chrome.setAuthorization(this.authorizationList);
            }
        });
    }

}
