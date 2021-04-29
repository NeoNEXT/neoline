/**
 * Inject to third part pages.
 */

import {
    getStorage,
    getLocalStorage,
} from '../common/index';
import { Account, requestTarget } from '../common/data_module_neo2';
import { requestTargetN3 } from '../common/data_module_neo3';

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
            {
                getStorage('net', (res) => {
                    let network = e.data.parameter.network;
                    if (network !== 'MainNet' && network !== 'TestNet') {
                        network = res || 'MainNet';
                    }
                    e.data.parameter.network = network;
                    chrome.runtime.sendMessage(e.data, (response) => {
                        return Promise.resolve('Dummy response to keep the console quiet');
                    });
                });
                return;
            }

        case requestTargetN3.VerifyMessage:
        case requestTargetN3.SignMessage: {
            chrome.runtime.sendMessage(e.data, (response) => {
                return Promise.resolve('Dummy response to keep the console quiet');
            });
            return;
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


