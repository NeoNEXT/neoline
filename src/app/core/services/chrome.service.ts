import { Injectable } from '@angular/core';
import { Observable, of, throwError, from } from 'rxjs';
import { Asset, NftAsset } from '@/models/models';
import { EVENT } from '@/models/dapi';
import {
  STORAGE_NAME,
  STORAGE_VALUE_TYPE,
  STORAGE_VALUE_MESSAGE,
  RpcNetwork,
  DEFAULT_NETWORKS,
  EvmWalletJSON,
  ChainType,
  ConnectedWebsitesType,
} from '@/app/popup/_lib';
import { ExtensionService } from './extension.service';
import {
  encryptSessionSecret,
  decryptSessionSecret,
} from '../../../../cross-runtime/session-secret';
import { ethers } from 'ethers';
import { firstValueFrom } from 'rxjs';
import { NEOX_EVENT } from '@/models/evm';
import { Wallet3 } from '@popup/_lib';
import { getScriptHashFromAddress } from '@cityofzion/neon-core-neo3/lib/wallet';
import { wallet as wallet3 } from '@cityofzion/neon-core-neo3';

@Injectable()
export class ChromeService {
  constructor(private crx: ExtensionService) {}

  /**
   * check is in chrome extension env
   * 检查是否处在crx环境中
   */
  public get check(): boolean {
    return this.crx.isCrx();
  }

  public getVersion(): string {
    if (this.check) {
      return this.crx.getVersion();
    } else {
      return '';
    }
  }

  //#region watch, NFT watch
  public getWatch(networkName: string, address: string): Observable<Asset[]> {
    if (!this.check) {
      try {
        let rs =
          (JSON.parse(localStorage.getItem(STORAGE_NAME.watch)) || {})?.[
            networkName
          ]?.[address] || [];
        if (!Array.isArray(rs)) {
          rs = [];
        }
        rs.forEach((item) => delete item.balance);
        return of(rs);
      } catch (e) {
        return throwError(
          'please set watch to local storage when debug mode on',
        );
      }
    } else {
      return from(
        new Promise<Asset[]>((resolve, reject) => {
          try {
            this.crx.getLocalStorage(STORAGE_NAME.watch, (res) => {
              res = (res || {})?.[networkName]?.[address] || [];
              if (!Array.isArray(res)) {
                res = [];
              }
              res.forEach((item) => delete item.balance);
              resolve(res);
            });
          } catch (e) {
            reject('failed');
          }
        }),
      );
    }
  }
  private getAllWatch(): Observable<object> {
    if (!this.check) {
      try {
        const rs = JSON.parse(localStorage.getItem(STORAGE_NAME.watch)) || {};
        return of(rs);
      } catch (e) {
        return throwError(
          'please set watch to local storage when debug mode on',
        );
      }
    } else {
      return from(
        new Promise<Asset[]>((resolve, reject) => {
          try {
            this.crx.getLocalStorage(STORAGE_NAME.watch, (res) => {
              res = res || {};
              resolve(res);
            });
          } catch (e) {
            reject('failed');
          }
        }),
      );
    }
  }
  public setWatch(networkName: string, address?: string, watch?: Asset[]) {
    if (watch) {
      watch.forEach((item) => delete item.balance);
    }
    this.getAllWatch().subscribe((watchObject) => {
      const saveWatch = watchObject || {};
      if (!saveWatch?.[networkName]) {
        saveWatch[networkName] = {};
      }
      if (address) {
        saveWatch[networkName][address] = watch;
      } else {
        saveWatch[networkName] = {}; // reset this networkId data
      }
      if (!this.check) {
        localStorage.setItem(STORAGE_NAME.watch, JSON.stringify(saveWatch));
        return;
      }
      try {
        const saveData = {};
        saveData[STORAGE_NAME.watch] = saveWatch;
        this.crx.setLocalStorage(saveData);
      } catch (e) {
        console.log('set watch failed', e);
      }
    });
  }
  public getNftWatch(
    networkName: string,
    address: string,
  ): Observable<NftAsset[]> {
    if (!this.check) {
      try {
        let rs =
          (JSON.parse(localStorage.getItem(STORAGE_NAME.nftWatch)) || {})?.[
            networkName
          ]?.[address] || [];
        if (!Array.isArray(rs)) {
          rs = [];
        }
        return of(rs);
      } catch (e) {
        return throwError(
          'please set watch to local storage when debug mode on',
        );
      }
    } else {
      return from(
        new Promise<NftAsset[]>((resolve, reject) => {
          try {
            this.crx.getLocalStorage(STORAGE_NAME.nftWatch, (res) => {
              res = (res || {})?.[networkName]?.[address] || [];
              if (!Array.isArray(res)) {
                res = [];
              }
              resolve(res);
            });
          } catch (e) {
            reject('failed');
          }
        }),
      );
    }
  }
  private getAllNftWatch(): Observable<object> {
    if (!this.check) {
      try {
        const rs =
          JSON.parse(localStorage.getItem(STORAGE_NAME.nftWatch)) || {};
        return of(rs);
      } catch (e) {
        return throwError(
          'please set watch to local storage when debug mode on',
        );
      }
    } else {
      return from(
        new Promise<NftAsset[]>((resolve, reject) => {
          try {
            this.crx.getLocalStorage(STORAGE_NAME.nftWatch, (res) => {
              res = res || {};
              resolve(res);
            });
          } catch (e) {
            reject('failed');
          }
        }),
      );
    }
  }
  public setNftWatch(
    networkName: string,
    address?: string,
    watch?: NftAsset[],
  ) {
    this.getAllNftWatch().subscribe((watchObject) => {
      const saveWatch = watchObject || {};
      if (!saveWatch?.[networkName]) {
        saveWatch[networkName] = {};
      }
      if (address) {
        saveWatch[networkName][address] = watch;
      } else {
        saveWatch[networkName] = {}; // reset this networkId data
      }
      if (!this.check) {
        localStorage.setItem(STORAGE_NAME.nftWatch, JSON.stringify(saveWatch));
        return;
      }
      try {
        const saveData = {};
        saveData[STORAGE_NAME.nftWatch] = saveWatch;
        this.crx.setLocalStorage(saveData);
      } catch (e) {
        console.log('set watch failed', e);
      }
    });
  }
  resetWatch(networkName: string) {
    this.setWatch(networkName);
    this.setNftWatch(networkName);
  }
  //#endregion

