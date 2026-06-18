import { enc } from 'crypto-js';
import BigNumber from 'bignumber.js';
import { reverseHex } from './utils';

declare var chrome: any;

/**
 * 内容脚本会在扩展被重新加载/更新/禁用后继续存活于已打开的页面（成为“孤儿”），
 * 此时任何 chrome.* 调用都会抛出 "Extension context invalidated."。
 * 调用 chrome.storage 前先用此函数判断 context 是否仍有效。
 *
 * The content script keeps running in already-open pages after the extension
 * is reloaded/updated/disabled, where any chrome.* call throws
 * "Extension context invalidated.". Guard chrome.storage calls with this.
 */
function isExtensionContextValid(): boolean {
  try {
    return (
      typeof chrome !== 'undefined' &&
      !!chrome.runtime &&
      typeof chrome.runtime.id === 'string'
    );
  } catch {
    return false;
  }
}

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
      if (res && res.hasOwnProperty('result')) {
        resolve(res.result);
      } else if (res && res.hasOwnProperty('error')) {
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
  if (!isExtensionContextValid()) return;
  try {
    chrome.storage.sync.get([key], (result) => {
      if (chrome.runtime.lastError) return;
      callback(result[key]);
    });
  } catch {
    // context invalidated between the guard and the call; ignore.
  }
}

export function setStorage(value) {
  chrome.storage.sync.set(value, () => {
    // console.log('Set storage', value);
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
    if (!isExtensionContextValid()) {
      resolve(undefined);
      return;
    }
    try {
      chrome.storage.local.get([key], (result) => {
        if (chrome.runtime.lastError) {
          resolve(undefined);
          return;
        }
        callback(result[key]);
        resolve(result[key]);
      });
    } catch {
      resolve(undefined);
    }
  });
}

export function setLocalStorage(value) {
  chrome.storage.local.set(value, () => {
    // console.log('Set local storage', value);
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
    // console.log('Set session storage', value);
  });
}

export function clearSessionStorage() {
  chrome.storage.session.clear();
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

export function handleNeo3StackNumberValue(result) {
  let res = '0';
  if (result.state === 'HALT' && result.stack?.[0]?.value) {
    res = result.stack[0].value;
    if (result.stack[0].type === 'Integer') {
      res = result.stack[0].value;
    }
    if (result.stack[0].type === 'ByteArray') {
      const hexStr = reverseHex(result.stack[0].value);
      res = new BigNumber(hexStr || 0, 16).toString();
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

function base642hex(input) {
  return enc.Base64.parse(input).toString(enc.Hex);
}

/**
 * Converts an ArrayBuffer to an ASCII string.
 */
function ab2str(buf) {
  return String.fromCharCode.apply(null, Array.from(new Uint8Array(buf)));
}
const hexRegex = /^([0-9A-Fa-f]{2})*$/;
/**
 * Checks if input is a hexstring. Empty string is considered a hexstring.
 */
function isHex(str) {
  try {
    return hexRegex.test(str);
  } catch {
    return false;
  }
}
/**
 * Throws an error if input is not hexstring.
 */
function ensureHex(str) {
  if (!isHex(str)) {
    throw new Error(`Expected a hexstring but got ${str}`);
  }
}
/**
 * Converts a hexstring into an arrayBuffer.
 */
function hexstring2ab(str) {
  ensureHex(str);
  if (!str.length) {
    return new Uint8Array(0);
  }
  const iters = str.length / 2;
  const result = new Uint8Array(iters);
  for (let i = 0; i < iters; i++) {
    result[i] = parseInt(str.substring(0, 2), 16);
    str = str.substring(2);
  }
  return result;
}
/**
 * Converts a hexstring to ascii string.
 */
function hexstring2str(hexstring) {
  return ab2str(hexstring2ab(hexstring));
}
