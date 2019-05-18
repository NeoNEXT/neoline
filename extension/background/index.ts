export {
    getStorage,
    httpGet,
    httpPost,
    httpGetImage,
    setStorage,
    removeStorage,
    clearStorage,
    notification,
    setLocalStorage,
    removeLocalStorage,
    clearLocalStorage,
    getLocalStorage
} from '../common';
import {
    getStorage,
    setStorage,
    notification,
    httpPost,
    setLocalStorage,
    getLocalStorage
} from '../common';
/**
 * Background methods support.
 * Call window.NEOLineBackground to use.
 */
declare var chrome;

let currLang = 'en';
let tabCurr: any;

export const version = chrome.runtime.getManifest().version;

export function expand() {
    window.open('index.html#asset', '_blank');
}

(function init() {
    if (navigator.language === 'zh-CN') {
        getStorage('lang', res => {
            if (res === undefined) {
                currLang = 'zh_CN';
                setStorage({lang: currLang});
            }
        });
    }
    chrome.webRequest.onBeforeRequest.addListener(
        (details: any) => {
            if (details.url.indexOf(chrome.runtime.getURL('/index.html') < 0)) {
                return {
                    redirectUrl: details.url.replace(chrome.runtime.getURL(''), chrome.runtime.getURL('/index.html'))
                };
            } else {
                return {
                    redirectUrl: details.url
                };
            }
        }, {
            urls: [
                chrome.runtime.getURL('')
            ],
            types: ['main_frame']
        },
        ['blocking']
    );
})();

export function setPopup(lang) {
    switch (lang) {
        case 'zh_CN':
            currLang = 'zh_CN';
            break;
        case 'en':
            currLang = 'en';
            break;
    }
}

getLocalStorage('startTime', (time) => {
    if (time === undefined) {
        setLocalStorage({
            startTime: chrome.csi().startE
        });
        setLocalStorage({
            shouldLogin: true
        });
    } else {
        if (time !== chrome.csi().startE) {
            setLocalStorage({
                shouldLogin: true
            });
            setLocalStorage({
                startTime: chrome.csi().startE
            });
        }
    }
});


chrome.windows.onRemoved.addListener(() => {
    chrome.tabs.query({}, (res) => {
        if (res.length === 0) { // All browsers are closed
            setLocalStorage({
                shouldLogin: true
            });
        }
    });
});


chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    switch (request.target) {
        case 'transfer':
            {
                chrome.tabs.query({
                    active: true,
                    currentWindow: true
                }, (tabs) => {
                    tabCurr = tabs;
                });
                getLocalStorage('wallet', (wallet) => {
                    if (wallet !== undefined && wallet.accounts[0].address !== request.fromAddress) {
                        windowCallback({
                            target: 'transferRes',
                            data: 'invalid_arguments'
                        });
                    } else {
                        getStorage('connectedWebsites', (res) => {
                            if (res !== undefined && res[request.hostname] !== undefined || request.connect === 'true') {
                                window.open(`index.html#popup/notification/transfer?to_address=${request.toAddress}&asset_id=${request.assetID}&amount=${request.amount}&symbol=${request.symbol}&network=${request.network}${request.fee !== undefined ? `&fee=${request.fee}` : ''}`,
                                    '_blank', 'height=620, width=386, resizable=no, top=0, left=0');
                            } else {
                                window.open(`index.html#popup/notification/authorization?icon=${request.icon}&hostname=${request.hostname}&next=transfer&to_address=${request.toAddress}&asset_id=${request.assetID}&amount=${request.amount}&symbol=${request.symbol}&network=${request.network}${request.fee !== undefined ? `&fee=${request.fee}` : ''}`,
                                    '_blank', 'height=620, width=386, resizable=no, top=0, left=0');
                            }
                        });
                    }
                });
                sendResponse('');
                return true;
            }
        case 'connect':
            {
                chrome.tabs.query({
                    active: true,
                    currentWindow: true
                }, (tabs) => {
                    tabCurr = tabs;
                });
                getStorage('connectedWebsites', (res: any) => {
                    if ((res !== undefined && res[request.hostname] !== undefined) || request.connect === 'true') {
                        if (res !== undefined && res[request.hostname] !== undefined && res[request.hostname].status === 'false') {
                            notification(chrome.i18n.getMessage('rejected'), chrome.i18n.getMessage('rejectedTip'));
                            windowCallback({
                                target: 'connection_rejected',
                                data: false
                            });
                            return;
                        }
                        windowCallback({
                            target: 'connected',
                            data: true
                        });
                        notification(`${chrome.i18n.getMessage('from')}: ${request.hostname}`, chrome.i18n.getMessage('connectedTip'));
                    } else {
                        window.open(`/index.html#popup/notification/authorization?icon=${request.icon}&hostname=${request.hostname}&title=${request.title}`, '_blank',
                            'height=620, width=386, resizable=no, top=0, left=0');
                    }
                });
                sendResponse('');
                return true;
            }
        case 'invokeRead': {
            httpPost(`${request.url}/v1/transactions/invokeread`, {params:  request.parameter}, (res) => {
                res.target = 'invokeReadRes';
                windowCallback(res);
            }, null);
            sendResponse('');
            return;
        }
        case 'invoke': {
            chrome.tabs.query({
                active: true,
                currentWindow: true
            }, (tabs) => {
                tabCurr = tabs;
            });
            const params = request.parameter;
            getStorage('connectedWebsites', (res) => {
                if (res !== undefined && res[request.hostname] !== undefined || request.connect === 'true') {
                    window.open(`index.html#popup/notification/invoke?script_hash=${params.scriptHash}&operation=${params.operation}&args=${JSON.stringify(params.args)}&network=${params.network}`,
                    '_blank', 'height=620, width=386, resizable=no, top=0, left=0');
                } else {
                    window.open(`index.html#popup/notification/authorization?icon=${request.icon}&hostname=${request.hostname}&next=invoke&script_hash=${params.scriptHash}&operation=${params.operation}&args=${JSON.stringify(params.args)}&network=${params.network}`,
                        '_blank', 'height=620, width=386, resizable=no, top=0, left=0');
                }
            });

            sendResponse('');
            return;
        }
    }
    sendResponse('');
    return true;
});

export function windowCallback(data) {
    if (tabCurr === null || tabCurr === undefined || tabCurr === []) {
        chrome.tabs.query({
            active: true,
            currentWindow: true
        }, (tabs) => {
            tabCurr = tabs;
            if (tabCurr.length >= 1) {
                chrome.tabs.sendMessage(tabCurr[0].id, data, (response) => {
                    // tabCurr = null;
                });
            }
        });
    } else {
        if (tabCurr.length >= 1) {
            chrome.tabs.sendMessage(tabCurr[0].id, data, (response) => {
                // tabCurr = null;
            });
        }
    }
}
