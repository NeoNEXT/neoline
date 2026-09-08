import { Injectable } from '@angular/core';
import { CanActivate, Router, UrlTree } from '@angular/router';
import { Observable, of } from 'rxjs';
import { catchError, map, take } from 'rxjs/operators';

import { ChromeService } from '@/app/core/services/chrome.service';
import { STORAGE_NAME } from '@popup/_lib/constant';

/** 资金页只接受 NeoX 钱包，避免将 Neo2/Neo3 地址用于 EVM 查询。 */
@Injectable({ providedIn: 'root' })
export class PerpsFundingGuard implements CanActivate {
  constructor(private chrome: ChromeService, private router: Router) {}

  canActivate(): Observable<boolean | UrlTree> {
    const home = this.router.parseUrl('/popup/home');
    return this.chrome.getStorage(STORAGE_NAME.chainType).pipe(
      take(1),
      map((chainType) => chainType === 'NeoX' ? true : home),
      catchError(() => of(home))
    );
  }
}
