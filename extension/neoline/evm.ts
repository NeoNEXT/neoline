/**
 * Inject to third part pages.
 */

import { getStorage, getLocalStorage } from '../common/index';
import { ERRORS } from '../common/data_module_neo2';
import { DEFAULT_NEOX_RPC_NETWORK, ExcludeWebsite } from '../common/constants';
import { getWalletType } from '../common/utils';
import { requestTargetEVM } from '../common/data_module_evm';

declare var chrome: any;

/**
 * Note:
 * that this script can unilaterally execute the logic in the third-party page,
 * but the third-party page cannot directly manipulate this script,
 * and the message method must be used.
 * Follow-up to add a dapi for the introduction of third-party pages to hide the realization of message sending and receiving.
 * You can also dynamically inject scripts into third-party pages. How to use ts for scripts injected in this way is to be considered.
 */
const dapiEVM = window.document.createElement('script');

setTimeout(() => {
  dapiEVM.setAttribute('type', 'text/javascript');
  dapiEVM.async = true;
  dapiEVM.src = chrome.runtime.getURL('dapiEVM.js');
  dapiEVM.onload = () => {
    dapiEVM.parentNode.removeChild(dapiEVM);
    console.log('NeoLine EVM configured.');
    window.postMessage(
      {
        from: 'NeoLineEVM',
        type: 'dapi_LOADED',
      },
      window.location.origin
    );
  };
}, 0);

window.addEventListener('load', () => {
  if (
    window.document.body != null &&
    !ExcludeWebsite.find((item) => location.origin.includes(item))
  ) {
    window.document.body.appendChild(dapiEVM);
  }
});

const requireConnectRequest = [requestTargetEVM.request];

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
        case requestTargetEVM.request: {
          getLocalStorage('chainType', async (res) => {
            let currChainType = res;
            if (!currChainType) {
              currChainType = await getWalletType();
            }
            if (currChainType === 'NeoX') {
              getLocalStorage('neoXNetworks', (neoXNetworks) => {
                getLocalStorage(
                  'neoXSelectedNetworkIndex',
                  (neoXSelectedNetworkIndex) => {
                    const neoXNetwork = (neoXNetworks ||
                      DEFAULT_NEOX_RPC_NETWORK)[neoXSelectedNetworkIndex || 0];
                    if (!(e.data as Object).hasOwnProperty('parameter')) {
                      e.data.parameter = {};
                    }
                    let network = e.data?.parameter?.network;
                    e.data.parameter.network = network || neoXNetwork.network;
                    e.data.nodeUrl = neoXNetwork.rpcUrl;
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
