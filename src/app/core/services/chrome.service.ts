import {
    Injectable
} from '@angular/core';
import {
    Observable,
    of,
    throwError,
    from,
} from 'rxjs';
import {
    WalletJSON as WalletJSON2
} from '@cityofzion/neon-core/lib/wallet';
import {
    WalletJSON as WalletJSON3
} from '@cityofzion/neon-core-neo3/lib/wallet';
import {
    wallet as wallet3,
} from '@cityofzion/neon-core-neo3/lib';
import { Asset } from '@/models/models';
import { EVENT, NETWORKS } from '@/models/dapi';
import { ChainId, ChainType, NetType } from '@/app/popup/_lib';

declare var chrome: any;

@Injectable()
export class ChromeService {
    private crx: any = null;
    private net: string;
    private chainType: string;
    private activeNetwork;

    constructor() {
        try {
            this.crx = chrome.extension.getBackgroundPage().NEOLineBackground; //  chrome.extension.getBackgroundPage();
        } catch (e) {
            this.crx = null;
        }
    }

    public async initNetwork() {
        const storageName = 'network';
        this.chainType = await this.getCurrentWalletChainType();
        const network = await this.getNetwork();
        if (network) {
            this.activeNetwork = network;
            return;
        }
        let currChainId: ChainId;
        if (this.chainType === 'Neo2') {
            currChainId = this.net === NetType.MainNet ? ChainId.Neo2MainNet : ChainId.Neo2TestNet;
        } else if (this.chainType === 'Neo3') {
            currChainId = ChainId.N3TestNet;
        } else {
            // New user default chainId.
            this.chainType = 'Neo2';
            currChainId = ChainId.Neo2MainNet;
        }
        const defaultNetwork = NETWORKS[currChainId - 1];
        const currNetwork = {
            chainId: currChainId,
            networks: NETWORKS,
            defaultNetwork: defaultNetwork || 'MainNet'
        };
        this.activeNetwork = currNetwork;
        if (!this.check) {
            localStorage.setItem(storageName, JSON.stringify(currNetwork));
            return;
        }
        try {
            const saveData = {};
            saveData[storageName] = currNetwork;
            this.crx.setStorage(saveData);
            this.crx.setNetwork(defaultNetwork, currChainId, this.chainType);
            this.windowCallback({
                return: EVENT.NETWORK_CHANGED,
                data: currNetwork
            });
        } catch (e) {
            console.log('init network failed', e);
        }
    }

    public async setNetwork() {
        const storageName = 'network';
        let chainId;
        if (this.chainType === 'Neo3') {
            chainId = this.net === NetType.MainNet ? ChainId.N3MainNet : ChainId.N3TestNet;
        } else {
            chainId = this.net === NetType.MainNet ? ChainId.Neo2MainNet : ChainId.Neo2TestNet;
        }
        if (this.activeNetwork?.chainId !== chainId) {
            const defaultNetwork = NETWORKS[chainId - 1];
            const currNetwork = {
                chainId,
                networks: NETWORKS,
                defaultNetwork
            };
            this.activeNetwork = currNetwork;
            if (!this.check) {
                localStorage.setItem(storageName, JSON.stringify(currNetwork));
                return;
            }
            try {
                const saveData = {};
                saveData[storageName] = currNetwork;
                this.crx.setStorage(saveData);
                this.crx.setNetwork(defaultNetwork, chainId, this.chainType);
                this.windowCallback({
                    return: EVENT.NETWORK_CHANGED,
                    data: currNetwork
                });
            } catch (e) {
                console.log('set network failed', e);
            }
        }
    }

