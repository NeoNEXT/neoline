export {
    getStorage,
    httpGet,
    httpPost,
    httpGetImage,
    setStorage,
    removeStorage,
    clearStorage,
    notification
}
    from '../common';
import {
    getStorage,
    setStorage,
    notification
} from '../common';
/**
 * Background methods support.
 * Call window.NEOLineBackground to use.
 */
declare var chrome;

let currLang = 'en';
let tabCurr: any;

export function expand() {
    window.open('index.html#asset', '_blank');
}

(function init() {
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



chrome.windows.onRemoved.addListener(() => {
    chrome.tabs.query({}, (res) => {
        if (res.length === 0) { // All browsers are closed
            setStorage({
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
                getStorage('wallet', (wallet) => {
                    if (wallet.accounts[0].address !== request.fromAddress) {
                        windowCallback({
                            target: 'transferRes',
                            data: 'default'
                        });
                    } else {
                        getStorage('authorizationWebsites', (res) => {
                            if (res !== undefined && res[request.hostname] !== undefined || request.connect === 'true') {
                                window.open(`index.html#popup/notification/transfer?to_address=${request.toAddress}&asset_id=${request.assetID}&amount=${request.amount}&symbol=${request.symbol}&network=${request.network}`,
                                    '_blank', 'height=620, width=386, resizable=no, top=0, left=0');
                            } else {
                                window.open(`index.html#popup/notification/authorization?icon=${request.icon}&hostname=${request.hostname}&next=transfer&to_address=${request.toAddress}&asset_id=${request.assetID}&amount=${request.amount}&symbol=${request.symbol}&network=${request.network}`,
                                    '_blank', 'height=620, width=386, resizable=no, top=0, left=0');
                            }
                        });
                    }
                });
                sendResponse('');
                return true;
            }
        case 'authorization':
            {
                chrome.tabs.query({
                    active: true,
                    currentWindow: true
                }, (tabs) => {
                    tabCurr = tabs;
                });
                getStorage('authorizationWebsites', (res: any) => {
                    if ((res !== undefined && res[request.hostname] !== undefined) || request.connect === 'true') {
                        if (res !== undefined && res[request.hostname] !== undefined && res[request.hostname].status === 'false') {
                            notification(chrome.i18n.getMessage('rejected'), chrome.i18n.getMessage('rejectedTip'));
                            return;
                        }
                        notification(chrome.i18n.getMessage('authorized'));
                    } else {
                        window.open(`/index.html#popup/notification/authorization?icon=${request.icon}&hostname=${request.hostname}&title=${request.title}`, '_blank',
                            'height=620, width=386, resizable=no, top=0, left=0');
                    }
                });
                sendResponse('');
                return true;
            }
    }
    sendResponse('');
    return true;
});

export function windowCallback(data) {
    if (tabCurr === null || tabCurr === undefined) {
        chrome.tabs.query({
            active: true,
            currentWindow: true
        }, (tabs) => {
            tabCurr = tabs;
            chrome.tabs.sendMessage(tabCurr[0].id, data, (response) => {
                tabCurr = null;
            });
        });
    } else {
        chrome.tabs.sendMessage(tabCurr[0].id, data, (response) => {
            tabCurr = null;
        });
    }
}
