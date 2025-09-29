import { Injectable } from '@angular/core';
import {
  CanActivate,
  ActivatedRouteSnapshot,
  RouterStateSnapshot,
  Router,
} from '@angular/router';
import { Observable } from 'rxjs';
import { GlobalService } from '../services/global.service';
import { ChromeService } from '../services/chrome.service';
import { STORAGE_NAME } from '@/app/popup/_lib/constant';
import { parseWallet } from '../utils/wallet';

@Injectable()
export class PopupLoginGuard implements CanActivate {
  constructor(private router: Router, private chrome: ChromeService) {}
  canActivate(): Observable<boolean> | Promise<boolean> | boolean {
    return new Promise((resolve) => {
      this.chrome.getStorage(STORAGE_NAME.wallet).subscribe((res) => {
        const w = parseWallet(res);
        if (!w) {
          this.router.navigateByUrl('/popup/wallet/new-guide');
        } else {
          this.chrome.getPassword().then((pwd) => {
            if (!pwd) {
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
  constructor(private chrome: ChromeService, private router: Router) {}
  canActivate(
    route: ActivatedRouteSnapshot,
    state: RouterStateSnapshot
  ): Observable<boolean> | Promise<boolean> | boolean {
    return new Promise((resolve) => {
      this.chrome.getStorage(STORAGE_NAME.wallet).subscribe((res) => {
        const w = parseWallet(res);
        if (!w) {
          resolve(true);
        } else {
          this.chrome.getPassword().then((pwd) => {
            if (!pwd) {
              this.router.navigate(['/popup/login'], {
                queryParams: { returnUrl: state.url },
              });
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
    private router: Router,
    private global: GlobalService,
    private chrome: ChromeService
  ) {}
  canActivate(
    route: ActivatedRouteSnapshot,
    state: RouterStateSnapshot
  ): Observable<boolean> | Promise<boolean> | boolean {
    return new Promise((resolve) => {
      this.chrome.getStorage(STORAGE_NAME.wallet).subscribe((res) => {
        const w = parseWallet(res);
        if (!w) {
          this.global.log('Wallet has not opened yet.');
          this.router.navigate(['/popup/wallet/new-guide'], {
            queryParams: { returnUrl: state.url },
          });
        } else {
          this.chrome.getPassword().then((pwd) => {
            if (!pwd) {
              this.router.navigate(['/popup/login'], {
                queryParams: { returnUrl: state.url },
              });
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
