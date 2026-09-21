import { of } from 'rxjs';
import { OneKeyService } from './onekey.service';
import { LEDGER_PAGE_SIZE } from '@/app/popup/_lib';
import { ONEKEY_WEBUSB_FILTER } from '@onekeyfe/hd-shared';

const grantedOneKey = {
  vendorId: ONEKEY_WEBUSB_FILTER[0].vendorId,
  productId: ONEKEY_WEBUSB_FILTER[0].productId,
  serialNumber: 'granted-device',
};

function mockUsb(usb: object) {
  const original = Object.getOwnPropertyDescriptor(navigator, 'usb');
  Object.defineProperty(navigator, 'usb', { configurable: true, value: usb });
  return () => {
    if (original) Object.defineProperty(navigator, 'usb', original);
    else delete (navigator as any).usb;
  };
}

async function whenTrue(check: () => boolean) {
  for (let i = 0; i < 20; i++) {
    if (check()) return;
    await Promise.resolve();
  }
  throw new Error('condition not met');
}

describe('OneKeyService web SDK initialization', () => {
  let service: OneKeyService;
  let sdk: typeof import('@onekeyfe/hd-web-sdk').default.HardwareWebSdk;
  let events: typeof import('@onekeyfe/hd-core');

  beforeEach(async () => {
    service = new OneKeyService({
      select: () => of({ neoXNetworks: [{ chainId: 47763 }], neoXNetworkIndex: 0 }),
    } as any, {} as any);
    const sdkModule = await import('@onekeyfe/hd-web-sdk');
    sdk = sdkModule.default.HardwareWebSdk;
    events = await import('@onekeyfe/hd-core');
    spyOn(sdk, 'init').and.resolveTo(true);
    spyOn(sdk, 'on');
    spyOn(sdk, 'dispose');
    spyOn(sdk, 'uiResponse');
    spyOn(sdk, 'searchDevices').and.resolveTo({ success: true, payload: [] });
  });

  it('initializes the published HardwareWebSdk once with WebUSB and a versioned iframe', async () => {
    await Promise.all([service.getDeviceStatus(), service.getDeviceStatus()]);
    expect(sdk.init).toHaveBeenCalledOnceWith(jasmine.objectContaining({
      env: 'webusb',
      connectSrc: 'https://jssdk.onekey.so/1.2.0/',
      fetchConfig: true,
    }));
    expect(sdk.on).toHaveBeenCalledTimes(1);
    expect(sdk.searchDevices).toHaveBeenCalledTimes(2);
  });

  it('keeps PIN and passphrase entry on the hardware device', async () => {
    await service.getDeviceStatus();
    const [event, handleUi] = (sdk.on as jasmine.Spy).calls.mostRecent().args;
    expect(event).toBe(events.UI_EVENT);
    handleUi({ type: events.UI_REQUEST.REQUEST_PIN });
    expect(sdk.uiResponse).toHaveBeenCalledWith({
      type: events.UI_RESPONSE.RECEIVE_PIN,
      payload: '@@ONEKEY_INPUT_PIN_IN_DEVICE',
    });
    handleUi({ type: events.UI_REQUEST.REQUEST_PASSPHRASE });
    expect(sdk.uiResponse).toHaveBeenCalledWith({
      type: events.UI_RESPONSE.RECEIVE_PASSPHRASE,
      payload: { value: '', passphraseOnDevice: true, save: true },
    });
  });

  it('disposes a failed iframe initialization and permits retry', async () => {
    (sdk.init as jasmine.Spy).and.resolveTo(false);
    await expectAsync(service.getDeviceStatus()).toBeRejectedWithError(
      'OneKey SDK initialization failed'
    );
    expect(sdk.dispose).toHaveBeenCalledTimes(1);
    expect(sdk.searchDevices).not.toHaveBeenCalled();
    (sdk.init as jasmine.Spy).and.resolveTo(true);
    await service.getDeviceStatus();
    expect(sdk.init).toHaveBeenCalledTimes(2);
    expect(sdk.searchDevices).toHaveBeenCalledTimes(1);
  });
});

