import {
  Account3,
  ChainType,
  EvmWalletJSON,
  LEDGER_PAGE_SIZE,
  RpcNetwork,
  Wallet3,
} from '@/app/popup/_lib';
import { Injectable } from '@angular/core';
import { ethers } from 'ethers';
import { Transaction as Transaction2 } from '@cityofzion/neon-core/lib/tx';
import { Transaction as Transaction3 } from '@cityofzion/neon-core-neo3/lib/tx';
import { tx as tx3 } from '@cityofzion/neon-core-neo3/lib';
import { wallet as wallet3 } from '@cityofzion/neon-core-neo3/lib';
import { GlobalService } from '../global.service';
import { AppState } from '@/app/reduers';
import { Store } from '@ngrx/store';
import { BigNumber } from 'bignumber.js';
import { MessageTypes, TypedMessage } from '@metamask/eth-sig-util';
import { environment } from '@/environments/environment';
import { transformTypedDataPlugin } from '../../utils/evm';
import * as Sentry from '@sentry/angular';
import {
  ONEKEY_WEBUSB_FILTER,
  resolveOneKeyUsbDevicePath,
} from '@onekeyfe/hd-shared';

type OneKeySdk = typeof import('@onekeyfe/hd-web-sdk').default.HardwareWebSdk;
// The SDK exposes the transport path at runtime but omits it from SearchDevice.
type OneKeyDeviceInfo = import('@onekeyfe/hd-core').SearchDevice & {
  path?: string;
};
type OneKeyUsbDevice = Parameters<typeof resolveOneKeyUsbDevicePath>[0];
interface OneKeyUsbApi {
  requestDevice(options: {
    filters: typeof ONEKEY_WEBUSB_FILTER;
  }): Promise<OneKeyUsbDevice>;
  getDevices(): Promise<OneKeyUsbDevice[]>;
}
interface OneKeyUsbNavigator extends Navigator {
  usb?: OneKeyUsbApi;
}

const ONEKEY_CONNECT_HASH = '#/ledger/onekey-connect';
const WEBUSB_CHOOSER_MIN_WIDTH = 500;
const USB_HELPER_POLL_MS = 100;

@Injectable()
export class OneKeyService {
  private deviceInfo: OneKeyDeviceInfo;
  private accounts = { Neo3: {}, NeoX: {} };
  private hardwareSdkPromise: Promise<OneKeySdk>;
  private selectedUsbPath: string;
  private hardwareSdk: OneKeySdk;

  private neoXNetwork: RpcNetwork;

  constructor(private store: Store<AppState>, private global: GlobalService) {
    const account$ = this.store.select('account');
    account$.subscribe((state) => {
      this.neoXNetwork = state.neoXNetworks[state.neoXNetworkIndex];
    });
  }

  get supportsWebUsb(): boolean {
    return !!(navigator as OneKeyUsbNavigator).usb;
  }

  // Popup/notification windows cannot display Chrome's USB chooser, so reuse a
  // previously authorized device and only open the picker in a real tab.
  async requestDevice(): Promise<OneKeyUsbDevice | undefined> {
    const usb = (navigator as OneKeyUsbNavigator).usb;
    if (!usb) {
      throw new Error('WebUSB is not supported');
    }
    let device = await this.findAuthorizedDevice(usb);
    if (!device) {
      device = this.canShowWebUsbChooser()
        ? await usb.requestDevice({ filters: ONEKEY_WEBUSB_FILTER })
        : await this.authorizeDeviceInTab(usb);
    }
    return this.selectUsbDevice(device);
  }

  cancel() {
    if (this.deviceInfo?.connectId) {
      this.hardwareSdk?.cancel(this.deviceInfo.connectId);
    }
  }