  //#region reset method
  public clearStorage() {
    if (!this.check) {
      localStorage.clear();
      sessionStorage.clear();
    } else {
      try {
        this.crx.clearStorage();
        this.crx.clearLocalStorage();
        this.crx.clearSessionStorage();
      } catch (e) {
        console.log('close wallet failed', e);
      }
    }
  }

  public resetWallet() {
    this.setPassword('');
    this.setStorage(STORAGE_NAME.wallet, undefined);
    this.setStorage(STORAGE_NAME.WIFArr, []);
    this.setStorage(STORAGE_NAME['WIFArr-Neo3'], []);
    this.setStorage(STORAGE_NAME.walletArr, []);
    this.setStorage(STORAGE_NAME['walletArr-Neo3'], []);
    this.setStorage(STORAGE_NAME['walletArr-NeoX'], []);
    this.accountChangeEvent(undefined);
  }
  //#endregion

  //#region should login
  // Serialises async password writes so getPassword() never reads a value
  // before the encrypt-and-store kicked off by setPassword() has landed.
  private pendingPasswordWrite: Promise<void> = Promise.resolve();

  public async getPassword(): Promise<string> {
    await this.pendingPasswordWrite.catch(() => {});
    let storagePwd;
    if (!this.check) {
      storagePwd = sessionStorage.getItem('password');
    } else {
      storagePwd = await this.crx.getSessionStorage('password', (res) => res);
    }
    if (storagePwd) {
      return decryptSessionSecret(storagePwd);
    }
    return storagePwd;
  }

