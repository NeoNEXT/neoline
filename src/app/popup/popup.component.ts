import { Component, OnInit } from '@angular/core';
import { GlobalService, NeonService, ChromeService } from '@app/core';
import { Router, RouterEvent, NavigationEnd } from '@angular/router';
import { MatDialog } from '@angular/material/dialog';
import {
    PopupHomeMenuDialogComponent,
    PopupSetPrivateNetDialogComponent,
} from './_dialogs';
import { RpcNetwork, STORAGE_NAME, NetworkType } from './_lib';

@Component({
    templateUrl: 'popup.component.html',
    styleUrls: ['popup.component.scss'],
})
export class PopupComponent implements OnInit {
    public walletIsOpen = false;
    public isThirdParty: boolean = false;
    public isNotificationComfirm: boolean = false;
    public address: string;
    public isLogin = false;
    public currentUrl: string = this.router.url;
    public networks: RpcNetwork[];
    public selectedNetworkIndex: number;

    constructor(
        private global: GlobalService,
        private neon: NeonService,
        private router: Router,
        private dialog: MatDialog,
        private chromeSer: ChromeService
    ) {
        this.walletIsOpen = false;
        this.isLogin = false;
        this.address = this.neon.address;
        this.networks =
            this.neon.currentWalletChainType === 'Neo2'
                ? this.global.n2Networks
                : this.global.n3Networks;
        this.selectedNetworkIndex =
            this.neon.currentWalletChainType === 'Neo2'
                ? this.global.n2SelectedNetworkIndex
                : this.global.n3SelectedNetworkIndex;
    }

    ngOnInit(): void {
        if (this.router.url.indexOf('/notification') >= 0) {
            this.isThirdParty = true;
            if (
                this.router.url.indexOf('/deploy') >= 0 ||
                this.router.url.indexOf('/invoke') >= 0 ||
                this.router.url.indexOf('/invoke-multi') >= 0 ||
                this.router.url.indexOf('/transfer') >= 0 ||
                this.router.url.indexOf('/signature') >= 0 ||
                this.router.url.indexOf('/neo3-transfer') >= 0 ||
                this.router.url.indexOf('/neo3-invoke-multi') >= 0 ||
                this.router.url.indexOf('/neo3-invoke') >= 0 ||
                this.router.url.indexOf('/neo3-signature') >= 0 ||
                this.router.url.indexOf('/neo3-sign-transaction') >= 0
            ) {
                this.isNotificationComfirm = true;
            }
        }
        if (
            this.router.url.indexOf('/login') >= 0 ||
            this.router.url.indexOf('/wallet/new-guide') >= 0
        ) {
            this.isLogin = true;
        }
        this.router.events.subscribe((res: RouterEvent) => {
            if (res instanceof NavigationEnd) {
                if (res.url.indexOf('/notification') >= 0) {
                    this.isThirdParty = true;
                }
                this.isLogin = res.url.indexOf('login') >= 0;
                this.currentUrl = res.url;
            }
        });
        this.global.walletListen().subscribe((res: any) => {
            this.walletIsOpen = res === 'open' ? true : false;
        });

        this.neon.walletIsOpen().subscribe((res: any) => {
            this.global.$wallet.next(res ? 'open' : 'close');
        });
    }

    public topMenu() {
        this.dialog
            .open(PopupHomeMenuDialogComponent, {
                position: {
                    top: '65px',
                    right: '10px',
                },
                autoFocus: false,
                width: '315px',
                maxWidth: 375,
                maxHeight: 500,
            })
            .afterClosed()
            .subscribe((res) => {
                if (res === 'lock') {
                    this.isLogin = false;
                }
            });
    }

    public modifyNet(index: number) {
        if (index === this.selectedNetworkIndex) {
            return;
        }
        if (
            this.neon.currentWalletChainType === 'Neo2' &&
            !this.global.n2Networks[index].rpcUrl
        ) {
            this.setPrivateNet();
            return;
        }
        if (
            this.neon.currentWalletChainType === 'Neo3' &&
            !this.global.n3Networks[index].rpcUrl
        ) {
            this.setPrivateNet();
            return;
        }
        this.selectedNetworkIndex = index;
        if (this.neon.currentWalletChainType === 'Neo2') {
            this.chromeSer.setStorage(
                STORAGE_NAME.n2SelectedNetworkIndex,
                index
            );
        } else {
            this.chromeSer.setStorage(
                STORAGE_NAME.n3SelectedNetworkIndex,
                index
            );
        }
        location.reload();
    }

    setPrivateNet(e?) {
        e && e.stopPropagation();
        this.dialog.open(PopupSetPrivateNetDialogComponent, {
            panelClass: 'custom-dialog-panel',
            data:
                this.neon.currentWalletChainType === 'Neo2'
                    ? this.global.n2Networks[2]
                    : this.global.n3Networks[2],
        });
    }
}
