/**
 * Inject to third part pages.
 */

import {
    getStorage,
    getLocalStorage
} from '../common/index';
import { ERRORS } from '../common/data_module_neo2';
import { requestTargetN3 } from '../common/data_module_neo3';
import { ChainId, RPC } from '../common/constants';
import { getNetwork } from '../common/utils';

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
    dapiN3.src = chrome.extension.getURL('dapiN3.js');
    dapiN3.onload = () => {
        dapiN3.parentNode.removeChild(dapiN3);
        console.log('NeoLineN3 configured.');
        window.postMessage({
            from: 'NeoLineN3',
            type: 'dapi_LOADED'
        }, '*');
    };
}, 0);

window.addEventListener('load', () => {
    if (window.document.body != null) {
        window.document.body.appendChild(dapiN3);
    }
})

// neo3 dapi method
window.addEventListener('message', async (e) => {
    switch (e.data.target) {
        case requestTargetN3.Provider: {
            getStorage('rateCurrency', (res) => {
                if (res === undefined) {
                    res = 'CNY';
                }
                const manifestData = chrome.runtime.getManifest();
                manifestData.extra = { currency: res, theme: '' };
                window.postMessage({
                    return: requestTargetN3.Provider,
                    data: manifestData
                }, '*');
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
        case requestTargetN3.SignMessage:
            {
                getLocalStorage('chainType', (res) => {
                    if (res === 'Neo3') {
                        getStorage('chainId', (result) => {
                            // let chainId = result || ChainId.N3TestNet;
                            let network = getNetwork(result);
                            e.data.parameter.network = network;
                            e.data.nodeUrl = RPC.Neo3[network];
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

