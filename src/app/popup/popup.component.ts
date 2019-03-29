import {Component, OnInit} from '@angular/core';
import { ChromeService, GlobalService, NeonService } from '@app/core';
import { Router, RouterEvent, NavigationEnd } from '@angular/router';

@Component({
    templateUrl: 'popup.component.html',
    styleUrls: ['popup.component.scss']
})

export class PopupComponent implements OnInit {
    public walletIsOpen = false;
    public isThirdParty: boolean = false;
    public address: string;
    public isLogin = false;
    public currentUrl: string = this.router.url;

    constructor(
        private chrome: ChromeService,
        private global: GlobalService,
        private neon: NeonService,
        private router: Router,
    ){
        this.walletIsOpen = false;
        this.isLogin = false;
        this.address = this.neon.address;
    }

    ngOnInit(): void {
        if (this.router.url.indexOf('/notification') >= 0) {
            this.isThirdParty = true;
        }
        if (this.router.url.indexOf('/login') >= 0) {
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
    }
}
