/**
 * Inject to third part pages.
 */

import {
    getStorage,
    getLocalStorage,
} from '../common/index';
import { requestTarget, Account, ERRORS } from '../common/data_module_neo2';
import { getNetwork, getWalletType } from '../common/utils';

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
dapi.src = chrome.extension.getURL('dapi.js');
dapi.onload = () => {
    dapi.parentNode.removeChild(dapi);
    console.log('NeoLine configured.');
    window.postMessage({
        from: 'NeoLine',
        type: 'dapi_LOADED'
    }, '*');
};

window.addEventListener('load', () => {
    if (window.document.body != null) {
        window.document.body.appendChild(dapi);
    }
});

window.addEventListener('message', async (e) => {
    switch (e.data.target) {
        /**
         * common dapi methods
         */
        case requestTarget.Provider: {
            getStorage('rateCurrency', (res) => {
                if (res === undefined) {
                    res = 'CNY';
                }
                const manifestData = chrome.runtime.getManifest();
                manifestData.extra = { currency: res, theme: '' };
                window.postMessage({
                    return: requestTarget.Provider,
                    data: manifestData
                }, '*');
            });
            return;
        }
        case requestTarget.Networks: {
            getStorage('net', async (res) => {
                getStorage('chainId',  (chainId) => {
                    window.postMessage({
                        return: requestTarget.Networks,
                        data: {
                            networks: ['MainNet', 'TestNet', 'N3TestNet'],
                            defaultNetwork: getNetwork(chainId) || 'MainNet',
                            chainId
                        },
                        ID: e.data.ID
                    }, '*');
                });
            });
            return;
        }
        case requestTarget.Account: {
            getLocalStorage('wallet', (res: any) => {
                const data: Account = { address: '', label: '' };
                if (res !== undefined && res.accounts[0] !== undefined) {
                    data.address = res.accounts[0].address;
                    data.label = res.name;
                }
                window.postMessage({
                    return: requestTarget.Account,
                    data,
                    ID: e.data.ID
                }, '*');
            });
            return;
        }
        case requestTarget.AuthState: {
            getStorage('connectedWebsites', async (res) => {
                const walletArr = await getLocalStorage('walletArr', () => { });
                const currWallet = await getLocalStorage('wallet', () => { });
                res = res || {};
                window.postMessage({
                    return: requestTarget.AuthState,
                    data: currWallet ? res[currWallet.accounts[0].address] || [] : []
                }, '*');
            });
            return;
        }
        case requestTarget.Connect: {
            chrome.runtime.sendMessage(e.data, (response) => {
                return Promise.resolve('Dummy response to keep the console quiet');
            });
            return
        }
        case requestTarget.Login: {
            getLocalStorage('shouldLogin', res => {
                if (res === true || res === 'true') {
                    chrome.runtime.sendMessage(e.data, (response) => {
                        return Promise.resolve('Dummy response to keep the console quiet');
                    });
                } else {
                    window.postMessage({
                        return: requestTarget.Login,
                        data: true
                    }, '*');
                }
            })
            break;
        }
        case requestTarget.AccountPublicKey: {
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
        case requestTarget.SignMessage:
            {
                getLocalStorage('chainType', async (res) => {
                    let currChainType = res;
                    if (!currChainType) {
                        currChainType = await getWalletType();
                    };
                    if (currChainType === 'Neo2') {
                        getStorage('net', (result: string) => {
                            let network = e.data.parameter.network;
                            if (network !== 'MainNet' && network !== 'TestNet') {
                                network = result || 'MainNet';
                            }
                            e.data.parameter.network = network;
                            chrome.runtime.sendMessage(e.data, (response) => {
                                return Promise.resolve('Dummy response to keep the console quiet');
                            });
                        });
                        return;
                    } else {
                        window.postMessage({
                            return: e.data.target,
                            error: ERRORS.CHAIN_NOT_MATCH,
                            ID: e.data.ID
                        }, '*');
                        return;
                    }

                });
            }
    }
}, false);

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request != null) {
        window.postMessage(request, '*');
        sendResponse('');
        return Promise.resolve('Dummy response to keep the console quiet');
    }
});



