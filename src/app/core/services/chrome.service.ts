import { Injectable } from '@angular/core';
import { Observable, of, throwError, from } from 'rxjs';
import { map } from 'rxjs/operators';
import { wallet as wallet3 } from '@cityofzion/neon-core-neo3/lib';
import { Asset, NftAsset } from '@/models/models';
import { EVENT } from '@/models/dapi';
import {
    ChainType,
    STORAGE_NAME,
    STORAGE_VALUE_TYPE,
    STORAGE_VALUE_MESSAGE,
    DEFAULT_N2_RPC_NETWORK,
    DEFAULT_N3_RPC_NETWORK,
    NetworkType,
} from '@/app/popup/_lib';

declare var chrome: any;

@Injectable()
export class ChromeService {
    private crx: any = null;

    constructor() {
        try {
            this.crx = chrome.extension.getBackgroundPage().NEOLineBackground; //  chrome.extension.getBackgroundPage();
        } catch (e) {
            this.crx = null;
        }
    }

    /**
     * check is in chrome extension env
     * 检查是否处在crx环境中
     */
    public get check(): boolean {
        return !!this.crx;
    }

    public getVersion(): string {
        if (this.check) {
            return this.crx.version;
        } else {
            return '';
        }
    }

    /**
     * expand method to open full page from popup
     * currently open to /asset by default
     * 从弹出式页面打开到完整页面
     */
    public expand(): Promise<any> {
        return new Promise((res, rej) => {
            if (!this.check) {
                rej('crx not exists');
                return;
            }
            try {
                this.crx.expand();
                res(null);
            } catch (e) {
                rej(e);
            }
        });
    }

    public getWatch(
        address: string,
        chainType: ChainType,
        network: NetworkType
    ): Observable<Asset[]> {
        const storageName = `watch_${network.toLowerCase()}-${chainType}`;
        if (!this.check) {
            try {
                let rs =
                    (JSON.parse(localStorage.getItem(storageName)) || {})[
                        address
                    ] || [];
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
                            res = (res || {})[address] || [];
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
    public getAllWatch(
        chainType: ChainType,
        network: NetworkType
    ): Observable<object> {
        const storageName = `watch_${network.toLowerCase()}-${chainType}`;
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
    public setWatch(
        address: string,
        watch: Asset[],
        chainType: ChainType,
        network: NetworkType
    ) {
        watch.forEach((item) => delete item.balance);
        const storageName = `watch_${network.toLowerCase()}-${chainType}`;
        this.getAllWatch(chainType, network).subscribe((watchObject) => {
            const saveWatch = watchObject || {};
            saveWatch[address] = watch;
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
        address: string,
        chainType: ChainType,
        network: NetworkType
    ): Observable<NftAsset[]> {
        const storageName = `nft_watch_${network.toLowerCase()}-${chainType}`;
        if (!this.check) {
            try {
                let rs =
                    (JSON.parse(localStorage.getItem(storageName)) || {})[
                        address
                    ] || [];
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
                            res = (res || {})[address] || [];
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
    private getAllNftWatch(
        chainType: ChainType,
        network: NetworkType
    ): Observable<object> {
        const storageName = `nft_watch_${network.toLowerCase()}-${chainType}`;
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
        address: string,
        watch: NftAsset[],
        chainType: ChainType,
        network: NetworkType
    ) {
        const storageName = `nft_watch_${network.toLowerCase()}-${chainType}`;
        this.getAllNftWatch(chainType, network).subscribe((watchObject) => {
            const saveWatch = watchObject || {};
            saveWatch[address] = watch;
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

    public clearAssetFile() {
        this.removeStorage(STORAGE_NAME.assetCNYRate);
        this.removeStorage(STORAGE_NAME.assetUSDRate);
        this.removeStorage(STORAGE_NAME.neo3AssetCNYRate);
        this.removeStorage(STORAGE_NAME.neo3AssetUSDRate);
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

    public getLogin(): boolean {
        if (!this.check) {
            return sessionStorage.getItem('shouldLogin') === 'true';
        } else {
            return this.crx.shouldLogin === true;
        }
    }

    public setLogin(status: boolean) {
        if (status === null) {
            if (!this.check) {
                sessionStorage.removeItem('shouldLogin');
            } else {
                this.crx.shouldLogin = null;
            }
        } else {
            if (!this.check) {
                sessionStorage.setItem('shouldLogin', status.toString());
            } else {
                this.crx.shouldLogin = status;
            }
        }
    }

    public getHaveBackupTip() {
        if (!this.check) {
            if (sessionStorage.getItem('haveBackupTip') === 'true') {
                return true;
            }
            if (sessionStorage.getItem('haveBackupTip') === 'false') {
                return false;
            }
            return sessionStorage.getItem('haveBackupTip');
        } else {
            return this.crx.haveBackupTip;
        }
    }

    public setHaveBackupTip(status?: boolean) {
        const setValue = status === null;
        if (status === null) {
            if (!this.check) {
                sessionStorage.removeItem('haveBackupTip');
            } else {
                this.crx.haveBackupTip = null;
            }
        } else {
            if (!this.check) {
                sessionStorage.setItem('haveBackupTip', status.toString());
            } else {
                this.crx.haveBackupTip = status;
            }
        }
    }

    public getLocalStorage(key): Promise<any> {
        return this.crx.getLocalStorage(key, (res) => {
            return res;
        });
    }

    public setLocalStorage(data) {
        this.crx.setLocalStorage(data);
    }

    public windowCallback(data: any) {
        if (this.check) {
            this.crx.windowCallback(data);
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

    public httpGetImage(
        url: string,
        callback: (arg0: any) => void,
        headers: object = null
    ) {
        try {
            this.crx.httpGetImage(url, callback, headers);
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
                    targetValue = value ? JSON.parse(value) : {};
                    break;
                case STORAGE_VALUE_TYPE.array:
                    targetValue = value ? JSON.parse(value) : [];
                    break;
                case STORAGE_VALUE_TYPE.map:
                    targetValue = value
                        ? new Map(JSON.parse(value))
                        : new Map();
                    break;
                case STORAGE_VALUE_TYPE.number:
                    targetValue = value ? Number(value) : 0;
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
                    storageName === STORAGE_NAME.authAddress) &&
                !value
            ) {
                targetValue = {};
            }
        }
        if (storageName === STORAGE_NAME.lang && !value) {
            targetValue = 'en';
        }
        if (storageName === STORAGE_NAME.n2Networks && !value) {
            targetValue = DEFAULT_N2_RPC_NETWORK;
        }
        if (storageName === STORAGE_NAME.n3Networks && !value) {
            targetValue = DEFAULT_N3_RPC_NETWORK;
        }
        if (storageName === STORAGE_NAME.rateCurrency && !value) {
            targetValue = 'USD';
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
        const currChainType = wallet3.isAddress(w?.accounts[0].address || '', 53)
            ? 'Neo3'
            : 'Neo2';
        this.setStorage(STORAGE_NAME.wallet, w);
        this.setStorage(STORAGE_NAME.chainType, currChainType);
        // this.setNetwork();
        if (this.check) {
            this.windowCallback({
                data: {
                    address: w.accounts[0].address,
                    label: w.name,
                },
                return: EVENT.ACCOUNT_CHANGED,
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