  private canShowWebUsbChooser(): boolean {
    if ((window.location.hash || '').startsWith(ONEKEY_CONNECT_HASH)) {
      return true;
    }
    const chromeApi = (window as any).chrome;
    if (!chromeApi?.runtime?.id) {
      return true;
    }
    // innerWidth ignores docked DevTools, which inflate outerWidth.
    // The action popup and notification windows are ~375px and cannot
    // display Chrome's USB device chooser.
    return !window.innerWidth || window.innerWidth >= WEBUSB_CHOOSER_MIN_WIDTH;
  }

  private isAuthorizedOneKey(device: OneKeyUsbDevice): boolean {
    return ONEKEY_WEBUSB_FILTER.some(
      (filter) =>
        device?.vendorId === filter.vendorId &&
        device?.productId === filter.productId
    );
  }

  private selectUsbDevice(device: OneKeyUsbDevice): OneKeyUsbDevice {
    this.selectedUsbPath = resolveOneKeyUsbDevicePath(device);
    this.deviceInfo = undefined;
    this.accounts = { Neo3: {}, NeoX: {} };
    return device;
  }

  private findAuthorizedDevice(
    usb: OneKeyUsbApi
  ): Promise<OneKeyUsbDevice | undefined> {
    return usb.getDevices().then(
      (devices) => devices?.find((device) => this.isAuthorizedOneKey(device)),
      () => undefined
    );
  }

  private authorizeDeviceInTab(usb: OneKeyUsbApi): Promise<OneKeyUsbDevice> {
    const chromeApi = (window as any).chrome;
    if (!chromeApi?.tabs?.create) {
      return Promise.reject(new Error('Unable to open OneKey connect tab'));
    }
    const url = chromeApi.runtime.getURL('/index.html') + ONEKEY_CONNECT_HASH;
    return new Promise((resolve, reject) => {
      chromeApi.tabs.create({ url, active: true }, (tab) => {
        const lastError = chromeApi.runtime?.lastError;
        if (lastError || !tab?.id) {
          reject(
            new Error(lastError?.message || 'Unable to open OneKey connect tab')
          );
          return;
        }
        let settled = false;
        let closed = false;
        const checkDevice = async () => {
          const checkedAfterClose = closed;
          const device = await this.findAuthorizedDevice(usb);
          if (settled || (!device && !checkedAfterClose)) return;
          settled = true;
          window.clearInterval(poll);
          chromeApi.tabs.onRemoved.removeListener(onTabRemoved);
          if (device) {
            resolve(device);
          } else {
            reject(new DOMException('No OneKey selected', 'NotFoundError'));
          }
        };
        const onTabRemoved = (id: number) => {
          if (id !== tab.id) return;
          closed = true;
          void checkDevice();
        };
        const poll = window.setInterval(checkDevice, USB_HELPER_POLL_MS);
        chromeApi.tabs.onRemoved.addListener(onTabRemoved);
        void checkDevice();
      });
    });
  }

  async getDeviceStatus() {
    const HardwareSDK = await this.getHardwareSdk();
    const deviceResponse = await HardwareSDK.searchDevices();
    if (deviceResponse.success) {
      deviceResponse.payload = deviceResponse.payload.filter(
        (device: OneKeyDeviceInfo) =>
          // connectId can be the firmware serial, not the USB descriptor serial.
          !!this.selectedUsbPath &&
          (device.path || device.connectId) === this.selectedUsbPath
      );
      this.deviceInfo = deviceResponse.payload[0];
    }
    return deviceResponse;
  }

  async getPassphraseState() {
    const HardwareSDK = await this.getHardwareSdk();
    const state = await HardwareSDK.getPassphraseState(
      this.deviceInfo.connectId
    );
    return state;
  }