  // Encryption and extension storage are both asynchronous. Return the queued
  // write so callers that close their window can wait until it is durable.
  public setPassword(pwd: string): Promise<void> {
    const write = this.pendingPasswordWrite
      .catch(() => {})
      .then(() => this.writePassword(pwd));
    this.pendingPasswordWrite = write;
    // Some existing callers intentionally fire-and-forget. Mark the rejection
    // handled for those callers while still returning the rejecting promise to
    // callers that await it.
    write.catch(() => {});
    return write;
  }

  private async writePassword(pwd: string): Promise<void> {
    const storagePwd = pwd ? await encryptSessionSecret(pwd) : pwd;
    if (!this.check) {
      sessionStorage.setItem('password', storagePwd);
    } else {
      await this.crx.setSessionStorage({ password: storagePwd });
    }
    if (!pwd) {
      if (!this.check) {
        sessionStorage.removeItem('hasLoginAddress');
      } else {
        await this.crx.setSessionStorage({
          [STORAGE_NAME.hasLoginAddress]: {},
        });
      }
    }
  }

  public async getShouldFindNode(): Promise<boolean> {
    if (!this.check) {
      return Promise.resolve(
        sessionStorage.getItem('shouldFindNode') === 'false' ? false : true,
      );
    } else {
      return (await this.crx.getSessionStorage(
        STORAGE_NAME.shouldFindNode,
        (res) => res,
      )) === false
        ? false
        : true;
    }
  }

  public setShouldFindNode(status: boolean) {
    if (!this.check) {
      sessionStorage.setItem('shouldFindNode', status.toString());
    } else {
      this.crx.setSessionStorage({ [STORAGE_NAME.shouldFindNode]: status });
    }
  }

  public async getHasLoginAddress(): Promise<any> {
    if (!this.check) {
      return Promise.resolve(
        JSON.parse(sessionStorage.getItem('hasLoginAddress') || '{}'),
      );
    } else {
      return (
        (await this.crx.getSessionStorage(
          STORAGE_NAME.hasLoginAddress,
          (res) => res,
        )) || {}
      );
    }
  }

  public setHasLoginAddress(address) {
    this.getHasLoginAddress().then((hasLoginAddress) => {
      hasLoginAddress[address] = true;
      if (!this.check) {
        sessionStorage.setItem(
          'hasLoginAddress',
          JSON.stringify(hasLoginAddress),
        );
      } else {
        this.crx.setSessionStorage({
          [STORAGE_NAME.hasLoginAddress]: hasLoginAddress,
        });
      }
    });
  }
  //#endregion

  //#region backup
  public async getIsBackupLater(): Promise<boolean> {
    if (!this.check) {
      return Promise.resolve(
        sessionStorage.getItem(STORAGE_NAME.isBackupLater) === 'true'
          ? true
          : false,
      );
    } else {
      return (await this.crx.getSessionStorage(
        STORAGE_NAME.isBackupLater,
        (res) => res,
      )) === true
        ? true
        : false;
    }
  }

  public setIsBackupLater(status: boolean) {
    if (!this.check) {
      sessionStorage.setItem(STORAGE_NAME.isBackupLater, status.toString());
    } else {
      this.crx.setSessionStorage({ [STORAGE_NAME.isBackupLater]: status });
    }
  }
  //#endregion

  //#region crx method
  public getLocalStorage(key): Promise<any> {
    if (this.check) {
      return this.crx.getLocalStorage(key, (res) => {
        return res;
      });
    }
  }

  public setLocalStorage(data) {
    if (this.check) {
      this.crx.setLocalStorage(data);
    }
  }

  public windowCallback(data: any, isCloseWindow = false) {
    if (this.check) {
      this.crx.windowCallback(data, isCloseWindow);
    }
  }

  public notification(title = '', msg = '') {
    if (this.check) {
      this.crx.notification(title, msg);
    }
  }
  //#endregion

