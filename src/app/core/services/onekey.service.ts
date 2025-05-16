import { ChainType, LEDGER_PAGE_SIZE } from '@/app/popup/_lib';
import { Injectable } from '@angular/core';
import HardwareSDK from '@onekeyfe/hd-web-sdk';
import {
  UI_EVENT,
  UI_RESPONSE,
  CoreMessage,
  UI_REQUEST,
} from '@onekeyfe/hd-core';

interface OneKeyDeviceInfo {
  connectId: string; // device connection id
  uuid: string; // device unique id
  deviceType: string; // device id, this id may change with device erasure, only returned when using the @onekeyfe/hd-web-sdk library.
  deviceId: string; // device type, 'classic' | 'mini' | 'touch' | 'pro'
  name: string; // bluetooth name for the device
}

@Injectable()
export class OneKeyService {
  deviceInfo: OneKeyDeviceInfo;
  private accounts = { Neo3: {}, NeoX: {} };

  constructor() {
    HardwareSDK.HardwareWebSdk.init({
      debug: true,
      fetchConfig: false,
      connectSrc: 'https://jssdk.onekey.so/1.0.26/',
    });
    HardwareSDK.HardwareWebSdk.on(UI_EVENT, (message: CoreMessage) => {
      // Handle the PIN code input event
      if (message.type === UI_REQUEST.REQUEST_PIN) {
        // Enter the PIN code on the device
        HardwareSDK.HardwareWebSdk.uiResponse({
          type: UI_RESPONSE.RECEIVE_PIN,
          payload: '@@ONEKEY_INPUT_PIN_IN_DEVICE',
        });
      }

      // Handle the passphrase event
      if (message.type === UI_REQUEST.REQUEST_PASSPHRASE) {
        // Enter the passphrase on the device
        HardwareSDK.HardwareWebSdk.uiResponse({
          type: UI_RESPONSE.RECEIVE_PASSPHRASE,
          payload: {
            value: '',
            passphraseOnDevice: true,
            save: true,
          },
        });
      }

      if (message.type === UI_REQUEST.REQUEST_BUTTON) {
        // Confirmation is required on the device, a UI prompt can be displayed
      }
    });
  }

  async getDeviceStatus() {
    const deviceResponse = await HardwareSDK.HardwareWebSdk.searchDevices();
    if (deviceResponse.success) {
      this.deviceInfo = deviceResponse.payload[0];
    }
    return deviceResponse;
  }

  async getPassphraseState() {
    const state = await HardwareSDK.HardwareWebSdk.getPassphraseState(
      this.deviceInfo.connectId
    );
    return state;
  }

  async fetchAccounts(page: number, chainType: ChainType) {
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
      getAddressRes = await HardwareSDK.HardwareWebSdk.evmGetAddress(
        this.deviceInfo.connectId,
        this.deviceInfo.deviceId,
        { bundle: pathArr }
      );
    } else {
      getAddressRes = await HardwareSDK.HardwareWebSdk.neoGetAddress(
        this.deviceInfo.connectId,
        this.deviceInfo.deviceId,
        { bundle: pathArr }
      );
    }
    if (getAddressRes.success) {
      newAccounts = getAddressRes.payload;
      newAccounts.forEach((account) => {
        account.publicKey = account.pub;
        delete account.pub;
      });
    }
    this.accounts[chainType][page] = newAccounts;
    return newAccounts;
  }
}
