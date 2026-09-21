import { of } from 'rxjs';
import { AddressSelectorComponent } from './address-selector.component';

describe('AddressSelectorComponent OneKey automatic connection', () => {
  let component: AddressSelectorComponent;
  let oneKey: any;

  beforeEach(() => {
    oneKey = {
      supportsWebUsb: true,
      requestDevice: jasmine.createSpy().and.resolveTo({}),
      getDeviceStatus: jasmine.createSpy().and.resolveTo({ success: true, payload: [{}] }),
      getPassphraseState: jasmine.createSpy().and.resolveTo({ success: true }),
      fetchAccounts: jasmine.createSpy().and.resolveTo([{ address: 'account' }]),
      cancel: jasmine.createSpy(),
    };
    component = new AddressSelectorComponent({} as any, oneKey, {} as any, {
      select: () => of({
        neo2WalletArr: [], neo3WalletArr: [], neoXWalletArr: [],
        neoXNetworks: [{ chainId: 1 }], neoXNetworkIndex: 0,
      }),
    } as any, {} as any);
    component.device = 'OneKey';
    component.chainType = 'Neo3';
  });

  afterEach(() => component.ngOnDestroy());

  it('loads accounts on entry without requiring Connect', async () => {
    component.ngOnInit();
    for (let i = 0; i < 10; i++) await Promise.resolve();
    expect(oneKey.requestDevice).toHaveBeenCalledOnceWith();
    expect(oneKey.fetchAccounts).toHaveBeenCalledWith(1, 'Neo3');
    expect(component.isReady).toBeTrue();
    expect(component.accounts).toEqual([{ address: 'account' }]);
  });

  it('opens the device picker on entry', async () => {
    oneKey.requestDevice.and.resolveTo(undefined);
    await component.connectOneKey();
    expect(component.oneKeyDetecting).toBeFalse();
    expect(component.oneKeyAuthorized).toBeFalse();
    expect(component.oneKeyUsbConnected).toBeFalse();
    expect(oneKey.getDeviceStatus).not.toHaveBeenCalled();
    expect(oneKey.requestDevice).toHaveBeenCalledOnceWith();
  });

  it('reloads the current page after an address request fails', async () => {
    await component.connectOneKey();
    oneKey.fetchAccounts.and.rejectWith(new Error('Disconnected'));
    component.nextPage();
    for (let i = 0; i < 10; i++) await Promise.resolve();
    expect(component.oneKeyAuthorized).toBeFalse();
    oneKey.fetchAccounts.and.resolveTo([{ address: 'reconnected-account' }]);
    await component.connectOneKey();
    expect(oneKey.fetchAccounts).toHaveBeenCalledWith(2, 'Neo3');
    expect(component.isReady).toBeTrue();
    expect(component.accounts).toEqual([{ address: 'reconnected-account' }]);
  });

  it('prompts to unlock when the OneKey is connected but still locked', async () => {
    oneKey.getPassphraseState.and.resolveTo({ success: false, payload: { error: 'Device locked' } });
    await component.connectOneKey();
    expect(component.oneKeyUsbConnected).toBeTrue();
    expect(component.oneKeyAuthorized).toBeFalse();
    expect(component.isReady).toBeFalse();
    expect(component.oneKeyError).toBe('');
  });
});
