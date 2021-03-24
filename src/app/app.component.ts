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
import Neon3, { wallet as wallet3, } from '@cityofzion/neon-js-neo3/lib';
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
    public net: string;
    public hideNav404: boolean = false;

    constructor(
        private router: Router,
        private chrome: ChromeService,
        private global: GlobalService,
        private neon: NeonService,
        private dialog: MatDialog,
        private assetSer: AssetState,
        private http: HttpClient
    ) {
        this.setUpdateNeo3AddressFlag();
        this.updateNeo3Address();
        this.chrome.getLang().subscribe((res) => {
            this.http
                .get(`/_locales/${res}/messages.json`)
                .subscribe((temp) => {
                    this.global.languageJson = temp;
                });
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
        this.chrome.getNet().subscribe((net) => {
            this.net = net;
        });
        if (localStorage.getItem('theme')) {
            const body = document.getElementsByTagName('body')[0];
            body.setAttribute(
                'data-theme-style',
                localStorage.getItem('theme')
            );
        }
    }

    public modifyNet(net: string) {
        if (this.net === net) {
            return;
        }
        this.net = net;
        this.chrome.setNet(net);
        this.global.modifyNet(net);
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
            this.chrome.windowCallback({
                data: {
                    address: this.wallet.accounts[0].address,
                    label: this.wallet.name,
                },
                return: EVENT.ACCOUNT_CHANGED,
            });
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
    public setUpdateNeo3AddressFlag() {
        if (!localStorage.getItem('neo3AddressFlag')) {
            localStorage.setItem('neo3AddressFlag', 'false');
        }
    }
    public updateNeo3Address() {
        console.log(JSON.parse(localStorage.getItem('neo3AddressFlag')))
        if (!JSON.parse(localStorage.getItem('neo3AddressFlag'))) {
            const walletArrNeo3 = JSON.parse(localStorage.getItem('walletArr-Neo3'));
            const WIFArrNeo3 = JSON.parse(localStorage.getItem('WIFArr-Neo3'));
            walletArrNeo3.forEach((item, index) => {
                const account = new wallet3.Account(wallet3.getPrivateKeyFromWIF(WIFArrNeo3[index]));
                console.log('item', item, 'account', account);
                item.accounts[0].address = account.label;
                item.accounts[0].label = account.label;
            });
            localStorage.setItem('walletArr-Neo3', JSON.stringify(walletArrNeo3));
            localStorage.setItem('neo3AddressFlag', 'true');
        }
    }
}
