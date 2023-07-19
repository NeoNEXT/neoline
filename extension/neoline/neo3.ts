/**
 * Inject to third part pages.
 */

import { getStorage, getLocalStorage } from '../common/index';
import { ERRORS } from '../common/data_module_neo2';
import { requestTargetN3 } from '../common/data_module_neo3';
import { DEFAULT_N3_RPC_NETWORK } from '../common/constants';
import { getWalletType } from '../common/utils';

declare var chrome: any;

/**
 * Note:
 * that this script can unilaterally execute the logic in the third-party page,
 * but the third-party page cannot directly manipulate this script,
 * and the message method must be used.
 * Follow-up to add a dapi for the introduction of third-party pages to hide the realization of message sending and receiving.
 * You can also dynamically inject scripts into third-party pages. How to use ts for scripts injected in this way is to be considered.
 */
const dapiN3 = window.document.createElement('script');

setTimeout(() => {
  dapiN3.setAttribute('type', 'text/javascript');
  dapiN3.async = true;
  dapiN3.src = chrome.runtime.getURL('dapiN3.js');
  dapiN3.onload = () => {
    dapiN3.parentNode.removeChild(dapiN3);
    console.log('NeoLineN3 configured.');
    window.postMessage(
      {
        from: 'NeoLineN3',
        type: 'dapi_LOADED',
      },
      window.location.origin
    );
  };
}, 0);

window.addEventListener('load', () => {
  if (window.document.body != null) {
    window.document.body.appendChild(dapiN3);
  }
});

const requireConnectRequest = [
  requestTargetN3.PickAddress,
  requestTargetN3.VerifyMessage,
  requestTargetN3.Invoke,
  requestTargetN3.SignMessage,
  requestTargetN3.SignMessageWithoutSalt,
  requestTargetN3.SignTransaction,
  requestTargetN3.Send,
  requestTargetN3.InvokeMulti,
  requestTargetN3.WalletSwitchAccount,
  requestTargetN3.WalletSwitchNetwork,
  requestTargetN3.Account,
  requestTargetN3.AccountPublicKey,
];

// neo3 dapi method
window.addEventListener(
  'message',
  async (e) => {
    if (!e.data.target) return;
    getStorage('connectedWebsites', async (allWebsites) => {
      const currWallet = await getLocalStorage('wallet', () => {});
      allWebsites = allWebsites || {};
      const websites = allWebsites[currWallet?.accounts[0]?.address] || [];
      const existOrigin = websites.find((item) =>
        e.origin.includes(item.hostname)
      );
      if (
        requireConnectRequest.includes(e.data.target) &&
        (!existOrigin || (existOrigin && existOrigin.status === 'false'))
      ) {
        window.postMessage(
          {
            return: e.data.target,
            error: ERRORS.CONNECTION_DENIED,
            ID: e.data.ID,
          },
          window.location.origin
        );
        return;
      }
      switch (e.data.target) {
        case requestTargetN3.Provider: {
          getStorage('rateCurrency', (res) => {
            if (res === undefined) {
              res = 'USD';
            }
            getStorage('theme', (theme) => {
              if (res === undefined) {
                theme = 'light-theme';
              }
              const manifestData = chrome.runtime.getManifest();
              manifestData.extra = { currency: res, theme };
              window.postMessage(
                {
                  return: requestTargetN3.Provider,
                  data: manifestData,
                },
                window.location.origin
              );
            });
          });
          return;
        }
        case requestTargetN3.PickAddress:
        case requestTargetN3.AddressToScriptHash:
        case requestTargetN3.ScriptHashToAddress:
        case requestTargetN3.WalletSwitchNetwork:
        case requestTargetN3.WalletSwitchAccount: {
          chrome.runtime.sendMessage(e.data, (response) => {
            if (!chrome.runtime.lastError) {
              return Promise.resolve('Dummy response to keep the console quiet');
            }
          });
          return;
        }
        case requestTargetN3.Balance:
        case requestTargetN3.Transaction:

        case requestTargetN3.Block:
        case requestTargetN3.ApplicationLog:
        case requestTargetN3.Storage:
        case requestTargetN3.InvokeRead:
        case requestTargetN3.InvokeReadMulti:
        case requestTargetN3.Invoke:
        case requestTargetN3.InvokeMultiple:
        case requestTargetN3.Send:
        case requestTargetN3.VerifyMessage:
        case requestTargetN3.SignMessageWithoutSalt:
        case requestTargetN3.SignMessage:
        case requestTargetN3.SignTransaction: {
          getLocalStorage('chainType', async (res) => {
            let currChainType = res;
            if (!currChainType) {
              currChainType = await getWalletType();
            }
            if (currChainType === 'Neo3') {
              getLocalStorage('n3Networks', (n3Networks) => {
                getLocalStorage(
                  'n3SelectedNetworkIndex',
                  (n3SelectedNetworkIndex) => {
                    const n3Network = (n3Networks || DEFAULT_N3_RPC_NETWORK)[
                      n3SelectedNetworkIndex || 0
                    ];
                    if (!(e.data as Object).hasOwnProperty('parameter')) {
                      e.data.parameter = {};
                    }
                    let network = e.data?.parameter?.network;
                    e.data.parameter.network = network || n3Network.network;
                    e.data.nodeUrl = n3Network.rpcUrl;
                    chrome.runtime.sendMessage(e.data, (response) => {
                      if (!chrome.runtime.lastError) {
                        return Promise.resolve(
                          'Dummy response to keep the console quiet'
                          );
                      }
                    });
                  }
                );
              });
              return;
            } else {
              window.postMessage(
                {
                  return: e.data.target,
                  error: ERRORS.CHAIN_NOT_MATCH,
                  ID: e.data.ID,
                },
                window.location.origin
              );
              return;
            }
          });
        }
      }
    });
  },
  false
);