describe('OneKeyService WebUSB', () => {
  let service: OneKeyService;
  let sdk: any;
  const device: any = { connectId: 'selected-device', deviceId: 'device-id' };

  beforeEach(() => {
    service = new OneKeyService({
      select: () => of({ neoXNetworks: [{ chainId: 47763 }], neoXNetworkIndex: 0 }),
    } as any, {} as any);
    sdk = jasmine.createSpyObj('OneKeySdk', [
      'searchDevices', 'neoGetAddress', 'evmGetAddress', 'neoSignTransaction',
      'evmSignTransaction', 'evmSignMessage', 'getPassphraseState', 'cancel',
    ]);
    (service as any).hardwareSdkPromise = Promise.resolve(sdk);
    (service as any).selectedUsbPath = device.connectId;
    (service as any).deviceInfo = device;
  });

  it('opens the USB picker when no authorized device is connected', async () => {
    spyOn(service as any, 'canShowWebUsbChooser').and.returnValue(true);
    const requestDevice = jasmine.createSpy('requestDevice').and.resolveTo({
      serialNumber: 'picked-device',
    });
    const restore = mockUsb({
      requestDevice,
      getDevices: jasmine.createSpy('getDevices').and.resolveTo([]),
    });
    try {
      (service as any).accounts.Neo3[1] = ['old-account'];
      expect((await service.requestDevice()).serialNumber).toBe('picked-device');
      expect(requestDevice).toHaveBeenCalledWith({ filters: ONEKEY_WEBUSB_FILTER });
      expect((service as any).accounts).toEqual({ Neo3: {}, NeoX: {} });
    } finally {
      restore();
    }
  });

  it('reuses a previously authorized OneKey instead of opening the USB picker', async () => {
    const requestDevice = jasmine.createSpy('requestDevice');
    const restore = mockUsb({
      requestDevice,
      getDevices: jasmine.createSpy('getDevices').and.resolveTo([grantedOneKey]),
    });
    try {
      (service as any).accounts.Neo3[1] = ['old-account'];
      const pending = service.requestDevice();
      await pending;
      expect(requestDevice).not.toHaveBeenCalled();
      expect((service as any).selectedUsbPath).toBe('granted-device');
      expect((service as any).accounts).toEqual({ Neo3: {}, NeoX: {} });
    } finally {
      restore();
    }
  });

  describe('authorization tab', () => {
    let getDevices: jasmine.Spy;
    let requestDevice: jasmine.Spy;
    let tabs: any;
    let originalChrome: any;
    let restoreUsb: () => void;

    beforeEach(() => {
      jasmine.clock().install();
      getDevices = jasmine.createSpy('getDevices').and.resolveTo([]);
      requestDevice = jasmine.createSpy('requestDevice');
      restoreUsb = mockUsb({ getDevices, requestDevice });
      spyOn(service as any, 'canShowWebUsbChooser').and.returnValue(false);
      originalChrome = (window as any).chrome;
      tabs = {
        create: jasmine.createSpy('create').and.callFake((_opts, cb) => cb({ id: 9 })),
        remove: jasmine.createSpy('remove'),
        onRemoved: jasmine.createSpyObj('onRemoved', ['addListener', 'removeListener']),
      };
      (window as any).chrome = {
        runtime: { getURL: (path: string) => `chrome-extension://ext-id${path}` },
        tabs,
      };
    });

    afterEach(() => {
      jasmine.clock().uninstall();
      restoreUsb();
      (window as any).chrome = originalChrome;
    });

    it('detects authorization without a USB connect event and leaves the tab open', async () => {
      const pending = service.requestDevice();
      await whenTrue(() => tabs.create.calls.any());
      expect(requestDevice).not.toHaveBeenCalled();
      expect(tabs.create).toHaveBeenCalledWith(
        jasmine.objectContaining({
          url: 'chrome-extension://ext-id/index.html#/ledger/onekey-connect',
        }),
        jasmine.any(Function)
      );
      getDevices.and.resolveTo([grantedOneKey]);
      jasmine.clock().tick(100);
      expect((await pending).serialNumber).toBe('granted-device');
      expect((service as any).selectedUsbPath).toBe('granted-device');
      expect(tabs.remove).not.toHaveBeenCalled();
      expect(tabs.onRemoved.removeListener).toHaveBeenCalledTimes(1);
      const calls = getDevices.calls.count();
      jasmine.clock().tick(1000);
      expect(getDevices.calls.count()).toBe(calls);
    });

    it('treats closing the tab without authorization as cancellation', async () => {
      const pending = service.requestDevice();
      await whenTrue(() => tabs.onRemoved.addListener.calls.any());
      tabs.onRemoved.addListener.calls.mostRecent().args[0](9);
      await expectAsync(pending).toBeRejectedWith(jasmine.objectContaining({ name: 'NotFoundError' }));
      expect(tabs.remove).not.toHaveBeenCalled();
      expect(tabs.onRemoved.removeListener).toHaveBeenCalledTimes(1);
    });

    it('accepts authorization when the tab closes before the next poll', async () => {
      const pending = service.requestDevice();
      await whenTrue(() => tabs.onRemoved.addListener.calls.any());
      getDevices.and.resolveTo([grantedOneKey]);
      tabs.onRemoved.addListener.calls.mostRecent().args[0](9);
      expect(await pending).toBe(grantedOneKey);
      expect(tabs.remove).not.toHaveBeenCalled();
    });
  });

  it('uses the selected device even when another authorized device is listed first', async () => {
    sdk.searchDevices.and.resolveTo({ success: true, payload: [
      { connectId: 'other-device', deviceId: 'other-id' }, device,
    ] });
    expect((await service.getDeviceStatus()).payload).toEqual([device]);
    expect((service as any).deviceInfo).toBe(device);
  });

  it('matches the selected USB path when the SDK uses a different connectId', async () => {
    const discovered = { ...device, path: 'selected-device', connectId: 'firmware-serial' };
    sdk.searchDevices.and.resolveTo({ success: true, payload: [
      { ...device, path: 'other-device' }, discovered,
    ] });
    expect((await service.getDeviceStatus()).payload).toEqual([discovered]);
    expect((service as any).deviceInfo.connectId).toBe('firmware-serial');
    sdk.getPassphraseState.and.resolveTo({ success: true, payload: 'state' });
    await service.getPassphraseState();
    expect(sdk.getPassphraseState).toHaveBeenCalledWith('firmware-serial');
    (service as any).hardwareSdk = sdk;
    service.cancel();
    expect(sdk.cancel).toHaveBeenCalledWith('firmware-serial');
  });

  it('does not switch to another device when the selected device disconnects', async () => {
    sdk.searchDevices.and.resolveTo({ success: true, payload: [{ connectId: 'other-device' }] });
    expect((await service.getDeviceStatus()).payload).toEqual([]);
    expect((service as any).deviceInfo).toBeUndefined();
  });

  it('retains Neo3 and NeoX derivation paths when requesting addresses', async () => {
    sdk.neoGetAddress.and.resolveTo({ success: true, payload: [] });
    sdk.evmGetAddress.and.resolveTo({ success: true, payload: [] });
    await service.fetchAccounts(2, 'Neo3');
    await service.fetchAccounts(2, 'NeoX');
    for (const [method, coin] of [[sdk.neoGetAddress, 888], [sdk.evmGetAddress, 60]]) {
      const [connectId, deviceId, params] = method.calls.mostRecent().args;
      expect(connectId).toBe(device.connectId);
      expect(deviceId).toBe(device.deviceId);
      expect(params.bundle.length).toBe(LEDGER_PAGE_SIZE);
      expect(params.bundle[0]).toEqual({ path: `m/44'/${coin}'/0'/0/${LEDGER_PAGE_SIZE}`, showOnOneKey: false });
    }
  });

  it('passes Neo3 network magic and returns the raw signature for sign-only requests', async () => {
    sdk.neoSignTransaction.and.resolveTo({ success: true, payload: { signature: 'signature' } });
    const result = await service.signTransaction({
      chainType: 'Neo3', unsignedTx: 'aabb', magicNumber: 894710606, signOnly: true,
      wallet: { accounts: [{ extra: { ledgerAddressIndex: 2 } }] } as any,
    });
    expect(result).toBe('signature');
    expect(sdk.neoSignTransaction).toHaveBeenCalledWith('selected-device', 'device-id', {
      path: "m/44'/888'/0'/0/2", rawTx: 'aabb', magicNumber: 894710606,
    });
  });

  it('retains NeoX chain ID and EIP-1559 fee fields', async () => {
    sdk.evmSignTransaction.and.resolveTo({ success: true, payload: { r: 'r', s: 's', v: 'v' } });
    const result = await service.signTransaction({
      chainType: 'NeoX', unsignedTx: { value: 1n, gasLimit: 21000n, nonce: 1,
        maxFeePerGas: 10n, maxPriorityFeePerGas: 2n },
      magicNumber: 0, signOnly: false,
      wallet: { accounts: [{ extra: { ledgerAddressIndex: 3 } }] } as any,
    });
    const params = sdk.evmSignTransaction.calls.mostRecent().args[2];
    expect(params.path).toBe("m/44'/60'/0'/0/3");
    expect(params.transaction).toEqual(jasmine.objectContaining({
      chainId: 47763, value: '0x1', gasLimit: '0x5208', nonce: '0x1',
      maxFeePerGas: '0xa', maxPriorityFeePerGas: '0x2',
    }));
    expect((result as any).signature).toEqual({ r: 'r', s: 's', v: 'v' });
  });
});