  //#region storage
  public setStorage(storageName: STORAGE_NAME, value: any) {
    let storageValue = value;
    if (!this.check) {
      switch (STORAGE_VALUE_MESSAGE[storageName].type) {
        case STORAGE_VALUE_TYPE.object:
        case STORAGE_VALUE_TYPE.array:
          storageValue = JSON.stringify(value);
          break;
        case STORAGE_VALUE_TYPE.map:
          storageValue = JSON.stringify(Array.from(value.entries()));
          break;
        case STORAGE_VALUE_TYPE.number:
        case STORAGE_VALUE_TYPE.boolean:
          storageValue = String(value);
          break;
      }
    } else {
      if (STORAGE_VALUE_MESSAGE[storageName].type === STORAGE_VALUE_TYPE.map) {
        storageValue = JSON.stringify(Array.from(value.entries()));
      }
    }
    if (!this.check) {
      localStorage.setItem(storageName, storageValue);
      return;
    }
    try {
      const saveData = {};
      saveData[storageName] = storageValue;
      if (STORAGE_VALUE_MESSAGE[storageName].isLocal) {
        this.crx.setLocalStorage(saveData);
      } else {
        this.crx.setStorage(saveData);
      }
    } catch (e) {
      console.log(`set ${storageName} failed`, e);
    }
  }

  private handleStorageValue(storageName: STORAGE_NAME, value: any) {
    let targetValue: any = value;
    if (!this.check) {
      switch (STORAGE_VALUE_MESSAGE[storageName].type) {
        case STORAGE_VALUE_TYPE.object:
          targetValue = value ? JSON.parse(value) : {};
          break;
        case STORAGE_VALUE_TYPE.array:
          targetValue = value ? JSON.parse(value) : [];
          break;
        case STORAGE_VALUE_TYPE.map:
          targetValue = value ? new Map(JSON.parse(value)) : new Map();
          break;
        case STORAGE_VALUE_TYPE.number:
          targetValue = value ? Number(value) : 0;
          break;
        case STORAGE_VALUE_TYPE.boolean:
          if (value !== null) {
            targetValue = value === 'true' ? true : false;
          }
          break;
      }
    } else {
      if (STORAGE_VALUE_MESSAGE[storageName].type === STORAGE_VALUE_TYPE.map) {
        targetValue = value ? new Map(JSON.parse(value)) : new Map();
      }
      if (
        STORAGE_VALUE_MESSAGE[storageName].type === STORAGE_VALUE_TYPE.number
      ) {
        targetValue = value ? Number(value) : 0;
      }
      if (
        (storageName === STORAGE_NAME.transaction ||
          storageName === STORAGE_NAME.connectedWebsites ||
          storageName === STORAGE_NAME.hasLoginAddress ||
          storageName === STORAGE_NAME.authAddress) &&
        !value
      ) {
        targetValue = {};
      }
    }
    if (
      !value &&
      STORAGE_VALUE_MESSAGE[storageName].hasOwnProperty('default')
    ) {
      targetValue = (STORAGE_VALUE_MESSAGE[storageName] as any).default;
    }
    return targetValue;
  }

  public getStorage(storageName: STORAGE_NAME): Observable<any> {
    if (!this.check) {
      return of(
        this.handleStorageValue(storageName, localStorage.getItem(storageName)),
      );
    }
    return from(
      new Promise<any>((resolve, reject) => {
        try {
          STORAGE_VALUE_MESSAGE[storageName].isLocal
            ? this.crx.getLocalStorage(storageName, (res) => {
                resolve(this.handleStorageValue(storageName, res));
              })
            : this.crx.getStorage(storageName, (res) => {
                resolve(this.handleStorageValue(storageName, res));
              });
        } catch (e) {
          reject('failed');
        }
      }),
    );
  }

