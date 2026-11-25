import { HardwareSignComponent } from './hardware-sign.component';

describe('HardwareSignComponent OneKey authorization', () => {
  let component: HardwareSignComponent;
  let oneKey: any;

  beforeEach(() => {
    oneKey = {
      supportsWebUsb: true,
      cancel: jasmine.createSpy('cancel'),
      requestDevice: jasmine.createSpy('requestDevice').and.resolveTo(undefined),
      getDeviceStatus: jasmine.createSpy('getDeviceStatus').and.resolveTo({ success: true, payload: [] }),
      getPassphraseState: jasmine.createSpy('getPassphraseState').and.resolveTo({ success: true }),
      signTransaction: jasmine.createSpy('signTransaction').and.resolveTo('signed-tx'),
    };
    component = new HardwareSignComponent({} as any, oneKey, {} as any);
    component.currentWallet = { accounts: [{ extra: { device: 'OneKey' } }] } as any;
  });

  afterEach(() => component.ngOnDestroy());

  it('opens the device picker on entry', async () => {
    await component.connectOneKey();
    expect(component.oneKeyDetecting).toBeFalse();
    expect(component.oneKeyAuthorized).toBeFalse();
    expect(component.oneKeyUsbConnected).toBeFalse();
    expect(oneKey.requestDevice).toHaveBeenCalledOnceWith();
    expect(oneKey.getDeviceStatus).not.toHaveBeenCalled();
  });

  it('automatically signs with an already authorized device', async () => {
    oneKey.requestDevice.and.resolveTo({});
    oneKey.getDeviceStatus.and.resolveTo({ success: true, payload: [{}] });
    const signed = spyOn(component.backWithSignedTx, 'emit');
    await component.connectOneKey();
    expect(oneKey.requestDevice).toHaveBeenCalledOnceWith();
    expect(oneKey.signTransaction).toHaveBeenCalledTimes(1);
    expect(component.oneKeyAuthorized).toBeTrue();
    expect(signed).toHaveBeenCalledOnceWith('signed-tx');
  });

  it('ignores automatic detection after the view is destroyed', async () => {
    let resolve: (value: object) => void;
    oneKey.requestDevice.and.returnValue(new Promise((done) => { resolve = done; }));
    const pending = component.connectOneKey();
    component.ngOnDestroy();
    resolve({});
    await pending;
    expect(oneKey.getDeviceStatus).not.toHaveBeenCalled();
  });

  it('does not start signing after the user closes the view during authorization', async () => {
    let resolve: (value: unknown) => void;
    oneKey.requestDevice.and.returnValue(new Promise((done) => { resolve = done; }));
    const pending = component.connectOneKey();
    expect(oneKey.requestDevice).toHaveBeenCalled();
    component.ngOnDestroy();
    resolve({});
    await pending;
    expect(oneKey.getDeviceStatus).not.toHaveBeenCalled();
  });

  it('allows retry after cancelling the browser picker', async () => {
    oneKey.requestDevice.and.rejectWith({ name: 'NotFoundError' });
    await component.connectOneKey();
    expect(component.oneKeyAuthorized).toBeFalse();
    expect(component.oneKeyConnecting).toBeFalse();
    expect(component.oneKeyError).toBe('');
    expect(oneKey.getDeviceStatus).not.toHaveBeenCalled();
  });

  it('ignores repeated clicks and stops before passphrase entry when closed during discovery', async () => {
    let resolve: (value: object) => void;
    oneKey.requestDevice.and.resolveTo({});
    oneKey.getDeviceStatus.and.returnValue(new Promise((done) => { resolve = done; }));
    const pending = component.connectOneKey();
    await Promise.resolve();
    await component.connectOneKey();
    expect(oneKey.requestDevice).toHaveBeenCalledTimes(1);
    component.ngOnDestroy();
    resolve({ success: true, payload: [{}] });
    await pending;
    expect(oneKey.getPassphraseState).not.toHaveBeenCalled();
    expect(oneKey.signTransaction).not.toHaveBeenCalled();
  });

  it('retries a failed connection without signing twice after success', async () => {
    oneKey.requestDevice.and.resolveTo({});
    oneKey.getDeviceStatus.and.resolveTo({ success: false, payload: { error: 'Disconnected' } });
    await component.connectOneKey();
    expect(component.oneKeyAuthorized).toBeFalse();
    expect(component.oneKeyError).toBe('oneKeyConnectionFailed');
    oneKey.getDeviceStatus.and.resolveTo({ success: true, payload: [{}] });
    await component.connectOneKey();
    await component.connectOneKey();
    expect(component.oneKeyError).toBe('');
    expect(oneKey.signTransaction).toHaveBeenCalledTimes(1);
  });

  it('prompts to unlock when the OneKey is connected but still locked', async () => {
    oneKey.requestDevice.and.resolveTo({});
    oneKey.getDeviceStatus.and.resolveTo({ success: true, payload: [{}] });
    oneKey.getPassphraseState.and.resolveTo({ success: false, payload: { error: 'Device locked' } });
    await component.connectOneKey();
    expect(component.oneKeyUsbConnected).toBeTrue();
    expect(component.oneKeyAuthorized).toBeFalse();
    expect(component.oneKeyError).toBe('');
  });

  it('does not request USB access on unsupported browsers', async () => {
    oneKey.supportsWebUsb = false;
    await component.connectOneKey();
    expect(oneKey.requestDevice).not.toHaveBeenCalled();
  });
});

