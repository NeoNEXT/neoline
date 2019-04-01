import {
    Component,
    Input,
    OnInit
} from '@angular/core';
import { MatDialog } from '@angular/material';
import { Router } from '@angular/router';

import { NEO, Balance } from '@models/models';

import {
    ChromeService,
    GlobalService,
    NeonService,
    AssetState
} from '@app/core';

import { Sidenav } from '@popup/_lib/enums';
import { PopupLogoutDialogComponent } from '@popup/_dialogs';
import { runInThisContext } from 'vm';

@Component({
    selector: 'app-sidenav',
    templateUrl: 'sidenav.component.html',
    styleUrls: ['sidenav.component.scss']
})
export class PopupSidenavComponent implements OnInit {
    @Input() sidenav: any;

    public SIDENAV = Sidenav;
    public currentMenu = Sidenav.HOME;
    public wallet: any;
    public balance: Balance;
    public address: string;

    constructor(
        private router: Router,
        private chrome: ChromeService,
        private global: GlobalService,
        private neon: NeonService,
        private asset: AssetState,
        private dialog: MatDialog
    ) { }

    ngOnInit(): void {
        this.wallet = this.neon.wallet;
        this.address = this.neon.address;
        this.asset.detail(NEO).subscribe((res: Balance) => {
            this.balance = res;
        });

        const url = this.router.url;
        if (url.match('home')) {
            this.currentMenu = Sidenav.HOME;
        } else if (url.match('setting') || url.match('wallet')) {
            this.currentMenu = Sidenav.SETTING;
        } else if (url.match('about')) {
            this.currentMenu = Sidenav.ABOUT;
        } else {
            this.currentMenu = Sidenav.HOME;
        }
    }

    public onSidenavChange(sidenav: Sidenav) {
        this.currentMenu = sidenav;
    }

    public closeWallet() {
        this.dialog.open(PopupLogoutDialogComponent).afterClosed().subscribe((confirm) => {
            if (confirm) {
                this.chrome.clearLogin();
                this.router.navigateByUrl('/popup/login');
                // this.chrome.closeWallet();
                // this.global.$wallet.next('close');
                // this.router.navigateByUrl('/popup/wallet');
            }
        });
    }

    public redirect(url: string) {
        window.open(url);
    }

    public web() {
        const id = this.chrome.expand();
    }
}
