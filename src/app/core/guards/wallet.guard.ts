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
            this.neon.walletIsOpen().subscribe((res: any) => {
                if (!res) {
                    this.chrome.setLogin('false');
                    this.router.navigateByUrl('/wallet');
                } else {
                    const password = this.chrome.getPassword()
                    if(password !== '' && password !== undefined || password !== null) {
                        resolve(res);
                    } else {
                        this.router.navigateByUrl('/login');
                        this.global.log('Wallet should login.');
                    }
                }
            });
        });
    }
}

@Injectable()
export class PopupLoginGuard implements CanActivate {
    constructor(
        private neon: NeonService,
        private router: Router,
        private chrome: ChromeService
    ) { }
    canActivate(
    ): Observable<boolean> | Promise<boolean> | boolean {
        return new Promise(resolve => {
            this.neon.walletIsOpen().subscribe((res: any) => {
                if (!res) {
                    this.chrome.setLogin('false');
                    this.router.navigateByUrl('/popup/wallet/new');
                } else {
                    const password = this.chrome.getPassword()
                    if(password !== '' && password !== undefined && password !== null) {
                        resolve(false);
                    } else {
                        resolve(true);
                    }
                }
            });
        });
    }
}

@Injectable()
export class LoginGuard implements CanActivate {
    constructor(
        private neon: NeonService,
        private router: Router,
        private chrome: ChromeService
    ) { }
    canActivate(
    ): Observable<boolean> | Promise<boolean> | boolean {
        return new Promise(resolve => {
            this.neon.walletIsOpen().subscribe((res: any) => {
                if (!res) {
                    this.chrome.setLogin('false');
                    this.router.navigateByUrl('/wallet');
                } else {
                    const password = this.chrome.getPassword()
                    if(password !== '' && password !== undefined || password !== null) {
                        resolve(false);
                    } else {
                        resolve(true);
                    }
                }
            });
        });
    }
}

@Injectable()
export class OpenedWalletGuard implements CanActivate {
    constructor(
        private neon: NeonService,
        private chrome: ChromeService,
        private router: Router,
    ) { }
    canActivate(
        route: ActivatedRouteSnapshot,
        state: RouterStateSnapshot
    ): Observable<boolean> | Promise<boolean> | boolean {
        return new Promise(resolve => {
            this.neon.walletIsOpen().subscribe((res: any) => {
                if (!res) {
                    this.chrome.setLogin('false');
                    resolve(true);
                } else {
                    const password = this.chrome.getPassword()
                    if(password !== '' && password !== undefined || password !== null) {
                        resolve(true);
                    } else {
                        this.router.navigateByUrl('/popup/login');
                    }
                }
            });
        });
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
            this.neon.walletIsOpen().subscribe((res: any) => {
                if (!res) {
                    if (route.url[0].path === 'notification') {
                        this.chrome.setHistory(state.url);
                    }
                    this.chrome.setLogin('false');
                    this.router.navigateByUrl('/popup/wallet/new');
                    this.global.log('Wallet has not opened yet.');
                } else {
                    const password = this.chrome.getPassword()
                    if(password !== '' && password !== undefined || password !== null) {
                        resolve(res);
                    } else {
                        this.router.navigateByUrl('/popup/login');
                        this.global.log('Wallet should login.');
                    }
                }
            });
        });
    }
}
