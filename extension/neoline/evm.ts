/**
 * Inject to third part pages.
 */

import { getLocalStorage, getStorage } from '../common/index';
import { ExcludeWebsite, STORAGE_NAME } from '../common/constants';
import { getWalletType } from '../common/utils';
import { MESSAGE_TYPE, requestTargetEVM } from '../common/data_module_evm';
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

// neo3 dapi method
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
          if (currChainType === 'NeoX') {
            const reqMethod = e.data.parameter.method;
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
  getStorage(STORAGE_NAME.connectedWebsites, (allWebsites) => {
    Object.keys(allWebsites || {}).forEach((address: string) => {
      if (
        allWebsites[address].some(
          (item) =>
            item.status === 'true' && item.hostname === location.hostname
        )
      ) {
        data.push(address);
      }
    });
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
  });
}