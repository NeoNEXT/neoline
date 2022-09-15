import { Injectable } from '@angular/core';
import { Observable, of, throwError, from } from 'rxjs';
import { map } from 'rxjs/operators';
import { wallet as wallet3 } from '@cityofzion/neon-core-neo3/lib';
import { Asset, NftAsset } from '@/models/models';
import { EVENT } from '@/models/dapi';
import {
    STORAGE_NAME,
    STORAGE_VALUE_TYPE,
    STORAGE_VALUE_MESSAGE,
    RpcNetwork,
    DEFAULT_NETWORKS,
} from '@/app/popup/_lib';
import { ExtensionService } from '../util/extension.service';

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
    public getWatch(networkId: number, address: string): Observable<Asset[]> {
        const storageName = `watch`;
        if (!this.check) {
            try {
                let rs =
                    (JSON.parse(localStorage.getItem(storageName)) || {})?.[
                        networkId
                    ]?.[address] || [];
                if (!Array.isArray(rs)) {
                    rs = [];
                }
                rs.forEach((item) => delete item.balance);
                return of(rs);
            } catch (e) {
                return throwError(
                    'please set watch to local storage when debug mode on'
                );
            }
        } else {
            return from(
                new Promise<Asset[]>((resolve, reject) => {
                    try {
                        this.crx.getLocalStorage(storageName, (res) => {
                            res = (res || {})?.[networkId]?.[address] || [];
                            if (!Array.isArray(res)) {
                                res = [];
                            }
                            res.forEach((item) => delete item.balance);
                            resolve(res);
                        });
                    } catch (e) {
                        reject('failed');
                    }
                })
            );
        }
    }
    private getAllWatch(): Observable<object> {
        const storageName = `watch`;
        if (!this.check) {
            try {
                const rs = JSON.parse(localStorage.getItem(storageName)) || {};
                return of(rs);
            } catch (e) {
                return throwError(
                    'please set watch to local storage when debug mode on'
                );
            }
        } else {
            return from(
                new Promise<Asset[]>((resolve, reject) => {
                    try {
                        this.crx.getLocalStorage(storageName, (res) => {
                            res = res || {};
                            resolve(res);
                        });
                    } catch (e) {
                        reject('failed');
                    }
                })
            );
        }
    }
    public setWatch(networkId: number, address?: string, watch?: Asset[]) {
        if (watch) {
            watch.forEach((item) => delete item.balance);
        }
        const storageName = `watch`;
        this.getAllWatch().subscribe((watchObject) => {
            const saveWatch = watchObject || {};
            if (!saveWatch?.[networkId]) {
                saveWatch[networkId] = {};
            }
            if (address) {
                saveWatch[networkId][address] = watch;
            } else {
                saveWatch[networkId] = {}; // reset this networkId data
            }
            if (!this.check) {
                localStorage.setItem(storageName, JSON.stringify(saveWatch));
                return;
            }
            try {
                const saveData = {};
                saveData[storageName] = saveWatch;
                this.crx.setLocalStorage(saveData);
            } catch (e) {
                console.log('set watch failed', e);
            }
        });
    }
    public getNftWatch(
        networkId: number,
        address: string
    ): Observable<NftAsset[]> {
        const storageName = `nft_watch`;
        if (!this.check) {
            try {
                let rs =
                    (JSON.parse(localStorage.getItem(storageName)) || {})?.[
                        networkId
                    ]?.[address] || [];
                if (!Array.isArray(rs)) {
                    rs = [];
                }
                return of(rs);
            } catch (e) {
                return throwError(
                    'please set watch to local storage when debug mode on'
                );
            }
        } else {
            return from(
                new Promise<NftAsset[]>((resolve, reject) => {
                    try {
                        this.crx.getLocalStorage(storageName, (res) => {
                            res = (res || {})?.[networkId]?.[address] || [];
                            if (!Array.isArray(res)) {
                                res = [];
                            }
                            resolve(res);
                        });
                    } catch (e) {
                        reject('failed');
                    }
                })
            );
        }
    }
    private getAllNftWatch(): Observable<object> {
        const storageName = `nft_watch`;
        if (!this.check) {
            try {
                const rs = JSON.parse(localStorage.getItem(storageName)) || {};
                return of(rs);
            } catch (e) {
                return throwError(
                    'please set watch to local storage when debug mode on'
                );
            }
        } else {
            return from(
                new Promise<NftAsset[]>((resolve, reject) => {
                    try {
                        this.crx.getLocalStorage(storageName, (res) => {
                            res = res || {};
                            resolve(res);
                        });
                    } catch (e) {
                        reject('failed');
                    }
                })
            );
        }
    }
    public setNftWatch(
        networkId: number,
        address?: string,
        watch?: NftAsset[]
    ) {
        const storageName = `nft_watch`;
        this.getAllNftWatch().subscribe((watchObject) => {
            const saveWatch = watchObject || {};
            if (!saveWatch?.[networkId]) {
                saveWatch[networkId] = {};
            }
            if (address) {
                saveWatch[networkId][address] = watch;
            } else {
                saveWatch[networkId] = {}; // reset this networkId data
            }
            if (!this.check) {
                localStorage.setItem(storageName, JSON.stringify(saveWatch));
                return;
            }
            try {
                const saveData = {};
                saveData[storageName] = saveWatch;
                this.crx.setLocalStorage(saveData);
            } catch (e) {
                console.log('set watch failed', e);
            }
        });
    }
    resetWatch(networkId: number) {
        this.setWatch(networkId);
        this.setNftWatch(networkId);
    }
    //#endregion

    //#region reset method
    public clearAssetFile() {
        this.removeStorage(STORAGE_NAME.coinsRate);
        this.removeStorage(STORAGE_NAME.neo3CoinsRate);
        this.removeStorage(STORAGE_NAME.fiatRate);
    }

    public clearStorage() {
        if (!this.check) {
            localStorage.clear();
        }
        try {
            this.crx.clearStorage();
            this.crx.clearLocalStorage();
        } catch (e) {
            console.log('close wallet failed', e);
        }
    }

    public resetWallet() {
        this.setLogin(false);
        this.setStorage(STORAGE_NAME.WIFArr, []);
        this.setStorage(STORAGE_NAME['WIFArr-Neo3'], []);
        this.setStorage(STORAGE_NAME.walletArr, []);
        this.setStorage(STORAGE_NAME['walletArr-Neo3'], []);
        this.setWallet(undefined);
    }
    //#endregion

    //#region should login
    public getLogin(): Observable<boolean> {
        if (!this.check) {
            return of(sessionStorage.getItem('shouldLogin') === 'true');
        } else {
            return this.getStorage(STORAGE_NAME.shouldLogin);
        }
    }

    public setLogin(status: boolean) {
        if (status === null) {
            if (!this.check) {
                sessionStorage.removeItem('shouldLogin');
            } else {
                this.setStorage(STORAGE_NAME.shouldLogin, true);
            }
        } else {
            if (!this.check) {
                sessionStorage.setItem('shouldLogin', status.toString());
            } else {
                this.setStorage(STORAGE_NAME.shouldLogin, status);
            }
            if (status) {
                if (!this.check) {
                    sessionStorage.removeItem('hasLoginAddress');
                } else {
                    this.setStorage(STORAGE_NAME.hasLoginAddress, {});
                }
            }
        }
    }

    public getShouldFindNode(): Observable<boolean> {
        if (!this.check) {
            return of(sessionStorage.getItem('shouldFindNode') === 'true');
        } else {
            return this.getStorage(STORAGE_NAME.shouldFindNode);
        }
    }

    public setShouldFindNode(status: boolean) {
        if (status === null) {
            if (!this.check) {
                sessionStorage.removeItem('shouldFindNode');
            } else {
                this.setStorage(STORAGE_NAME.shouldFindNode, true);
            }
        } else {
            if (!this.check) {
                sessionStorage.setItem('shouldFindNode', status.toString());
            } else {
                this.setStorage(STORAGE_NAME.shouldFindNode, status);
            }
        }
    }

    public getHasLoginAddress(): Observable<any> {
        if (!this.check) {
            return of(
                JSON.parse(sessionStorage.getItem('hasLoginAddress') || '{}')
            );
        } else {
            return this.getStorage(STORAGE_NAME.hasLoginAddress);
        }
    }

    public setHasLoginAddress(address) {
        this.getHasLoginAddress().subscribe((hasLoginAddress) => {
            hasLoginAddress[address] = true;
            if (!this.check) {
                sessionStorage.setItem(
                    'hasLoginAddress',
                    JSON.stringify(hasLoginAddress)
                );
            } else {
                this.setStorage(STORAGE_NAME.hasLoginAddress, hasLoginAddress);
            }
        });
    }
    //#endregion

    //#region backup
    public getHaveBackupTip(): Observable<any> {
        if (!this.check) {
            if (sessionStorage.getItem('haveBackupTip') === 'true') {
                return of(true);
            }
            if (sessionStorage.getItem('haveBackupTip') === 'false') {
                return of(false);
            }
            return of(sessionStorage.getItem('haveBackupTip'));
        } else {
            return this.getStorage(STORAGE_NAME.haveBackupTip);
        }
    }

    public setHaveBackupTip(status?: boolean) {
        const setValue = status === null;
        if (status === null) {
            if (!this.check) {
                sessionStorage.removeItem('haveBackupTip');
            } else {
                this.setStorage(STORAGE_NAME.haveBackupTip, null);
            }
        } else {
            if (!this.check) {
                sessionStorage.setItem('haveBackupTip', status.toString());
            } else {
                this.setStorage(STORAGE_NAME.haveBackupTip, status);
            }
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

    public httpGet(
        url: string,
        callback: (arg0: any) => void,
        headers: object = null
    ) {
        try {
            this.crx.httpGet(url, callback, headers);
        } catch (e) {
            console.log('not in crx env');
        }
    }

    public httpPost(
        url: string,
        data: any,
        callback: (arg0: any) => void,
        headers: object = null
    ) {
        try {
            this.crx.httpPost(url, data, callback, headers);
        } catch (e) {
            console.log('not in crx env');
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
            if (
                STORAGE_VALUE_MESSAGE[storageName].type ===
                STORAGE_VALUE_TYPE.map
            ) {
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
                    targetValue =
                        value && value !== 'undefined' ? JSON.parse(value) : {};
                    break;
                case STORAGE_VALUE_TYPE.array:
                    targetValue =
                        value && value !== 'undefined' ? JSON.parse(value) : [];
                    break;
                case STORAGE_VALUE_TYPE.map:
                    targetValue =
                        value && value !== 'undefined'
                            ? new Map(JSON.parse(value))
                            : new Map();
                    break;
                case STORAGE_VALUE_TYPE.number:
                    targetValue =
                        value && value !== 'undefined' ? Number(value) : 0;
                    break;
                case STORAGE_VALUE_TYPE.boolean:
                    targetValue = value === 'true' ? true : false;
                    break;
            }
        } else {
            if (
                STORAGE_VALUE_MESSAGE[storageName].type ===
                STORAGE_VALUE_TYPE.map
            ) {
                targetValue = value ? new Map(JSON.parse(value)) : new Map();
            }
            if (
                STORAGE_VALUE_MESSAGE[storageName].type ===
                STORAGE_VALUE_TYPE.number
            ) {
                targetValue = value ? Number(value) : 0;
            }
            if (
                (storageName === STORAGE_NAME.transaction ||
                    storageName === STORAGE_NAME.connectedWebsites ||
                    storageName === STORAGE_NAME.walletsStatus ||
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
                this.handleStorageValue(
                    storageName,
                    localStorage.getItem(storageName)
                )
            );
        }
        return from(
            new Promise<any>((resolve, reject) => {
                try {
                    STORAGE_VALUE_MESSAGE[storageName].isLocal
                        ? this.crx.getLocalStorage(storageName, (res) => {
                              resolve(
                                  this.handleStorageValue(storageName, res)
                              );
                          })
                        : this.crx.getStorage(storageName, (res) => {
                              resolve(
                                  this.handleStorageValue(storageName, res)
                              );
                          });
                } catch (e) {
                    reject('failed');
                }
            })
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
    public setWallet(w: any) {
        const currChainType = wallet3.isAddress(
            w?.accounts[0]?.address || '',
            53
        )
            ? 'Neo3'
            : 'Neo2';
        this.setStorage(STORAGE_NAME.wallet, w);
        this.setStorage(STORAGE_NAME.chainType, currChainType);
        if (this.check) {
            this.windowCallback({
                data: {
                    address: w?.accounts[0]?.address,
                    label: w?.name,
                },
                return: EVENT.ACCOUNT_CHANGED,
            });
        }
    }
    public networkChangeEvent(network: RpcNetwork) {
        if (this.check) {
            this.windowCallback({
                data: {
                    chainId: network.chainId,
                    networks: DEFAULT_NETWORKS,
                    defaultNetwork: network.network
                },
                return: EVENT.NETWORK_CHANGED,
            });
        }
    }
    //#endregion

    //#region wallet status
    public setWalletsStatus(address: string) {
        this.getStorage(STORAGE_NAME.walletsStatus).subscribe((res) => {
            res[address] = true;
            this.setStorage(STORAGE_NAME.walletsStatus, res);
        });
    }

    public getWalletStatus(address: string): Observable<boolean> {
        return this.getStorage(STORAGE_NAME.walletsStatus).pipe(
            map((res) => {
                return (res && res[address]) || false;
            })
        );
    }
    //#endregion
}
