import { ChromeService } from './chrome.service';
import { firstValueFrom } from 'rxjs';
import { STORAGE_NAME } from '@popup/_lib';

describe('ChromeService session password', () => {
  it('resolves setPassword only after extension session storage is committed', async () => {
    let storedPassword: string;
    const crx = {
      isCrx: () => true,
      setSessionStorage: jasmine
        .createSpy('setSessionStorage')
        .and.callFake(
          (value: { password: string }) =>
            new Promise<void>((resolve) => {
              setTimeout(() => {
                storedPassword = value.password;
                resolve();
              }, 0);
            })
        ),
      getSessionStorage: jasmine
        .createSpy('getSessionStorage')
        .and.callFake((_key: string, callback: (value: string) => void) => {
          callback(storedPassword);
          return Promise.resolve(storedPassword);
        }),
    };
    const service = new ChromeService(crx as any);

    await service.setPassword('correct horse battery staple');

    expect(storedPassword).toBeTruthy();
    expect(storedPassword).not.toBe('correct horse battery staple');
    await expectAsync(service.getPassword()).toBeResolvedTo(
      'correct horse battery staple'
    );
  });

  it('propagates extension session storage failures to awaiting callers', async () => {
    const crx = {
      isCrx: () => true,
      setSessionStorage: () =>
        Promise.reject(new Error('session storage unavailable')),
    };
    const service = new ChromeService(crx as any);

    await expectAsync(service.setPassword('password')).toBeRejectedWithError(
      'session storage unavailable'
    );
  });
});

describe('ChromeService startup storage', () => {
  it('reads all local startup keys with one extension request', async () => {
    const crx = {
      isCrx: () => true,
      getLocalStorage: jasmine
        .createSpy('getLocalStorage')
        .and.callFake((keys: STORAGE_NAME[], callback: (value: any) => void) => {
          const value = {
            [STORAGE_NAME.wallet]: { accounts: [{ address: 'Nabc' }] },
            [STORAGE_NAME['walletArr-Neo3']]: [{ name: 'Account 1' }],
          };
          callback(value);
          return Promise.resolve(value);
        }),
    };
    const service = new ChromeService(crx as any);

    const result = await firstValueFrom(
      service.getStorages([
        STORAGE_NAME.wallet,
        STORAGE_NAME['walletArr-Neo3'],
        STORAGE_NAME.n3Networks,
      ])
    );

    expect(crx.getLocalStorage).toHaveBeenCalledTimes(1);
    expect(crx.getLocalStorage.calls.mostRecent().args[0]).toEqual([
      STORAGE_NAME.wallet,
      STORAGE_NAME['walletArr-Neo3'],
      STORAGE_NAME.n3Networks,
    ]);
    expect(result[STORAGE_NAME.wallet].accounts[0].address).toBe('Nabc');
    expect(result[STORAGE_NAME['walletArr-Neo3']].length).toBe(1);
    expect(result[STORAGE_NAME.n3Networks].length).toBeGreaterThan(0);
  });
});

describe('ChromeService shouldFindNode storage', () => {
  it('reads and writes shouldFindNode through extension session storage', async () => {
    let storedValue = true;
    const crx = {
      isCrx: () => true,
      getSessionStorage: jasmine
        .createSpy('getSessionStorage')
        .and.callFake((_key: STORAGE_NAME, callback: (value: boolean) => void) => {
          callback(storedValue);
          return Promise.resolve(storedValue);
        }),
      setSessionStorage: jasmine
        .createSpy('setSessionStorage')
        .and.callFake((value: Record<string, boolean>) => {
          storedValue = value[STORAGE_NAME.shouldFindNode];
          return Promise.resolve();
        }),
    };
    const service = new ChromeService(crx as any);

    await expectAsync(service.getShouldFindNode()).toBeResolvedTo(true);
    await service.setShouldFindNode(false);

    expect(crx.getSessionStorage).toHaveBeenCalledWith(
      STORAGE_NAME.shouldFindNode,
      jasmine.any(Function)
    );
    expect(crx.setSessionStorage).toHaveBeenCalledWith({
      [STORAGE_NAME.shouldFindNode]: false,
    });
    await expectAsync(service.getShouldFindNode()).toBeResolvedTo(false);
  });
});
