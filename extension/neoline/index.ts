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
  ExcludeWebsite,
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
    window.location.origin
  );
};

window.addEventListener('load', () => {
  if (
    window.document.body != null &&
    !ExcludeWebsite.find((item) => location.origin.includes(item))
  ) {
    window.document.body.appendChild(dapi);
  }
});

const requireConnectRequest = [
  requestTarget.Account,
  requestTarget.AccountPublicKey,
  requestTarget.VerifyMessage,
  requestTarget.Invoke,
  requestTarget.InvokeMulti,
  requestTarget.SignMessage,
  requestTarget.Deploy,
  requestTarget.Send,
  requestTarget.PickAddress,
  requestTarget.WalletSwitchAccount,
  requestTarget.WalletSwitchNetwork,
];

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
        /**
         * common dapi methods
         */
        case requestTarget.Provider: {
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
                  return: requestTarget.Provider,
                  data: manifestData,
                },
                window.location.origin
              );
            });
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
                    window.location.origin
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
                    window.location.origin
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
              window.location.origin
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
                data: currWallet
                  ? res[currWallet.accounts[0].address] || []
                  : [],
              },
              window.location.origin
            );
          });
          return;
        }
        case requestTarget.Connect:
        case requestTarget.Login:
        case requestTarget.AccountPublicKey:
        case requestTarget.PickAddress:
        case requestTarget.WalletSwitchNetwork:
        case requestTarget.WalletSwitchAccount: {
          chrome.runtime.sendMessage(e.data, (response) => {
            if (!chrome.runtime.lastError) {
              return Promise.resolve(
                'Dummy response to keep the console quiet'
              );
            }
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

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request != null) {
    window.postMessage(request, window.location.origin);
    sendResponse('');
    return Promise.resolve('Dummy response to keep the console quiet');
  }
});
