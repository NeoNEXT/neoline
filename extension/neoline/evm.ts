/**
 * Inject to third part pages.
 */

import { getLocalStorage, getStorage } from '../common/index';
import {
  ConnectedWebsitesType,
  ExcludeWebsite,
  RpcNetwork,
  STORAGE_NAME,
} from '../common/constants';
import { getWalletType } from '../common/utils';
import {
  MESSAGE_TYPE,
  NEOX_EVENT,
  requestTargetEVM,
} from '../common/data_module_evm';
import { ethErrors } from 'eth-rpc-errors';

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
    window.postMessage(
      {
        from: 'NeoLineEVM',
        type: 'dapi_LOADED',
      },
      window.location.origin
    );
    getEvmChainId();
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

// neoX dapi method
window.addEventListener(
  'message',
  async (e) => {
    if (!e.data.target) return;
    switch (e.data.target) {
      case requestTargetEVM.request: {
        getLocalStorage('chainType', async (res) => {
          let currChainType = res;
          if (!currChainType) {
            currChainType = await getWalletType();
          }
          const reqMethod = e.data.parameter.method;
          if (
            currChainType === 'NeoX' ||
            reqMethod === 'eth_chainId' ||
            reqMethod === MESSAGE_TYPE.ETH_ACCOUNTS ||
            reqMethod === MESSAGE_TYPE.ETH_REQUEST_ACCOUNTS ||
            reqMethod === MESSAGE_TYPE.SWITCH_ETHEREUM_CHAIN
          ) {
            if (
              reqMethod === MESSAGE_TYPE.ETH_REQUEST_ACCOUNTS ||
              reqMethod === MESSAGE_TYPE.ETH_ACCOUNTS
            ) {
              getAccounts(e);
              return;
            }
            chrome.runtime.sendMessage(e.data, (response) => {
              if (!chrome.runtime.lastError) {
                return Promise.resolve(
                  'Dummy response to keep the console quiet'
                );
              }
            });
            return;
          } else {
            window.postMessage(
              {
                return: e.data.target,
                error: ethErrors.provider
                  .chainDisconnected({
                    message:
                      'The Provider is not connected to the requested chain.',
                  })
                  .serialize(),
                ID: e.data.ID,
              },
              window.location.origin
            );
            return;
          }
        });
      }
    }
  },
  false
);

function getAccounts(e) {
  const data = [];
  getStorage(
    STORAGE_NAME.connectedWebsites,
    (allWebsites: ConnectedWebsitesType) => {
      Object.keys(allWebsites[location.hostname].connectedAddress).forEach(
        (address) => {
          const item = allWebsites[location.hostname].connectedAddress[address];
          if (item.chain === 'NeoX') {
            data.push(address);
          }
        }
      );
      getLocalStorage('wallet', (wallet) => {
        const currentAddress = wallet.accounts[0].address;
        const index = data.findIndex((item) => item === currentAddress);
        if (index >= 0) {
          data.splice(index, 1);
          data.unshift(currentAddress);
        }
        window.postMessage(
          {
            return: e.data.target,
            data,
            ID: e.data.ID,
          },
          window.location.origin
        );
      });
    }
  );
}

function getEvmChainId() {
  getLocalStorage(STORAGE_NAME.neoXNetworks, (networks: RpcNetwork[]) => {
    if (networks) {
      getLocalStorage(STORAGE_NAME.neoXSelectedNetworkIndex, (index) => {
        window.postMessage(
          {
            return: NEOX_EVENT.INIT_CHAIN_ID,
            data: networks[index ?? 0].chainId,
          },
          window.location.origin
        );
      });
    }
  });
}
