export {
  getStorage,
  httpGet,
  httpPost,
  setStorage,
  removeStorage,
  clearStorage,
  notification,
  setLocalStorage,
  removeLocalStorage,
  clearLocalStorage,
  getLocalStorage,
} from '../common';
import {
  getStorage,
  setStorage,
  setLocalStorage,
  getLocalStorage,
  getSessionStorage,
  removeLocalStorage,
  clearLocalStorage,
  removeStorage,
  clearStorage,
  setSessionStorage,
  clearSessionStorage,
} from '../common';
import { requestTargetEVM } from '../common/data_module_evm';
import {
  getCurrentNeo2Network,
  getCurrentNeo3Network,
  getChainType,
  listenBlock,
  waitTxs,
  resetData,
  windowCallback,
} from './tool';
import { walletHandlerMap, ethereumRPCHandler } from './handlers';
import { neoRequestHandlerMap } from './request-handlers';
import { ethErrors } from 'eth-rpc-errors';

/**
 * Background methods support.
 * Call window.NeoLineBackground to use.
 */
declare var chrome;

chrome.alarms.create({ periodInMinutes: 1 });
chrome.alarms.onAlarm.addListener(async () => {
  const { currN2Network } = await getCurrentNeo2Network();
  const { currN3Network } = await getCurrentNeo3Network();
  const chainType = await getChainType();
  setTimeout(async () => {
    await listenBlock(chainType === 'Neo2' ? currN2Network : currN3Network);
  }, 0);
  waitTxs(chainType === 'Neo2' ? currN2Network : currN3Network, chainType);
});

(function init() {
  const currentLocale = chrome.i18n.getMessage('@@ui_locale');
  const supportedLocaleLang =
    currentLocale === 'zh_CN' || currentLocale === 'ko' || currentLocale === 'ja'
      ? currentLocale
      : undefined;

  if (supportedLocaleLang) {
    getStorage('lang', (res) => {
      if (res === undefined) {
        setStorage({ lang: supportedLocaleLang });
      }
    });
  }
})();

if (chrome.runtime.onRestartRequired) {
  chrome.runtime.onRestartRequired.addListener(() => resetData());
}

chrome.runtime.onInstalled.addListener(() => resetData());

chrome.runtime.onStartup.addListener(() => resetData());

chrome.runtime.onMessage.addListener(async (request, sender, sendResponse) => {
  const { currN2Network } = await getCurrentNeo2Network();
  const { currN3Network, n3Networks } = await getCurrentNeo3Network();
  const chainType = await getChainType();

  // Extracted handlers take precedence; unmigrated targets fall through to the
  // switch below (see ./request-handlers).
  const neoRequestHandler = neoRequestHandlerMap.get(request.target);
  if (neoRequestHandler) {
    return neoRequestHandler({
      request,
      sender,
      sendResponse,
      currN2Network,
      currN3Network,
      n3Networks,
      chainType,
    });
  }

  switch (request.target) {
    case requestTargetEVM.request: {
      const { method, params, hostInfo } = request.parameter;
      const handler = walletHandlerMap.get(method);
      if (handler) {
        const { implementation } = handler;
        implementation(params, request.ID, hostInfo)
          .then((finish) => {
            if (finish) {
              windowCallback({
                data: null,
                ID: request.ID,
                return: requestTargetEVM.request,
              });
            }
            sendResponse('');
          })
          .catch((error) => {
            windowCallback({
              data: null,
              ID: request.ID,
              return: requestTargetEVM.request,
              error:
                typeof error.serialize === 'function'
                  ? error.serialize()
                  : ethErrors.rpc.internal().serialize(),
            });
            sendResponse('');
          });
      } else {
        ethereumRPCHandler(request.parameter, request.ID, sender, hostInfo)
          .then((data) => {
            windowCallback({
              data,
              error: null,
              ID: request.ID,
              return: requestTargetEVM.request,
            });
            sendResponse('');
          })
          .catch((error) => {
            windowCallback({
              data: null,
              ID: request.ID,
              return: requestTargetEVM.request,
              error:
                typeof error.serialize === 'function'
                  ? error.serialize()
                  : ethErrors.rpc.internal().serialize(),
            });
            sendResponse('');
          });
      }
      return;
    }
  }
  return true;
});

//#region storage message from popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  switch (request.type) {
    case 'localStorage':
      switch (request.method) {
        case 'get':
          getLocalStorage(request.data, (result) => {
            sendResponse(result);
          });
          return true;
        case 'set':
          setLocalStorage(request.data);
          sendResponse('');
          return true;
        case 'remove':
          removeLocalStorage(request.data);
          sendResponse('');
          return true;
        case 'clear':
          clearLocalStorage();
          sendResponse('');
          return true;
      }
      break;
    case 'syncStorage':
      switch (request.method) {
        case 'get':
          getStorage(request.data, (result) => {
            sendResponse(result);
          });
          return true;
        case 'set':
          setStorage(request.data);
          sendResponse('');
          return true;
        case 'remove':
          removeStorage(request.data);
          sendResponse('');
          return true;
        case 'clear':
          clearStorage();
          sendResponse('');
          return true;
      }
      break;
    case 'sessionStorage':
      switch (request.method) {
        case 'get':
          getSessionStorage(request.data, (result) => {
            sendResponse(result);
          });
          return true;
        case 'set':
          setSessionStorage(request.data);
          sendResponse('');
          return true;
        case 'clear':
          clearSessionStorage();
          sendResponse('');
          return true;
      }
      break;
  }
});
//#endregion

chrome.notifications.onClicked.addListener((id: string) => {
  chrome.windows.create({
    url: id,
    focused: true,
    type: 'normal',
  });
});
