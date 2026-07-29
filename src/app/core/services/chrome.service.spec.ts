import { ChromeService } from './chrome.service';

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
