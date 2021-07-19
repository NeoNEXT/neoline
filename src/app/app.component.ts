import { Component, OnDestroy } from '@angular/core';
import { Router, NavigationEnd } from '@angular/router';
import { ChromeService, GlobalService, NeonService, AssetState } from './core';
import { MatDialog } from '@angular/material/dialog';
import { LogoutDialog } from './+logout/logout.dialog';
import { Wallet as Wallet2 } from '@cityofzion/neon-core/lib/wallet';
import { Wallet as Wallet3 } from '@cityofzion/neon-core-neo3/lib/wallet';
import { HttpClient } from '@angular/common/http';
import { EVENT } from '@/models/dapi';
import { PopupConfirmDialogComponent } from '@popup/_dialogs';
import { ChainId, NetType } from './popup/_lib';
import { NetworkItem, NetworkType } from './popup/_lib/types';
import { NETWORKS } from './popup/_lib/constants';

@Component({
    selector: 'neo-line',
    templateUrl: './app.component.html',
    styleUrls: ['./app.component.scss'],
})
export class AppComponent {
    public walletArr: Array<Wallet2 | Wallet3>;
    public wallet: Wallet2 | Wallet3;
    public address: string;
    public hideNav: boolean = true;
    public walletIsOpen: boolean = false;
    public chainNetworks: Array<NetworkItem>;
    public activeNetwork: NetworkItem;
    public hideNav404: boolean = false;

    constructor(
        private router: Router,
        private chrome: ChromeService,
        private global: GlobalService,
        private neon: NeonService,
        private dialog: MatDialog,
        private assetSer: AssetState,
        private http: HttpClient,
        private neonService: NeonService
    ) {
        this.chrome.getLang().subscribe((res) => {
            this.http
                .get(`/_locales/${res}/messages.json`)
                .subscribe((temp) => {
                    this.global.languageJson = temp;
                });
        });
        this.chrome.getActiveNetwork().subscribe((networkItem: NetworkItem) => {
            if (!networkItem) {
                this.chainNetworks = NETWORKS.Neo2;
                this.activeNetwork = NETWORKS.Neo2[0];
                this.chrome.setActiveNetwork(NETWORKS.Neo2[0]);
                return;
            }
            this.activeNetwork = networkItem;
        });
        this.router.events.subscribe((event) => {
            this.hideNav404 = false;
            this.global.$404.subscribe(() => {
                this.hideNav404 = true;
            });
            if (event instanceof NavigationEnd) {
                this.hideNav =
                    event.url.startsWith('/popup') ||
                    event.url.startsWith('/login');
            }
        });
        this.global.walletListen().subscribe((res) => {
            switch (res) {
                case 'open':
                    this.walletIsOpen = true;
                    break;
                case 'close':
                    this.walletIsOpen = false;
                    break;
            }
        });
        this.neon.walletIsOpen().subscribe((res) => {
            this.global.$wallet.next(res ? 'open' : 'close');
        });
        this.neon.walletSub().subscribe(() => {
            this.wallet = this.neon.wallet;
            this.walletArr = this.neon.walletArr;
            this.address = this.neon.address;
        });
        this.chrome.getActiveNetwork().subscribe((network: NetworkItem) => {
            this.activeNetwork = network;
        });
        if (localStorage.getItem('theme')) {
            const body = document.getElementsByTagName('body')[0];
            body.setAttribute(
                'data-theme-style',
                localStorage.getItem('theme')
            );
        }
    }

    public modifyNet(network: NetworkItem) {
        if (this.activeNetwork.chainId === network.chainId) {
            return;
        }
        this.activeNetwork = network;
        this.global.modifyNet(this.activeNetwork);
        location.reload();
    }

    public isActivityWallet(w: Wallet2 | Wallet3) {
        if (w.accounts[0].address === this.wallet.accounts[0].address) {
            return true;
        } else {
            return false;
        }
    }

    public chooseAccount(w: Wallet2 | Wallet3) {
        if (this.isActivityWallet(w)) {
            return;
        } else {
            this.wallet = this.neon.parseWallet(w);
            this.chrome.setWallet(this.wallet.export());
            location.href = `index.html`;
        }
    }
    public closeWallet() {
        this.dialog
            .open(PopupConfirmDialogComponent, {
                data: 'logoutTip',
                panelClass: 'custom-dialog-panel',
            })
            .afterClosed()
            .subscribe((confirm) => {
                if (confirm) {
                    this.chrome.clearLogin();
                    this.router.navigateByUrl('/login');
                }
            });
    }
    public close() {
        this.dialog
            .open(LogoutDialog, {
                panelClass: 'custom-dialog-container',
            })
            .afterClosed()
            .subscribe((confirm) => {
                if (confirm) {
                    this.chrome.closeWallet();
                    this.global.$wallet.next('close');
                    this.router.navigateByUrl(
                        this.router.url.indexOf('/popup') >= 0
                            ? '/popup/wallet'
                            : '/wallet'
                    );
                }
            });
    }
}
