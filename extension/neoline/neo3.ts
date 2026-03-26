/**
 * Inject to third part pages.
 */

import { getStorage, getLocalStorage } from '../common/index';
import { ERRORS } from '../common/data_module_neo2';
import { requestTargetN3, EVENT as EVENT_N3 } from '../common/data_module_neo3';
import { Account } from '../common/data_module_neo3_v2';
import {
  ConnectedWebsitesType,
  DEFAULT_N3_RPC_NETWORK,
  ExcludeWebsite,
  STORAGE_NAME,
} from '../common/constants';
import { getWalletType } from '../common/utils';
import { wallet as wallet3 } from '@cityofzion/neon-core-neo3';

declare var chrome: any;

/**
 * Note:
 * that this script can unilaterally execute the logic in the third-party page,
 * but the third-party page cannot directly manipulate this script,
 * and the message method must be used.
 * Follow-up to add a dapi for the introduction of third-party pages to hide the realization of message sending and receiving.
 * You can also dynamically inject scripts into third-party pages. How to use ts for scripts injected in this way is to be considered.
 */
function injectScript(filePath) {
  const script = document.createElement('script');
  script.src = chrome.runtime.getURL(filePath);
  script.type = 'text/javascript';
  script.onload = () => {
    script.remove();
    window.postMessage(
      {
        from: 'NeoLineN3',
        type: 'dapi_LOADED',
      },
      window.location.origin,
    );
    initDApi();
  };
  if (!ExcludeWebsite.find((item) => location.origin.includes(item))) {
    (document.head || document.documentElement).appendChild(script);
  }
}

injectScript('dapiN3.js');
injectScript('dapiN3V2.js');

const requireConnectRequest = [
  requestTargetN3.Invoke,
  requestTargetN3.SignMessage,
  requestTargetN3.SignMessageV2,
  requestTargetN3.SignMessageV3,
  requestTargetN3.SignMessageWithoutSalt,
  requestTargetN3.SignMessageWithoutSaltV2,
  requestTargetN3.SignTransaction,
  requestTargetN3.Send,
  requestTargetN3.InvokeMulti,
  requestTargetN3.Account,
  requestTargetN3.Accounts,
  requestTargetN3.AccountPublicKey,
];

// neo3 dapi method
window.addEventListener(
  'message',
  async (e) => {
    if (!e.data.target) return;
    getStorage(
      STORAGE_NAME.connectedWebsites,
      async (allWebsites: ConnectedWebsitesType) => {
        allWebsites = allWebsites || {};
        const hostname = new URL(e.origin).hostname;
        const connectedAddress =
          allWebsites?.[hostname]?.connectedAddress || {};
        const isConnectedToAnyNeo3Account = Object.values(connectedAddress).some((item) => item.chain === 'Neo3');
        if (
          requireConnectRequest.includes(e.data.target) &&
          !isConnectedToAnyNeo3Account
        ) {
          window.postMessage(
            {
              return: e.data.target,
              error: ERRORS.CONNECTION_DENIED,
              ID: e.data.ID,
            },
            window.location.origin,
          );
          return;
        }
        switch (e.data.target) {
          case requestTargetN3.Accounts: {
            const neo3WalletArr = await getLocalStorage(
              STORAGE_NAME['walletArr-Neo3'],
              () => {},
            );
            const currentWallet = await getLocalStorage(
              STORAGE_NAME.wallet,
              () => {},
            );
            const accounts: Account[] = [];
            Object.keys(connectedAddress).forEach((address) => {
              if (connectedAddress[address].chain === 'Neo3') {
                const wallet = neo3WalletArr.find(
                  (item) => item.accounts[0].address === address,
                );
                if (wallet) {
                  const account = {
                    address,
                    label: wallet.name,
                    hash: wallet3.getScriptHashFromAddress(address),
                    extra: {
                      isLedger: !!wallet.accounts[0].extra?.ledgerSLIP44,
                    },
                  };
                  if (currentWallet.accounts[0].address === address) {
                    accounts.unshift(account);
                  } else {
                    accounts.push(account);
                  }
                }
              }
            });

            window.postMessage(
              {
                return: requestTargetN3.Accounts,
                data: accounts,
                ID: e.data.ID,
              },
              window.location.origin,
            );
            return;
          }
          case requestTargetN3.PickAddress:
          case requestTargetN3.AddressToScriptHash:
          case requestTargetN3.ScriptHashToAddress:
          case requestTargetN3.WalletSwitchNetwork:
          case requestTargetN3.WalletSwitchAccount: {
            chrome.runtime.sendMessage(e.data, (response) => {
              if (!chrome.runtime.lastError) {
                return Promise.resolve(
                  'Dummy response to keep the console quiet',
                );
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
          case requestTargetN3.VerifyMessageV2:
          case requestTargetN3.SignMessageWithoutSalt:
          case requestTargetN3.SignMessageWithoutSaltV2:
          case requestTargetN3.SignMessage:
          case requestTargetN3.SignMessageV2:
          case requestTargetN3.SignMessageV3:
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
                            'Dummy response to keep the console quiet',
                          );
                        }
                      });
                    },
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
                  window.location.origin,
                );
                return;
              }
            });
          }
        }
      },
    );
  },
  false,
);

async function initDApi() {
  const n3Networks = await getLocalStorage(STORAGE_NAME.n3Networks, () => {});
  const n3SelectedNetworkIndex = await getLocalStorage(
    STORAGE_NAME.n3SelectedNetworkIndex,
    () => {},
  );
  const currentNetwork =
    n3Networks[n3SelectedNetworkIndex] || DEFAULT_N3_RPC_NETWORK[0];

  const allWebsites = await new Promise<ConnectedWebsitesType>((resolve) => {
    getStorage(
      STORAGE_NAME.connectedWebsites,
      (result: ConnectedWebsitesType) => resolve(result),
    );
  });
  const item = Object.values(
    allWebsites[location.hostname].connectedAddress,
  ).find((item) => item.chain === 'Neo3');

  window.postMessage(
    {
      return: EVENT_N3.INIT_DAPI,
      data: {
        connected: item !== undefined,
        currentNetwork,
      },
    },
    window.location.origin,
  );
}