  async fetchAccounts(page: number, chainType: ChainType) {
    const HardwareSDK = await this.getHardwareSdk();
    if (this.accounts[chainType][page]) {
      return this.accounts[chainType][page];
    }
    const startingIndex = (page - 1) * LEDGER_PAGE_SIZE;
    const maxIndex = page * LEDGER_PAGE_SIZE;
    let newAccounts = [];

    let pathArr = [];
    for (let index = startingIndex; index < maxIndex; index++) {
      if (chainType === 'NeoX') {
        pathArr.push({ path: `m/44'/60'/0'/0/${index}`, showOnOneKey: false });
      } else {
        pathArr.push({ path: `m/44'/888'/0'/0/${index}`, showOnOneKey: false });
      }
    }
    let getAddressRes;
    if (chainType === 'NeoX') {
      getAddressRes = await HardwareSDK.evmGetAddress(
        this.deviceInfo.connectId,
        this.deviceInfo.deviceId,
        { bundle: pathArr }
      );
    } else {
      getAddressRes = await HardwareSDK.neoGetAddress(
        this.deviceInfo.connectId,
        this.deviceInfo.deviceId,
        { bundle: pathArr }
      );
    }
    if (getAddressRes.success === false) {
      throw new Error(getAddressRes.payload.error);
    }
    if (getAddressRes.success) {
      for (const account of getAddressRes.payload) {
        if (chainType === 'NeoX') {
          account.publicKey = account.pub;
          delete account.pub;
          newAccounts.push(account);
        } else {
          newAccounts.push(new Account3(account.pub));
        }
      }
    }
    this.accounts[chainType][page] = newAccounts;
    return newAccounts;
  }

  private getHexValue(value: string | number | bigint) {
    if (typeof value === 'bigint') {
      return '0x' + value.toString(16);
    }
    return value ? '0x' + new BigNumber(value).toString(16) : undefined;
  }

  async signTransaction({
    chainType,
    unsignedTx,
    wallet,
    magicNumber,
    signOnly = false,
  }: {
    chainType: ChainType;
    unsignedTx:
      | Transaction2
      | Transaction3
      | string
      | ethers.TransactionRequest;
    wallet: Wallet3 | EvmWalletJSON;
    magicNumber: number;
    signOnly: boolean;
  }) {
    const HardwareSDK = await this.getHardwareSdk();
    if (chainType === 'NeoX') {
      (unsignedTx as ethers.Transaction).chainId = this.neoXNetwork.chainId;
      const res = await HardwareSDK.evmSignTransaction(
        this.deviceInfo.connectId,
        this.deviceInfo.deviceId,
        {
          path: `m/44'/60'/0'/0/${wallet.accounts[0].extra.ledgerAddressIndex}`,
          transaction: {
            ...(unsignedTx as ethers.Transaction),
            value: this.getHexValue(
              (unsignedTx as ethers.Transaction).value || 0
            ),
            to: (unsignedTx as ethers.Transaction).to,
            gasLimit: this.getHexValue(
              (unsignedTx as ethers.Transaction).gasLimit || 0
            ),
            nonce: this.getHexValue(
              (unsignedTx as ethers.Transaction).nonce || 0
            ),
            chainId: this.neoXNetwork.chainId,
            maxFeePerGas: this.getHexValue(
              (unsignedTx as ethers.Transaction).maxFeePerGas || 0
            ),
            maxPriorityFeePerGas: this.getHexValue(
              (unsignedTx as ethers.Transaction).maxPriorityFeePerGas || 0
            ),
          },
        }
      );
      if (res.success) {
        return {
          ...(unsignedTx as ethers.Transaction),
          signature: res.payload,
        };
      }
      if (res.success === false) {
        throw new Error(res.payload.error);
      }
    } else {
      const txIsString = typeof unsignedTx === 'string';
      const rawTx = txIsString
        ? unsignedTx
        : (unsignedTx as any).serialize(false);
      const res = await HardwareSDK.neoSignTransaction(
        this.deviceInfo.connectId,
        this.deviceInfo.deviceId,
        {
          path: `m/44'/888'/0'/0/${wallet.accounts[0].extra.ledgerAddressIndex}`,
          rawTx,
          magicNumber,
        }
      );
      if (res.success) {
        const signature = res.payload.signature;
        if (signOnly) {
          return signature;
        }
        const invocationScript = `0c40${signature}`;
        const verificationScript = wallet3.getVerificationScriptFromPublicKey(
          wallet.accounts[0].extra.publicKey
        );
        (unsignedTx as Transaction3).addWitness(
          new tx3.Witness({
            invocationScript,
            verificationScript,
          })
        );
        return unsignedTx;
      }
      if (res.success === false) {
        throw new Error(res.payload.error);
      }
    }
  }