  public getStorages(
    storageNames: STORAGE_NAME[]
  ): Observable<Partial<Record<STORAGE_NAME, any>>> {
    if (!this.check) {
      const result = {} as Partial<Record<STORAGE_NAME, any>>;
      storageNames.forEach((storageName) => {
        result[storageName] = this.handleStorageValue(
          storageName,
          localStorage.getItem(storageName)
        );
      });
      return of(result);
    }

    const localNames = storageNames.filter(
      (storageName) => STORAGE_VALUE_MESSAGE[storageName].isLocal
    );
    const syncNames = storageNames.filter(
      (storageName) => !STORAGE_VALUE_MESSAGE[storageName].isLocal
    );
    const localRequest = localNames.length
      ? this.crx.getLocalStorage(localNames, (res) => res)
      : Promise.resolve({});
    const syncRequest = syncNames.length
      ? this.crx.getStorage(syncNames, (res) => res)
      : Promise.resolve({});

    return from(
      Promise.all([localRequest, syncRequest]).then(
        ([localValues = {}, syncValues = {}]) => {
          const values = { ...localValues, ...syncValues };
          const result = {} as Partial<Record<STORAGE_NAME, any>>;
          storageNames.forEach((storageName) => {
            result[storageName] = this.handleStorageValue(
              storageName,
              values[storageName]
            );
          });
          return result;
        }
      )
    );
  }
  public removeStorage(storageName: STORAGE_NAME) {
    if (!this.check) {
      localStorage.removeItem(storageName);
      return;
    }
    try {
      STORAGE_VALUE_MESSAGE[storageName].isLocal
        ? this.crx.removeLocalStorage(storageName)
        : this.crx.removeStorage(storageName);
    } catch (e) {
      console.log(`remove ${storageName} failed`);
    }
  }
  //#endregion

  //#region wallet
  public accountChangeEvent(w: any) {
    if (!this.check) return;
    if (ethers.isAddress(w?.accounts[0]?.address)) {
      this.getEvmConnectedAccounts(w).then((data) => {
        if (data) {
          this.windowCallback({
            data,
            return: NEOX_EVENT.EVM_ACCOUNT_CHANGED,
          });
        }
      });
    } else if (wallet3.isAddress(w?.accounts[0]?.address, 53)) {
      this.getN3ConnectedAccounts(w).then((data) => {
        if (data) {
          this.windowCallback({
            data,
            return: EVENT.ACCOUNT_CHANGED,
          });
        }
      });
    } else {
      this.windowCallback({
        data: {
          address: w?.accounts[0]?.address,
          label: w?.name,
        },
        return: EVENT.ACCOUNT_CHANGED,
      });
    }
  }
  evmAccountChange(data: string[]) {
    this.windowCallback({
      data,
      return: NEOX_EVENT.EVM_ACCOUNT_CHANGED,
    });
  }

  neo3AccountChange(wallets: Wallet3[], currentAddress?: string) {
    if (!this.check) return;

    const data = wallets.map((w) => {
      const address = w.accounts[0].address;
      return {
        hash: '0x' + getScriptHashFromAddress(address),
        address,
        label: w.name,
        extra: {
          isLedger: !!w.accounts[0].extra?.ledgerSLIP44,
        },
      };
    });
    const index = data.findIndex((item) => item.address === currentAddress);
    if (index >= 0) {
      const [currentAccount] = data.splice(index, 1);
      data.unshift(currentAccount);
    }

    this.windowCallback({
      data,
      return: EVENT.ACCOUNT_CHANGED,
    });
  }

  removeConnectWebsiteOfAddress(
    deleteAddress: string,
    deleteChainType: ChainType,
    currentAddress?: string,
  ) {
    let isDeleteNeoXConnectedAddress = false;
    let currentIsNeoXConnectedAddress = false;
    if (!this.crx.isCrx()) return;
    this.getStorage(STORAGE_NAME.connectedWebsites).subscribe(
      (allWebsites: ConnectedWebsitesType) => {
        this.crx.getCurrentWindow().then((tab) => {
          if (!tab) return;
          const hostname = new URL(tab.url).hostname;
          if (
            deleteChainType === 'NeoX' &&
            allWebsites[hostname]?.connectedAddress[deleteAddress]
          ) {
            isDeleteNeoXConnectedAddress = true;
          }
          if (
            currentAddress &&
            ethers.isAddress(currentAddress) &&
            allWebsites[hostname]?.connectedAddress[currentAddress]
          ) {
            currentIsNeoXConnectedAddress = true;
          }
          // remove connect info of deleted address
          Object.keys(allWebsites).forEach((hostname) => {
            if (allWebsites[hostname]?.connectedAddress[deleteAddress]) {
              delete allWebsites[hostname].connectedAddress[deleteAddress];
            }
          });
          this.setStorage(STORAGE_NAME.connectedWebsites, allWebsites);

          // update evm connected accounts
          if (isDeleteNeoXConnectedAddress || currentIsNeoXConnectedAddress) {
            const connectedAddress = [];
            Object.keys(allWebsites[hostname]?.connectedAddress || {}).forEach(
              (address) => {
                const item = allWebsites[hostname].connectedAddress[address];
                if (item.chain === 'NeoX') {
                  connectedAddress.push(address);
                }
              },
            );
            if (currentIsNeoXConnectedAddress) {
              const index = connectedAddress.indexOf(currentAddress);
              connectedAddress.splice(index, 1);
              connectedAddress.unshift(currentAddress);
            }
            this.evmAccountChange(connectedAddress);
          }
        });
      },
    );
  }

