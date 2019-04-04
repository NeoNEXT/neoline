import { Injectable } from '@angular/core';
import { CanActivate, ActivatedRouteSnapshot, RouterStateSnapshot, Navigation, Router, ActivatedRoute } from '@angular/router';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { NeonService } from '../services/neon.service';
import { GlobalService } from '../services/global.service';
import { ChromeService } from '../services/chrome.service';

@Injectable()
export class WalletGuard implements CanActivate {
    constructor(
        private neon: NeonService,
        private router: Router,
        private global: GlobalService,
        private chrome: ChromeService
    ) { }
    canActivate(
        route: ActivatedRouteSnapshot,
        state: RouterStateSnapshot
    ): Observable<boolean> | Promise<boolean> | boolean {
        return new Promise(resolve => {
            this.chrome.getWallet().subscribe((res: any) => {
                if (res === undefined || res === {} || res === null) {
                    this.router.navigateByUrl('/wallet');
                } else {
                    this.chrome.getLogin().subscribe((shoudLogin) => {
                        if (shoudLogin) {
                            this.router.navigateByUrl('/login');
                            this.global.log('Wallet should login.');
                        } else {
                            resolve(true);
                        }
                    });
                }
            });
        });
    }
}

@Injectable()
export class OpenedWalletGuard implements CanActivate {
    constructor(
        private neon: NeonService
    ) { }
    canActivate(
        route: ActivatedRouteSnapshot,
        state: RouterStateSnapshot
    ): Observable<boolean> | Promise<boolean> | boolean {
        return this.neon.walletIsOpen().pipe(map((res) => {
            return !res;
        }));
    }
}

@Injectable()
export class PopupWalletGuard implements CanActivate {
    constructor(
        private neon: NeonService,
        private router: Router,
        private global: GlobalService,
        private aRoute: ActivatedRoute,
        private chrome: ChromeService
    ) {
    }
    canActivate(
        route: ActivatedRouteSnapshot,
        state: RouterStateSnapshot,
    ): Observable<boolean> | Promise<boolean> | boolean {
        return new Promise(resolve => {
            this.chrome.getWallet().subscribe((res: any) => {
                if (res === undefined || res === {} || res === null) {
                    if (route.url[0].path === 'notification') {
                        this.chrome.setHistory(state.url);
                    }
                    this.router.navigateByUrl('/popup/wallet');
                    this.global.log('Wallet has not opened yet.');
                } else {
                    this.chrome.getLogin().subscribe((shoudLogin) => {
                        if (shoudLogin) {
                            this.router.navigateByUrl('/popup/login');
                            this.global.log('Wallet should login.');
                        } else {
                            resolve(true);
                        }
                    });
                }
            });
        });
    }
}
