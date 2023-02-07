/**
 * Inject to third part pages.
 */

import { getStorage, getLocalStorage } from '../common/index';
import { requestTarget, Account, ERRORS } from '../common/data_module_neo2';
import { getWalletType } from '../common/utils';
import {
  DEFAULT_N2_RPC_NETWORK,
  DEFAULT_N3_RPC_NETWORK,
  DEFAULT_NETWORKS,
} from '../common/constants';

declare var chrome: any;

/**
 * Note:
 * that this script can unilaterally execute the logic in the third-party page,
 * but the third-party page cannot directly manipulate this script,
 * and the message method must be used.
 * Follow-up to add a dapi for the introduction of third-party pages to hide the realization of message sending and receiving.
 * You can also dynamically inject scripts into third-party pages. How to use ts for scripts injected in this way is to be considered.
 */
const dapi = window.document.createElement('script');
dapi.setAttribute('type', 'text/javascript');
dapi.async = true;
dapi.src = chrome.runtime.getURL('dapi.js');
dapi.onload = () => {
  dapi.parentNode.removeChild(dapi);
  console.log('NeoLine configured.');
  window.postMessage(
    {
      from: 'NeoLine',
      type: 'dapi_LOADED',
    },
    '*'
  );
};

window.addEventListener('load', () => {
  if (window.document.body != null) {
    window.document.body.appendChild(dapi);
  }
});

window.addEventListener(
  'message',
  async (e) => {
    switch (e.data.target) {
      /**
       * common dapi methods
       */
      case requestTarget.Provider: {
        getStorage('rateCurrency', (res) => {
          if (res === undefined) {
            res = 'USD';
          }
          const manifestData = chrome.runtime.getManifest();
          manifestData.extra = { currency: res, theme: '' };
          window.postMessage(
            {
              return: requestTarget.Provider,
              data: manifestData,
            },
            '*'
          );
        });
        return;
      }
      case requestTarget.Networks: {
        getLocalStorage('chainType', async (res) => {
          if (res === 'Neo2') {
            getLocalStorage('n2Networks', (n2Networks) => {
              getLocalStorage('n2SelectedNetworkIndex', (index) => {
                const n2Network = (n2Networks || DEFAULT_N2_RPC_NETWORK)[
                  index || 0
                ];
                const returnData = {
                  chainId: n2Network.chainId,
                  networks: DEFAULT_NETWORKS,
                  defaultNetwork: n2Network.network,
                };
                window.postMessage(
                  {
                    return: requestTarget.Networks,
                    data: returnData,
                    ID: e.data.ID,
                  },
                  '*'
                );
              });
            });
          } else {
            getLocalStorage('n3Networks', (n3Networks) => {
              getLocalStorage('n3SelectedNetworkIndex', (index) => {
                const n3Network = (n3Networks || DEFAULT_N3_RPC_NETWORK)[
                  index || 0
                ];
                const returnData = {
                  chainId: n3Network.chainId,
                  networks: DEFAULT_NETWORKS,
                  defaultNetwork: n3Network.network,
                };
                window.postMessage(
                  {
                    return: requestTarget.Networks,
                    data: returnData,
                    ID: e.data.ID,
                  },
                  '*'
                );
              });
            });
          }
        });
        return;
      }
      case requestTarget.Account: {
        getLocalStorage('wallet', (res: any) => {
          const data = { address: '', label: '', isLedger: false };
          if (res !== undefined && res.accounts[0] !== undefined) {
            data.address = res.accounts[0].address;
            data.label = res.name;
            if (res.accounts[0]?.extra?.ledgerSLIP44) {
              data.isLedger = true;
            }
          }
          window.postMessage(
            {
              return: requestTarget.Account,
              data,
              ID: e.data.ID,
            },
            '*'
          );
        });
        return;
      }
      case requestTarget.AuthState: {
        getStorage('connectedWebsites', async (res) => {
          const currWallet = await getLocalStorage('wallet', () => {});
          res = res || {};
          window.postMessage(
            {
              return: requestTarget.AuthState,
              data: currWallet ? res[currWallet.accounts[0].address] || [] : [],
            },
            '*'
          );
        });
        return;
      }
      case requestTarget.Connect: {
        chrome.runtime.sendMessage(e.data, (response) => {
          return Promise.resolve('Dummy response to keep the console quiet');
        });
        return;
      }
      case requestTarget.Login: {
        chrome.runtime.sendMessage(e.data, (response) => {
          return Promise.resolve('Dummy response to keep the console quiet');
        });
        break;
      }
      case requestTarget.AccountPublicKey: {
        chrome.runtime.sendMessage(e.data, (response) => {
          return Promise.resolve('Dummy response to keep the console quiet');
        });
        return;
      }

      case requestTarget.PickAddress: {
        chrome.runtime.sendMessage(e.data, (response) => {
          return Promise.resolve('Dummy response to keep the console quiet');
        });
        return;
      }

      // neo2 dapi methods
      case requestTarget.Balance:
      case requestTarget.Transaction:
      case requestTarget.Block:
      case requestTarget.ApplicationLog:
      case requestTarget.Storage:
      case requestTarget.InvokeRead:
      case requestTarget.InvokeReadMulti:
      case requestTarget.Invoke:
      case requestTarget.InvokeMulti:
      case requestTarget.Send:
      case requestTarget.Deploy:

      case requestTarget.VerifyMessage:
      case requestTarget.SignMessage: {
        getLocalStorage('chainType', async (res) => {
          let currChainType = res;
          if (!currChainType) {
            currChainType = await getWalletType();
          }
          if (currChainType === 'Neo2') {
            getLocalStorage('n2Networks', (n2Networks) => {
              getLocalStorage(
                'n2SelectedNetworkIndex',
                (n2SelectedNetworkIndex) => {
                  const n2Network = (n2Networks || DEFAULT_N2_RPC_NETWORK)[
                    n2SelectedNetworkIndex || 0
                  ];
                  if (!(e.data as Object).hasOwnProperty('parameter')) {
                    e.data.parameter = {};
                  }
                  let network = e.data?.parameter?.network;
                  e.data.parameter.network = network || n2Network.network;
                  e.data.nodeUrl = n2Network.rpcUrl;
                  chrome.runtime.sendMessage(e.data, (response) => {
                    return Promise.resolve(
                      'Dummy response to keep the console quiet'
                    );
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
              '*'
            );
            return;
          }
        });
      }
    }
  },
  false
);

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request != null) {
    window.postMessage(request, '*');
    sendResponse('');
    return Promise.resolve('Dummy response to keep the console quiet');
  }
});
