import { Injectable } from '@angular/core';
import { CanActivate, ActivatedRouteSnapshot, RouterStateSnapshot, Router } from '@angular/router';
import { Observable } from 'rxjs';
import { NeonService } from '../services/neon.service';
import { GlobalService } from '../services/global.service';
import { ChromeService } from '../services/chrome.service';
import { STORAGE_NAME } from '@/app/popup/_lib';

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
                    this.chrome.setStorage(STORAGE_NAME.shouldLogin, false);
                    this.router.navigateByUrl('/wallet');
                } else {
                    this.chrome.getStorage(STORAGE_NAME.shouldLogin).subscribe((shoudLogin) => {
                        if (shoudLogin) {
                            this.router.navigateByUrl('/login');
                            this.global.log('Wallet should login.');
                        } else {
                            resolve(res);
                        }
                    });
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
        route: ActivatedRouteSnapshot,
        state: RouterStateSnapshot,
    ): Observable<boolean> | Promise<boolean> | boolean {
        return new Promise(resolve => {
            this.neon.walletIsOpen().subscribe((res: any) => {
                if (!res) {
                    this.chrome.setStorage(STORAGE_NAME.shouldLogin, false);
                    this.router.navigateByUrl('/popup/wallet/new-guide');
                } else {
                    this.chrome.getStorage(STORAGE_NAME.shouldLogin).subscribe((shoudLogin) => {
                        if (shoudLogin) {
                            resolve(true);
                        } else {
                            resolve(false);
                        }
                    });
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
                    this.chrome.setStorage(STORAGE_NAME.shouldLogin, false);
                    this.router.navigateByUrl('/wallet');
                } else {
                    this.chrome.getStorage(STORAGE_NAME.shouldLogin).subscribe((shoudLogin) => {
                        if (shoudLogin) {
                            resolve(true);
                        } else {
                            resolve(false);
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
                    this.chrome.setStorage(STORAGE_NAME.shouldLogin, false);
                    resolve(true);
                } else {
                    this.chrome.getStorage(STORAGE_NAME.shouldLogin).subscribe((shoudLogin) => {
                        if (shoudLogin) {
                            this.router.navigate(['/popup/login'], { queryParams: { returnUrl: state.url }});
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
export class PopupWalletGuard implements CanActivate {
    constructor(
        private neon: NeonService,
        private router: Router,
        private global: GlobalService,
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
                    this.chrome.setStorage(STORAGE_NAME.shouldLogin, false);
                    this.global.log('Wallet has not opened yet.');
                    this.router.navigate(['/popup/wallet/new-guide'], { queryParams: { returnUrl: state.url }});

                } else {
                    this.chrome.getStorage(STORAGE_NAME.shouldLogin).subscribe((shoudLogin) => {
                        if (shoudLogin) {
                            this.router.navigate(['/popup/login'], { queryParams: { returnUrl: state.url }});
                            this.global.log('Wallet should login.');
                        } else {
                            resolve(res);
                        }
                    });
                }
            });
        });
    }
}
