import {
    Component,
    OnInit,
    AfterViewInit,
    OnDestroy
} from '@angular/core';
import {
    ChromeService,
    GlobalService,
    NeonService,
    AssetState
} from '@app/core';
import {
    Router,
    RouterEvent,
    NavigationEnd
} from '@angular/router';
import { MatDialog } from '@angular/material/dialog';
import { PopupHomeMenuDialogComponent } from './_dialogs';

@Component({
    templateUrl: 'popup.component.html',
    styleUrls: ['popup.component.scss']
})

export class PopupComponent implements OnInit, AfterViewInit {
    public walletIsOpen = false;
    public isThirdParty: boolean = false;
    public isNotificationComfirm: boolean = false;
    public address: string;
    public isLogin = false;
    public currentUrl: string = this.router.url;
    public net: string;

    constructor(
        private chrome: ChromeService,
        private global: GlobalService,
        private neon: NeonService,
        private router: Router,
        private dialog: MatDialog,
        private assetSer: AssetState
    ) {
        this.walletIsOpen = false;
        this.isLogin = false;
        this.address = this.neon.address;
    }

    ngOnInit(): void {
        if (this.router.url.indexOf('/notification') >= 0) {
            this.isThirdParty = true;
            if(this.router.url.indexOf('/deploy') >= 0 || this.router.url.indexOf('/invoke') >= 0
                || this.router.url.indexOf('/invoke-multi') >= 0 || this.router.url.indexOf('/transfer') >= 0 ) {
                    this.isNotificationComfirm = true
            }
        }
        if (this.router.url.indexOf('/login') >= 0 || this.router.url.indexOf('/wallet/new-guide') >= 0) {
            this.isLogin = true;
        }
        this.router.events.subscribe((res: RouterEvent) => {
            if (res instanceof NavigationEnd) {
                if (res.url.indexOf('/notification') >= 0) {
                    this.isThirdParty = true;
                }
                this.currentUrl = res.url;
            }
        });
        this.global.walletListen().subscribe((res: any) => {
            this.walletIsOpen = res === 'open' ? true : false;
        });

        this.neon.walletIsOpen().subscribe((res: any) => {
            this.global.$wallet.next(res ? 'open' : 'close');
        });
        if (this.global.net === 'TestNet') {
            this.net = 'TestNet';
        } else {
            this.net = 'MainNet';
        }
    }
    ngAfterViewInit(): void {
        setTimeout(() => {
            if (this.global.net === 'TestNet') {
                this.net = 'TestNet';
            } else {
                this.net = 'MainNet';
            }
        }, 0);
    }

    public topMenu() {
        this.dialog.open(PopupHomeMenuDialogComponent, {
            position: {
                top: '65px',
                right: '10px'
            },
            autoFocus: false,
            width: '315px',
            maxWidth: 375,
            maxHeight: 500,
        }).afterClosed().subscribe((res) => {
            if(res === 'lock') {
                this.isLogin = false
            }
        });
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
}