    public getNetwork() {
        const storageName = 'network';
        if (!this.check) {
            return new Promise<any>(resolve => {
                resolve(JSON.parse(localStorage.getItem(storageName)));
            });
        }
        return new Promise<any>((resolve, reject) => {
            try {
                this.crx.getStorage(storageName, (res) => {
                    resolve(res || null);
                });
            } catch (e) {
                reject('get network failed');
            }
        });
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
    /**
     * Get saved account from storage.
     * 从存储中获取当前钱包
     */
    public getWallet(): Observable<any> {
        if (!this.check) {
            try {
                return of(JSON.parse(localStorage.getItem('wallet')));
            } catch (e) {
                return throwError('please set wallet json to local storage when debug mode on');
            }
        }
        return from(new Promise<WalletJSON2 | WalletJSON3>((resolve, reject) => {
            try {
                this.crx.getLocalStorage('wallet', (res) => {
                    resolve(res);
                });
            } catch (e) {
                reject('failed');
            }
        }));
    }
    public getWalletArray(chainType: ChainType): Observable<Array<any>> {
        let storageName = `walletArr-${chainType}`;
        if (chainType === 'Neo2') {
            storageName = 'walletArr';
        }
        if (!this.check) {
            try {
                return of(JSON.parse(localStorage.getItem(storageName)));
            } catch (e) {
                return throwError('please set wallet json to local storage when debug mode on');
            }
        }
        return from(new Promise<Array<WalletJSON2 | WalletJSON3>>((resolve, reject) => {
            try {
                this.crx.getLocalStorage(storageName, (res) => {
                    resolve(res);
                });
            } catch (e) {
                reject('failed');
            }
        }));
    }
    public getWIFArray(chainType: ChainType): Observable<Array<string>> {
        let storageName = `WIFArr-${chainType}`;
        if (chainType === 'Neo2') {
            storageName = 'WIFArr';
        }
        if (!this.check) {
            try {
                return of(JSON.parse(localStorage.getItem(storageName)));
            } catch (e) {
                return throwError('please set wif json to local storage when debug mode on');
            }
        }
        return from(new Promise<Array<string>>((resolve, reject) => {
            try {
                this.crx.getLocalStorage(storageName, (res) => {
                    resolve(res);
                });
            } catch (e) {
                reject('failed');
            }
        }));
    }

    /**
     * Set wallet as active account, and add to history list.
     * 保存当前钱包，并记录到历史
     */
    public setWallet(w: any) {
        const currChainType = wallet3.isAddress(w?.accounts[0].address || '') ? 'Neo3' : 'Neo2';
        if (!this.check) {
            localStorage.setItem('wallet', JSON.stringify(w));
            this.setCurrentWalletChainType(currChainType);
            this.setNetwork();
            return;
        }
        try {
            this.crx.setLocalStorage({
                wallet: w
            });
            this.setCurrentWalletChainType(currChainType);
            this.setNetwork();
            this.windowCallback({
                data: {
                    address: w.accounts[0].address,
                    label: w.name,
                },
                return: EVENT.ACCOUNT_CHANGED,
            });
        } catch (e) {
            console.log('set account failed', e);
        }
    }
    /**
     * Set wallet as active chainType, and add to history list.
     * 保存当前链，并记录到历史
     */
    public setCurrentWalletChainType(chain: string) {
        this.chainType = chain;
        if (!this.check) {
            localStorage.setItem('chainType', chain);
            return;
        }
        try {
            this.crx.setLocalStorage({
                chainType: chain
            });
        } catch (e) {
            console.log('set chainType failed', e);
        }
    }

    public getCurrentWalletChainType() {
        if (!this.check) {
            return new Promise<string>(resolve => {
                resolve(localStorage.getItem('chainType'));
            });
        }
        return new Promise<string>((resolve, reject) => {
            try {
                this.crx.getLocalStorage('chainType', (res) => {
                    resolve(res || 'Neo2');
                });
            } catch (e) {
                reject('failed');
            }
        });
    }

    /**
     * Set wallets, and add to history list.
     * 保存钱包数组，并记录到历史
     */
    public setWalletArray(w: Array<any>, chainType: ChainType) {
        let storageName = `walletArr-${chainType}`;
        if (chainType === 'Neo2') {
            storageName = 'walletArr';
        }
        if (!this.check) {
            localStorage.setItem(storageName, JSON.stringify(w));
            return;
        }
        try {
            const saveData = {};
            saveData[storageName] = w;
            this.crx.setLocalStorage(saveData);
        } catch (e) {
            console.log('set account failed', e);
        }
    }

    /**
     * Set wallets, and add to history list.
     * 保存wif数组，并记录到历史
     */
    public setWIFArray(WIFArr: Array<string>, chainType: ChainType) {
        let storageName = `WIFArr-${chainType}`;
        if (chainType === 'Neo2') {
            storageName = 'WIFArr';
        }
        if (!this.check) {
            localStorage.setItem(storageName, JSON.stringify(WIFArr));
            return;
        }
        try {
            const saveData = {};
            saveData[storageName] = WIFArr;
            this.crx.setLocalStorage(saveData);
        } catch (e) {
            console.log('set account failed', e);
        }
    }

    public getUpdateNeo3AddressFlag(): Observable<any> {
        if (!this.check) {
            try {
                return of(JSON.parse(localStorage.getItem('neo3AddressFlag')));
            } catch (e) {
                return throwError('please set neo3AddressFlag json to local storage when debug mode on');
            }
        }
        return from(new Promise<WalletJSON2 | WalletJSON3>((resolve, reject) => {
            try {
                this.crx.getLocalStorage('neo3AddressFlag', (res) => {
                    resolve(res);
                });
            } catch (e) {
                reject('failed');
            }
        }));
    }

    public setUpdateNeo3AddressFlag(flag: boolean) {
        const storageName = `neo3AddressFlag`;

        if (!this.check) {
            localStorage.setItem(storageName, JSON.stringify(flag));
            return;
        }
        try {
            const saveData = {};
            saveData[storageName] = flag;
            this.crx.setLocalStorage(saveData);
        } catch (e) {
            console.log('set account failed', e);
        }
    }

    /**
     * Close opened wallet, remove from storage
     * 清除当前打开的钱包
     */
    public closeWallet() {
        if (!this.check) {
            localStorage.removeItem('wallet');
            return;
        }
        try {
            this.crx.removeLocalStorage('wallet');
        } catch (e) {
            console.log('close wallet failed', e);
        }
    }
    public clearLogin() {
        if (!this.check) {
            localStorage.setItem('shouldLogin', 'true');
            return;
        }
        try {
            this.crx.setLocalStorage({
                shouldLogin: true
            });
        } catch (e) {
            console.log('clear login failed', e);
        }
    }
    public verifyLogin() {
        if (!this.check) {
            localStorage.setItem('shouldLogin', 'false');
            return;
        }
        try {
            this.crx.setLocalStorage({
                shouldLogin: false
            });
        } catch (e) {
            console.log('verify login', e);
        }
    }
    public getLogin(): Observable<boolean> {
        if (!this.check) {
            return from(new Promise<boolean>(resolve => {
                resolve(localStorage.getItem('shouldLogin') === 'true');
            }));
        }
        return from(new Promise<boolean>((resolve, reject) => {
            try {
                this.crx.getLocalStorage('shouldLogin', (res) => {
                    switch (res) {
                        case true:
                        case false:
                            break;
                        default:
                            res = false;
                    }
                    resolve(res);
                });
            } catch (e) {
                reject('failed');
            }
        }));
    }
    public setLogin(status: string) {
        if (!this.check) {
            localStorage.setItem('shouldLogin', status);
        } else {
            return from(new Promise((resolve, reject) => {
                try {
                    this.crx.setLocalStorage({ shouldLogin: status });
                } catch (e) {
                    reject('failed');
                }
            }));
        }
    }
    public setLang(lang: string) {
        if (!this.check) {
            localStorage.setItem('lang', lang);
            return;
        }
        try {
            this.crx.setStorage({
                lang
            });
            this.crx.setPopup(lang);

        } catch (e) {
            console.log('set lang failed', e);
        }
    }
    public getLang(): Observable<string> {
        if (!this.check) {
            try {
                let lang = localStorage.getItem('lang') || '';
                switch (lang) {
                    case 'zh_CN':
                    case 'en':
                        break;
                    default:
                        lang = 'en';
                }
                return of(lang);
            } catch (e) {
                return throwError('please get lang to local storage when debug mode on');
            }
        }
        return from(new Promise<string>((resolve, reject) => {
            try {
                this.crx.getStorage('lang', (res) => {
                    switch (res) {
                        case 'zh_CN':
                        case 'en':
                            break;
                        default:
                            res = 'en';
                    }
                    resolve(res);
                });
            } catch (e) {
                reject('failed');
            }
        }));
    }
    public getWatch(address: string, chainType: ChainType): Observable<Asset[]> {
        const storageName = `watch_${this.net.toLowerCase()}-${chainType}`;
        if (!this.check) {
            try {
                let rs = (JSON.parse(localStorage.getItem(storageName))|| {})[address] || [];
                if (!Array.isArray(rs)) {
                    rs = [];
                }
                return of(rs);
            } catch (e) {
                return throwError('please set watch to local storage when debug mode on');
            }
        } else {
            return from(new Promise<Asset[]>((resolve, reject) => {
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
            }));
        }
    }
    public getAllWatch(chainType: ChainType): Observable<object> {
        const storageName = `watch_${this.net.toLowerCase()}-${chainType}`;
        if (!this.check) {
            try {
                const rs = JSON.parse(localStorage.getItem(storageName))|| {};
                return of(rs);
            } catch (e) {
                return throwError('please set watch to local storage when debug mode on');
            }
        } else {
            return from(new Promise<Asset[]>((resolve, reject) => {
                try {
                    this.crx.getLocalStorage(storageName, (res) => {
                        res = res || {};
                        resolve(res);
                    });
                } catch (e) {
                    reject('failed');
                }
            }));
        }
    }
    public setWatch(address: string, watch: Asset[], chainType: ChainType) {
        const storageName = `watch_${this.net.toLowerCase()}-${chainType}`;
        this.getAllWatch(chainType).subscribe(watchObject => {
            const saveWatch = watchObject || {};
            saveWatch[address] = watch;
            if (!this.check) {
                localStorage.setItem(storageName, JSON.stringify(saveWatch));
                return;
            }
            try {
                const saveData = {};
                saveData[storageName]= saveWatch;
                this.crx.setLocalStorage(saveData);
            } catch (e) {
                console.log('set watch failed', e);
            }
        })
    }
    public setTransaction(transaction: object) {
        if (!this.check) {
            localStorage.setItem('transaction', JSON.stringify(transaction));
            return;
        }
        try {
            this.crx.setStorage({
                transaction
            });
        } catch (e) {
            console.log('set account failed', e);
        }
    }
    public getTransaction(): Observable<object> {
        if (!this.check) {
            try {
                if (localStorage.getItem('transaction') == null) {
                    return of({});
                }
                return of(JSON.parse(localStorage.getItem('transaction')));
            } catch (e) {
                return throwError('please get transaction json to local storage when debug mode on');
            }
        }
        return from(new Promise<object>((resolve, reject) => {
            try {
                this.crx.getStorage('transaction', (res) => {
                    if (typeof res === 'undefined') {
                        res = {};
                    }
                    resolve(res);
                });
            } catch (e) {
                reject('failed');
            }
        }));
    }
    public setAuthorization(websits: object) {
        if (!this.check) {
            localStorage.setItem('connectedWebsites', JSON.stringify(websits));
            return;
        }
        try {
            this.crx.setStorage({
                connectedWebsites: websits
            });
        } catch (e) {
            console.log('set account failed', e);
        }
    }

    public getAuthorization(): Observable<object> {
        if (!this.check) {
            try {
                if (localStorage.getItem('connectedWebsites') == null) {
                    return of({});
                }
                return of(JSON.parse(localStorage.getItem('connectedWebsites')));
            } catch (e) {
                return throwError(('failed'));
            }
        }
        return from(new Promise<object>((resolve, reject) => {
            try {
                this.crx.getStorage('connectedWebsites', (res) => {
                    if (typeof res === 'undefined') {
                        res = {};
                    }
                    resolve(res);
                });
            } catch (e) {
                reject('failed');
            }
        }));
    }

    public setRateCurrency(rateCurrency: string) {
        if (!this.check) {
            localStorage.setItem('rateCurrency', rateCurrency);
            return;
        }
        try {
            this.crx.setStorage({
                rateCurrency
            });
        } catch (e) {
            console.log('set current rate currency failed', e);
        }
    }

    public getRateCurrency(): Observable<string> {
        const defaultCurrency = 'CNY';
        if (!this.check) {
            try {
                return of(localStorage.getItem('rateCurrency') || defaultCurrency);
            } catch (e) {
                return throwError(('failed'));
            }
        }
        return from(new Promise<string>((resolve, reject) => {
            try {
                this.crx.getStorage('rateCurrency', (res) => {
                    if (typeof res === 'undefined') {
                        res = defaultCurrency;
                    }
                    resolve(res);
                });
            } catch (e) {
                reject('failed');
            }
        }));
    }

    public setAssetFile(assetFile: Map<string, {}>) {
        if (!this.check) {
            localStorage.setItem('assetFile', JSON.stringify(Array.from(assetFile.entries())));
            return;
        }
        try {
            this.crx.setLocalStorage({
                assetFile: JSON.stringify(Array.from(assetFile.entries()))
            });
        } catch (e) {
            console.log('set assetFile failed', e);
        }
    }
    public getAssetFile(): Observable<Map<string, {}>> {
        if (!this.check) {
            try {
                return of(new Map(JSON.parse(localStorage.getItem('assetFile'))));
            } catch (e) {
                return throwError('please get history json to local storage when debug mode on');
            }
        }
        return from(new Promise<Map<string, {}>>((resolve, reject) => {
            try {
                this.crx.getLocalStorage('assetFile', (res) => {
                    if (res) {
                        resolve(new Map(JSON.parse(res)));
                    } else {
                        resolve(new Map());
                    }
                });
            } catch (e) {
                reject('failed');
            }
        }));
    }

    public setAssetCNYRate(assetCNYRate: Map<string, {}>) {
        if (!this.check) {
            localStorage.setItem('assetCNYRate', JSON.stringify(Array.from(assetCNYRate.entries())));
            return;
        }
        try {
            this.crx.setStorage({
                assetCNYRate: JSON.stringify(Array.from(assetCNYRate.entries()))
            });
        } catch (e) {
            console.log('set assetCNYRate failed', e);
        }
    }
    public getAssetCNYRate(): Observable<Map<string, {}>> {
        if (!this.check) {
            try {
                return of(new Map(JSON.parse(localStorage.getItem('assetCNYRate'))));
            } catch (e) {
                return throwError('please get history json to local storage when debug mode on');
            }
        }
        return from(new Promise<Map<string, {}>>((resolve, reject) => {
            try {
                this.crx.getStorage('assetCNYRate', (res) => {
                    if (res) {
                        resolve(new Map(JSON.parse(res)));
                    } else {
                        resolve(new Map());
                    }
                });
            } catch (e) {
                reject('failed');
            }
        }));
    }

    public setAssetUSDRate(assetUSDRate: Map<string, {}>) {
        if (!this.check) {
            localStorage.setItem('assetUSDRate', JSON.stringify(Array.from(assetUSDRate.entries())));
            return;
        }
        try {
            this.crx.setStorage({
                assetUSDRate: JSON.stringify(Array.from(assetUSDRate.entries()))
            });
        } catch (e) {
            console.log('set assetUSDRate failed', e);
        }
    }
    public getAssetUSDRate(): Observable<Map<string, {}>> {
        if (!this.check) {
            try {
                return of(new Map(JSON.parse(localStorage.getItem('assetUSDRate'))));
            } catch (e) {
                return throwError('please get history json to local storage when debug mode on');
            }
        }
        return from(new Promise<Map<string, {}>>((resolve, reject) => {
            try {
                this.crx.getStorage('assetUSDRate', (res) => {
                    if (res) {
                        resolve(new Map(JSON.parse(res)));
                    } else {
                        resolve(new Map());
                    }
                });
            } catch (e) {
                reject('failed');
            }
        }));
    }

    public clearAssetFile() {
        if (!this.check) {
            localStorage.removeItem('assetFile');
            localStorage.removeItem('assetCNYRate');
            localStorage.removeItem('assetUSDRate');
        } else {
            this.crx.removeLocalStorage('assetFile');
            this.crx.removeStorage('assetCNYRate');
            this.crx.removeStorage('assetUSDRate');
        }
    }
    /**
     * chainId 1 Neo2 MainNet
     * chainId 2 Neo2 TestNet
     * chainId 3 N3 MainNet
     * chainId 4 N3 TestNet
     *
     * @param {string} net
     * @return {*}
     * @memberof ChromeService
     */
    public setNet(net: string) {
        this.net = net;
        if (!this.check) {
            localStorage.setItem('net', JSON.stringify(net));
            return;
        }
        try {
            this.crx.setStorage({
                net
            });
        } catch (e) {
            console.log('set net failed', e);
        }
    }

    public getNet(): Observable<string> {
        if (!this.check) {
            try {
                if (localStorage.getItem('net')) {
                    this.net = JSON.parse(localStorage.getItem('net'))
                    return of(JSON.parse(localStorage.getItem('net')));
                } else {
                    return of('MainNet'); // 默认网络
                }
            } catch (e) {
                return throwError('please get net json to local storage when debug mode on');
            }
        }
        return from(new Promise<string>((resolve, reject) => {
            try {
                this.crx.getStorage('net', (res) => {
                    this.net = res || 'MainNet';
                    resolve(res || 'MainNet');
                });
            } catch (e) {
                reject('failed');
            }
        }));
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
        if (!this.check) {
            localStorage.setItem('shouldLogin', 'false');
        } else {
            this.crx.setLocalStorage({ setLocalStorage: false });
        }
        this.setWIFArray([], 'Neo2');
        this.setWIFArray([], 'Neo3');
        this.setWalletArray([], 'Neo2');
        this.setWalletArray([], 'Neo3');
        this.setWallet(undefined);
    }

    public getHaveBackupTip() {
        if (!this.check) {
            if (sessionStorage.getItem('haveBackupTip') === 'true') {
                return true
            }
            if (sessionStorage.getItem('haveBackupTip') === 'false') {
                return false
            }
            return sessionStorage.getItem('haveBackupTip');
        } else {
            return this.crx.haveBackupTip;
        }
    }

    public setHaveBackupTip(status?: boolean) {
        const setValue = status === null
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

    public setWalletsStatus(address: string) {
        let walletsIsBackup = {};
        if (!this.check) {
            walletsIsBackup = JSON.parse(localStorage.getItem('walletsStatus')) || {};
            walletsIsBackup[address] = true;
            localStorage.setItem('walletsStatus', JSON.stringify(walletsIsBackup));
        } else {
            this.crx.getLocalStorage('walletsStatus', (res) => {
                if (res) {
                    walletsIsBackup = res || {};
                } else {
                    walletsIsBackup = {};
                }
                walletsIsBackup[address] = true;
                this.crx.setLocalStorage({
                    walletsStatus: walletsIsBackup
                });
            });
        }
    }

    public setAuthorizedAddress(authAddress) {
        if (!this.check) {
            localStorage.setItem('authAddress', JSON.stringify(authAddress));
        } else {
            this.crx.setStorage({
                authAddress: authAddress
            });
        }
    }

    public getAuthorizedAddresses() {
        if (!this.check) {
            try {
                const authAddress = JSON.parse(localStorage.getItem('authAddress'));
                return of(authAddress || {});
            } catch (e) {
                return of({});
            }
        }
        return from(new Promise<object>((resolve, reject) => {
            try {
                this.crx.getStorage('authAddress', (res) => {
                    resolve(res || {});
                });
            } catch (e) {
                reject({});
            }
        }));
    }

    public getWalletStatus(address: string): Observable<boolean> {
        let walletsIsBackup = {};
        if (!this.check) {
            try {
                walletsIsBackup = JSON.parse(localStorage.getItem('walletsStatus'));
                return of(walletsIsBackup[address] || false);
            } catch (e) {
                return of(false);
            }
        }
        return from(new Promise<boolean>((resolve, reject) => {
            try {
                this.crx.getLocalStorage('walletsStatus', (res) => {
                    resolve((res && res[address]) || false);
                });
            } catch (e) {
                resolve(false);
            }
        }));
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

    public httpGet(url: string, callback: (arg0: any) => void, headers: object = null) {
        try {
            this.crx.httpGet(url, callback, headers);
        } catch (e) {
            console.log('not in crx env');
        }
    }

    public httpGetImage(url: string, callback: (arg0: any) => void, headers: object = null) {
        try {
            this.crx.httpGetImage(url, callback, headers);
        } catch (e) {
            console.log('not in crx env');
        }
    }

    public httpPost(url: string, data: any, callback: (arg0: any) => void, headers: object = null) {
        try {
            this.crx.httpPost(url, data, callback, headers);
        } catch (e) {
            console.log('not in crx env');
        }
    }

    public setInvokeArgsArray(invokeArray: Array<any>) {
        const storageName = `InvokeArgsArray`;
        if (!this.check) {
            localStorage.setItem(storageName, JSON.stringify(invokeArray));
            return;
        }
        try {
            const saveData = {};
            saveData[storageName] = invokeArray;
            this.crx.setLocalStorage(saveData);
        } catch (e) {
            console.log('set account failed', e);
        }
    }

    public getInvokeArgsArray(): Observable<Array<string>> {
        const storageName = `InvokeArgsArray`;
        if (!this.check) {
            try {
                return of(JSON.parse(localStorage.getItem(storageName)));
            } catch (e) {
                return throwError('please set wif json to local storage when debug mode on');
            }
        }
        return from(new Promise<Array<string>>((resolve, reject) => {
            try {
                this.crx.getLocalStorage(storageName, (res) => {
                    resolve(res);
                });
            } catch (e) {
                reject('failed');
            }
        }));
    }
}
