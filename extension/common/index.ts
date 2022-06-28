import { base642hex, hexstring2str } from '@cityofzion/neon-core-neo3/lib/u';
import BigNumber from 'bignumber.js';

declare var chrome: any;
export function httpGet(url, callback, headers?) {
    fetch(url, { headers })
        .then((response) => response.json())
        .then((data) => {
            callback(data);
        });
}

export function httpPostPromise(url, data) {
    return new Promise((resolve, reject) => {
        httpPost(url, data, (res) => {
            if (res && res.result) {
                resolve(res.result);
            } else if (res && res.error) {
                reject(res.error);
            } else {
                reject(res);
            }
        });
    });
}

export function httpPost(url, data, callback, headers?) {
    fetch(url, {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json;charset=UTF-8' },
        body: JSON.stringify(data),
    })
        .then((response) => response.json())
        .then((data) => {
            callback(data);
        });
}

export function getStorage(key, callback) {
    chrome.storage.sync.get([key], (result) => {
        callback(result[key]);
    });
}

export function setStorage(value) {
    chrome.storage.sync.set(value, () => {
        console.log('Set storage', value);
    });
}
export function removeStorage(key) {
    chrome.storage.sync.remove(key);
}

export function clearStorage() {
    chrome.storage.sync.clear();
}

export function getLocalStorage(key, callback): Promise<any> {
    return new Promise((resolve) => {
        chrome.storage.local.get([key], (result) => {
            callback(result[key]);
            resolve(result[key]);
        });
    });
}

export function setLocalStorage(value) {
    chrome.storage.local.set(value, () => {
        console.log('Set local storage', value);
    });
}
export function removeLocalStorage(key) {
    chrome.storage.local.remove(key);
}

export function clearLocalStorage() {
    chrome.storage.local.clear();
}

export function notification(title = '', msg = '') {
    chrome.notifications.create(null, {
        type: 'basic',
        iconUrl: '/assets/images/logo_square.png',
        title,
        message: msg,
    });
}

export async function getAssetSymbol(assetId: string, rpcUrl: string) {
    const symbolData = {
        jsonrpc: '2.0',
        id: 1,
        method: 'invokefunction',
        params: [assetId, 'symbol'],
    };
    const symbolRes: any = await httpPostPromise(rpcUrl, symbolData);
    let symbol = symbolRes.stack[0].value;
    if (symbolRes.stack) {
        if (symbolRes.stack[0].type === 'ByteArray') {
            symbol = hexstring2str(symbolRes.stack[0].value);
        }
        if (symbolRes.stack[0].type === 'ByteString') {
            symbol = hexstring2str(base642hex(symbolRes.stack[0].value));
        }
    }
    return symbol;
}

export async function getAssetDecimal(assetId: string, rpcUrl: string) {
    const symbolData = {
        jsonrpc: '2.0',
        id: 1,
        method: 'invokefunction',
        params: [assetId, 'decimals'],
    };
    const decimalRes: any = await httpPostPromise(rpcUrl, symbolData);
    let decimal = decimalRes.stack[0].value;
    if (decimalRes.stack) {
        if (decimalRes.stack[0].type === 'Integer') {
            decimal = Number(decimalRes.stack[0].value || 0);
        }
        if (decimalRes.stack[0].type === 'ByteArray') {
            decimal = new BigNumber(
                decimalRes.stack[0].value || 0,
                16
            ).toNumber();
        }
    }
    return decimal;
}
