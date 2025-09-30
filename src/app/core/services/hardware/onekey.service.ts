import {
  Account3,
  ChainType,
  EvmWalletJSON,
  LEDGER_PAGE_SIZE,
  RpcNetwork,
  Wallet3,
} from '@/app/popup/_lib';
import { Injectable } from '@angular/core';
import HardwareSDK from '@onekeyfe/hd-web-sdk';
import {
  UI_EVENT,
  UI_RESPONSE,
  CoreMessage,
  UI_REQUEST,
} from '@onekeyfe/hd-core';
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

interface OneKeyDeviceInfo {
  connectId: string; // device connection id
  uuid: string; // device unique id
  deviceType: string; // device id, this id may change with device erasure, only returned when using the @onekeyfe/hd-web-sdk library.
  deviceId: string; // device type, 'classic' | 'mini' | 'touch' | 'pro'
  name: string; // bluetooth name for the device
}

@Injectable()
export class OneKeyService {
  private deviceInfo: OneKeyDeviceInfo;
  private accounts = { Neo3: {}, NeoX: {} };

  private neoXNetwork: RpcNetwork;

  constructor(private store: Store<AppState>, private global: GlobalService) {
    const account$ = this.store.select('account');
    account$.subscribe((state) => {
      this.neoXNetwork = state.neoXNetworks[state.neoXNetworkIndex];
    });
    HardwareSDK.HardwareWebSdk.init({
      debug: !environment.production,
      fetchConfig: false,
      connectSrc: 'https://jssdk.onekey.so/1.0.31/',
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
    if (chainType === 'NeoX') {
      (unsignedTx as ethers.Transaction).chainId = this.neoXNetwork.chainId;
      const res = await HardwareSDK.HardwareWebSdk.evmSignTransaction(
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
      const res = await HardwareSDK.HardwareWebSdk.neoSignTransaction(
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
    const res = await HardwareSDK.HardwareWebSdk.evmSignMessage(
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
    const { domainHash, messageHash } = transformTypedDataPlugin(typedData);
    const res = await HardwareSDK.HardwareWebSdk.evmSignTypedData(
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
    this.global.snackBarTip(error ?? snackError);
  }
}
