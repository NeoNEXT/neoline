import { base642hex, hexstring2str } from '@cityofzion/neon-core-neo3/lib/u';
import BigNumber from 'bignumber.js';
import { reverseHex } from './utils';

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

export function getSessionStorage(key, callback): Promise<any> {
  return new Promise((resolve) => {
    chrome.storage.session.get([key], (result) => {
      callback(result[key]);
      resolve(result[key]);
    });
  });
}

export function setSessionStorage(value) {
  chrome.storage.session.set(value, () => {
    console.log('Set session storage', value);
  });
}

export function notification(id: string, title = '', msg = '') {
  chrome.notifications.create(id, {
    type: 'basic',
    iconUrl: '/assets/logo128.png',
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
  return handleNeo3StackStringValue(symbolRes);
}

export async function getAssetDecimal(assetId: string, rpcUrl: string) {
  const symbolData = {
    jsonrpc: '2.0',
    id: 1,
    method: 'invokefunction',
    params: [assetId, 'decimals'],
  };
  const decimalRes: any = await httpPostPromise(rpcUrl, symbolData);
  return handleNeo3StackNumberValue(decimalRes);
}

export function handleNeo3StackNumberValue(result): number {
  let res = 0;
  if (result.state === 'HALT' && result.stack?.[0]?.value) {
    res = result.stack[0].value;
    if (result.stack[0].type === 'Integer') {
      res = Number(result.stack[0].value || 0);
    }
    if (result.stack[0].type === 'ByteArray') {
      const hexStr = reverseHex(result.stack[0].value);
      res = new BigNumber(hexStr || 0, 16).toNumber();
    }
  }
  return res;
}

export function handleNeo3StackStringValue(result): string {
  let res = '';
  if (result.state === 'HALT' && result.stack?.[0]?.value) {
    res = result.stack[0].value;
    if (result.stack[0].type === 'ByteArray') {
      res = hexstring2str(result.stack[0].value);
    }
    if (result.stack[0].type === 'ByteString') {
      res = hexstring2str(base642hex(result.stack[0].value));
    }
  }
  return res;
}
