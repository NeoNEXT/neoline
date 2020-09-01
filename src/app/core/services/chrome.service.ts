import {
    Injectable
} from '@angular/core';
import {
    Observable,
    of,
    throwError,
    from,
    Subject
} from 'rxjs';
import {
    WalletJSON
} from '@cityofzion/neon-core/lib/wallet';
import {
    Balance,
    AuthorizationData,
} from '@/models/models';
import { EVENT } from '@/models/dapi';
import { loschmidtDependencies } from 'mathjs';

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
                res();
            } catch (e) {
                rej(e);
            }
        });
    }
    /**
     * Get saved account from storage.
     * 从存储中获取当前钱包
     */
    public getWallet(): Observable<WalletJSON> {
        if (!this.check) {
            try {
                return of(JSON.parse(localStorage.getItem('wallet')));
            } catch (e) {
                return throwError('please set wallet json to local storage when debug mode on');
            }
        }
        return from(new Promise<WalletJSON>((resolve, reject) => {
            try {
                this.crx.getLocalStorage('wallet', (res) => {
                    resolve(res);
                });
            } catch (e) {
                reject('failed');
            }
        }));
    }
    public getWalletArray(): Observable<Array<WalletJSON>> {
        if (!this.check) {
            try {
                return of(JSON.parse(localStorage.getItem('walletArr')));
            } catch (e) {
                return throwError('please set wallet json to local storage when debug mode on');
            }
        }
        return from(new Promise<Array<WalletJSON>>((resolve, reject) => {
            try {
                this.crx.getLocalStorage('walletArr', (res) => {
                    resolve(res);
                });
            } catch (e) {
                reject('failed');
            }
        }));
    }
    public getWIFArray(): Observable<Array<string>> {
        if (!this.check) {
            try {
                return of(JSON.parse(localStorage.getItem('WIFArr')));
            } catch (e) {
                return throwError('please set wif json to local storage when debug mode on');
            }
        }
        return from(new Promise<Array<string>>((resolve, reject) => {
            try {
                this.crx.getLocalStorage('WIFArr', (res) => {
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
    public setWallet(w: WalletJSON) {
        if (!this.check) {
            localStorage.setItem('wallet', JSON.stringify(w));
            return;
        }
        try {
            this.crx.setLocalStorage({
                wallet: w
            });
        } catch (e) {
            console.log('set account failed', e);
        }
    }
    /**
     * Set wallets, and add to history list.
     * 保存钱包数组，并记录到历史
     */
    public setWalletArray(w: Array<WalletJSON>) {
        if (!this.check) {
            localStorage.setItem('walletArr', JSON.stringify(w));
            return;
        }
        try {
            this.crx.setLocalStorage({
                walletArr: w
            });
        } catch (e) {
            console.log('set account failed', e);
        }
    }

    /**
     * Set wallets, and add to history list.
     * 保存wif数组，并记录到历史
     */
    public setWIFArray(WIFArr: Array<string>) {
        if (!this.check) {
            localStorage.setItem('WIFArr', JSON.stringify(WIFArr));
            return;
        }
        try {
            this.crx.setLocalStorage({
                WIFArr
            });
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
    public getWatch(): Observable<Balance[]> {
        if (!this.check) {
            try {
                let rs = JSON.parse(localStorage.getItem('watch')) || [];
                if (!Array.isArray(rs)) {
                    rs = [];
                }
                return of(rs);
            } catch (e) {
                return throwError('please set watch to local storage when debug mode on');
            }
        }
        return from(new Promise<Balance[]>((resolve, reject) => {
            try {
                this.crx.getStorage('watch', (res) => {
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
    public setWatch(watch: Balance[]) {
        if (!this.check) {
            localStorage.setItem('watch', JSON.stringify(watch));
            return;
        }
        try {
            this.crx.setStorage({
                watch
            });
        } catch (e) {
            console.log('set watch failed', e);
        }
    }
    public setHistory(history: string) {
        if (!this.check) {
            localStorage.setItem('history', JSON.stringify(history));
            return;
        }
        try {
            this.crx.setStorage({
                history
            });
        } catch (e) {
            console.log('set history failed', e);
        }
    }
    public getHistory(): Observable<string> {
        if (!this.check) {
            try {
                return of(JSON.parse(localStorage.getItem('history')));
            } catch (e) {
                return throwError('please get history json to local storage when debug mode on');
            }
        }
        return from(new Promise<string>((resolve, reject) => {
            try {
                this.crx.getStorage('history', (res) => {
                    resolve(res || '');
                });
            } catch (e) {
                reject('failed');
            }
        }));
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

    public setNet(net: string) {
        if (!this.check) {
            localStorage.setItem('net', JSON.stringify(net));
            return;
        }
        try {
            this.crx.setStorage({
                net
            });
            this.windowCallback({
                return: EVENT.NETWORK_CHANGED,
                data: {
                    networks: ['MainNet', 'TestNet'],
                    defaultNetwork: net === 'TestNet' ? 'TestNet' : 'MainNet'
                }
            });
        } catch (e) {
            console.log('set net failed', e);
        }
    }
    public getNet(): Observable<string> {
        if (!this.check) {
            try {
                if (localStorage.getItem('net')) {
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
}
