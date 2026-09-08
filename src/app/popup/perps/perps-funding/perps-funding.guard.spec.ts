import { TestBed } from '@angular/core/testing';
import { Router, UrlTree } from '@angular/router';
import { RouterTestingModule } from '@angular/router/testing';
import { firstValueFrom, of, throwError } from 'rxjs';

import { ChromeService } from '@/app/core/services/chrome.service';
import { STORAGE_NAME } from '@popup/_lib/constant';
import { PerpsFundingGuard } from './perps-funding.guard';

describe('PerpsFundingGuard', () => {
  let guard: PerpsFundingGuard;
  let chrome: jasmine.SpyObj<ChromeService>;
  let router: Router;

  beforeEach(() => {
    chrome = jasmine.createSpyObj('ChromeService', ['getStorage']);
    TestBed.configureTestingModule({
      imports: [RouterTestingModule],
      providers: [{ provide: ChromeService, useValue: chrome }],
    });
    guard = TestBed.inject(PerpsFundingGuard);
    router = TestBed.inject(Router);
  });

  it('allows NeoX wallets', async () => {
    chrome.getStorage.and.returnValue(of('NeoX'));
    expect(await firstValueFrom(guard.canActivate())).toBeTrue();
    expect(chrome.getStorage).toHaveBeenCalledOnceWith(STORAGE_NAME.chainType);
  });

  ['Neo2', 'Neo3', undefined].forEach((chainType) => {
    it(`redirects ${chainType} to the wallet home`, async () => {
      chrome.getStorage.and.returnValue(of(chainType));
      const result = await firstValueFrom(guard.canActivate());
      expect(result instanceof UrlTree).toBeTrue();
      expect(router.serializeUrl(result as UrlTree)).toBe('/popup/home');
    });
  });

  it('redirects when the chain type cannot be read', async () => {
    chrome.getStorage.and.returnValue(throwError(() => new Error('unavailable')));
    const result = await firstValueFrom(guard.canActivate());
    expect(router.serializeUrl(result as UrlTree)).toBe('/popup/home');
  });
});