  async signEvmPersonalMessage(message: string, wallet: EvmWalletJSON) {
    const HardwareSDK = await this.getHardwareSdk();
    const res = await HardwareSDK.evmSignMessage(
      this.deviceInfo.connectId,
      this.deviceInfo.deviceId,
      {
        path: `m/44'/60'/0'/0/${wallet.accounts[0].extra.ledgerAddressIndex}`,
        messageHex: Buffer.from(message).toString('hex'),
      }
    );
    if (res.success) {
      return res.payload;
    }
    if (res.success === false) {
      throw new Error(res.payload.error);
    }
  }
  async signEvmTypedData(
    typedData: TypedMessage<MessageTypes>,
    wallet: EvmWalletJSON
  ) {
    const HardwareSDK = await this.getHardwareSdk();
    const { domainHash, messageHash } = transformTypedDataPlugin(typedData);
    const res = await HardwareSDK.evmSignTypedData(
      this.deviceInfo.connectId,
      this.deviceInfo.deviceId,
      {
        path: `m/44'/60'/0'/0/${wallet.accounts[0].extra.ledgerAddressIndex}`,
        data: typedData,
        metamaskV4Compat: true,
        domainHash,
        messageHash,
      }
    );
    if (res.success) {
      return res.payload;
    }
    if (res.success === false) {
      throw new Error(res.payload.error);
    }
  }

  handleOneKeyError(error: string) {
    let snackError = 'TransactionDeniedByUser';
    Sentry.captureMessage(`handleOneKeyError: ${error ?? snackError}`);
    this.global.snackBarTip(error ?? snackError);
  }

  private getHardwareSdk(): Promise<OneKeySdk> {
    if (!this.hardwareSdkPromise) {
      this.hardwareSdkPromise = Promise.all([
        import('@onekeyfe/hd-web-sdk'),
        import('@onekeyfe/hd-core'),
      ]).then(async ([sdkModule, events]) => {
        const HardwareSDK = sdkModule.default.HardwareWebSdk;
        HardwareSDK.on(events.UI_EVENT, (message) => {
          if (message.type === events.UI_REQUEST.REQUEST_PIN) {
            HardwareSDK.uiResponse({
              type: events.UI_RESPONSE.RECEIVE_PIN,
              payload: '@@ONEKEY_INPUT_PIN_IN_DEVICE',
            });
          }
          if (message.type === events.UI_REQUEST.REQUEST_PASSPHRASE) {
            HardwareSDK.uiResponse({
              type: events.UI_RESPONSE.RECEIVE_PASSPHRASE,
              payload: {
                value: '',
                passphraseOnDevice: true,
                save: true,
              },
            });
          }
        });
        const initialized = await HardwareSDK.init({
          env: 'webusb',
          // SDK 1.2.1 is published, but its versioned iframe host returns 404.
          connectSrc: 'https://jssdk.onekey.so/1.2.0/',
          debug: !environment.production,
          fetchConfig: true,
        });
        if (!initialized) {
          await HardwareSDK.dispose();
          throw new Error('OneKey SDK initialization failed');
        }
        this.hardwareSdk = HardwareSDK;
        return HardwareSDK;
      }).catch((error) => {
        this.hardwareSdkPromise = undefined;
        throw error;
      });
    }
    return this.hardwareSdkPromise;
  }
}