describe('HardwareSignComponent Ledger authorization', () => {
  let component: HardwareSignComponent;
  let ledger: any;

  beforeEach(() => {
    jasmine.clock().install();
    ledger = {
      requestDevice: jasmine.createSpy('requestDevice').and.resolveTo({}),
      getDeviceStatus: jasmine.createSpy('getDeviceStatus').and.resolveTo('READY'),
      getLedgerSignedTx: jasmine.createSpy('getLedgerSignedTx').and.resolveTo('signed-tx'),
      handleLedgerError: jasmine.createSpy('handleLedgerError'),
      cancel: jasmine.createSpy('cancel'),
    };
    component = new HardwareSignComponent(ledger, {} as any, {} as any);
    component.currentWallet = { accounts: [{ extra: { device: 'Ledger' } }] } as any;
    component.chainType = 'Neo3';
  });

  afterEach(() => {
    component.ngOnDestroy();
    jasmine.clock().uninstall();
  });

  it('authorizes and signs legacy Ledger wallets without a device type', async () => {
    delete component.currentWallet.accounts[0].extra.device;
    const signed = spyOn(component.backWithSignedTx, 'emit');
    component.ngOnInit();
    for (let i = 0; i < 10; i++) await Promise.resolve();
    expect(ledger.requestDevice).toHaveBeenCalledOnceWith();
    expect(signed).toHaveBeenCalledOnceWith('signed-tx');
  });

  it('waits for device authorization before checking the app and signing once', async () => {
    let resolve: (value: object) => void;
    ledger.requestDevice.and.returnValue(new Promise((done) => { resolve = done; }));
    const signed = spyOn(component.backWithSignedTx, 'emit');
    component.ngOnInit();
    expect(ledger.requestDevice).toHaveBeenCalledOnceWith();
    jasmine.clock().tick(10000);
    expect(ledger.getDeviceStatus).not.toHaveBeenCalled();
    resolve({});
    for (let i = 0; i < 10; i++) await Promise.resolve();
    expect(ledger.getDeviceStatus).toHaveBeenCalledTimes(1);
    expect(signed).toHaveBeenCalledOnceWith('signed-tx');
    jasmine.clock().tick(10000);
    expect(ledger.getLedgerSignedTx).toHaveBeenCalledTimes(1);
  });

  it('does not retry authorization when the connect tab is closed', async () => {
    ledger.requestDevice.and.rejectWith(new DOMException('No Ledger selected', 'NotFoundError'));
    const signed = spyOn(component.backWithSignedTx, 'emit');
    component.ngOnInit();
    for (let i = 0; i < 10; i++) await Promise.resolve();
    jasmine.clock().tick(10000);
    expect(ledger.requestDevice).toHaveBeenCalledTimes(1);
    expect(ledger.getDeviceStatus).not.toHaveBeenCalled();
    expect(ledger.handleLedgerError).not.toHaveBeenCalled();
    expect(signed).toHaveBeenCalledOnceWith();
  });

  it('does not start signing when the view closes during authorization', async () => {
    let resolve: (value: object) => void;
    ledger.requestDevice.and.returnValue(new Promise((done) => { resolve = done; }));
    component.ngOnInit();
    component.ngOnDestroy();
    resolve({});
    for (let i = 0; i < 10; i++) await Promise.resolve();
    expect(ledger.getDeviceStatus).not.toHaveBeenCalled();
    expect(ledger.getLedgerSignedTx).not.toHaveBeenCalled();
  });
});