  private async getEvmConnectedAccounts(w: EvmWalletJSON) {
    const currentAddress = w.accounts[0].address;

    const tab = await this.crx.getCurrentWindow();
    if (!tab) return;
    const hostname = new URL(tab.url).hostname;
    const allWebsites: ConnectedWebsitesType = await firstValueFrom(
      this.getStorage(STORAGE_NAME.connectedWebsites),
    );
    const connectedAddressBucket =
      allWebsites?.[hostname]?.connectedAddress || {};

    if (connectedAddressBucket[currentAddress]) {
      const connectedAddress = [];
      Object.keys(connectedAddressBucket).forEach((address) => {
        const item = connectedAddressBucket[address];
        if (item.chain === 'NeoX') {
          connectedAddress.push(address);
        }
      });
      const index = connectedAddress.indexOf(currentAddress);
      connectedAddress.splice(index, 1);
      connectedAddress.unshift(currentAddress);
      return connectedAddress;
    }
    return;
  }

  private async getN3ConnectedAccounts(w: Wallet3) {
    const currentAddress = w.accounts[0].address;

    const tab = await this.crx.getCurrentWindow();
    if (!tab) return;
    const hostname = new URL(tab.url).hostname;
    const allWebsites: ConnectedWebsitesType = await firstValueFrom(
      this.getStorage(STORAGE_NAME.connectedWebsites),
    );

    const neo3WalletArr = await firstValueFrom(
      this.getStorage(STORAGE_NAME['walletArr-Neo3']),
    );
    const connectedAddressBucket =
      allWebsites?.[hostname]?.connectedAddress || {};

    if (connectedAddressBucket[currentAddress]) {
      const connectedAddress = [];
      Object.keys(connectedAddressBucket).forEach((address) => {
        const item = connectedAddressBucket[address];
        if (item.chain === 'Neo3') {
          const wallet = neo3WalletArr.find(
            (w) => w.accounts[0].address === address,
          );
          if (wallet) {
            connectedAddress.push({
              hash: '0x' + getScriptHashFromAddress(address),
              address,
              label: wallet.name,
              extra: {
                isLedger: !!w.accounts[0].extra?.ledgerSLIP44,
              },
            });
          }
        }
      });
      const index = connectedAddress.findIndex(
        (item) => item.address === currentAddress,
      );
      const temp = connectedAddress[index];
      connectedAddress.splice(index, 1);
      connectedAddress.unshift(temp);
      return connectedAddress;
    }
    return;
  }

  public networkChangeEvent(network: RpcNetwork) {
    if (this.check) {
      if (network.network === 'EVM') {
        this.windowCallback({
          data: {
            chainId: network.chainId,
            networks: DEFAULT_NETWORKS,
            defaultNetwork: network.network,
          },
          return: NEOX_EVENT.EVM_NETWORK_CHANGED,
        });
      } else {
        this.windowCallback({
          data: {
            chainId: network.chainId,
            networks: DEFAULT_NETWORKS,
            defaultNetwork: network.network,
          },
          return: EVENT.NETWORK_CHANGED,
        });
      }
    }
  }
  //#endregion
}
