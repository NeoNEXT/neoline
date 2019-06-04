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
    httpGet,
    setLocalStorage,
    getLocalStorage
} from '../common';
import { requestTarget, returnTarget, GetBalanceArgs, BalanceRequest, ERRORS, mainApi, testApi, EVENT } from '../common/data_module';
import { reverseHex, getScriptHashFromAddress } from '../common/utils';
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
    setInterval(() => {
        getStorage('net', async (res) => {
            const network = res || 'MainNet';
            const apiUrl = network === 'MainNet' ? mainApi : testApi;
            httpGet(`${apiUrl}/v1/getblockheight`, async (blockHeightData) => {
                const oldHeight = await getLocalStorage(`${network}BlockHeight`, () => {}) || 0;
                if (blockHeightData.bool_status && blockHeightData.result > oldHeight ) {
                    const setData = {};
                    setData[`${network}BlockHeight`] = blockHeightData.result;
                    setLocalStorage(setData);
                    httpGet(`${apiUrl}/v1/getblock?block_index=${blockHeightData.result}`, (blockDetail) => {
                        if (blockDetail.bool_status) {
                            const txStrArr = [];
                            blockDetail.result.tx.forEach(item => {
                                txStrArr.push(item.txid);
                            });
                            windowCallback({
                                data: {
                                    network,
                                    blockHeight: blockHeightData.result,
                                    blockTime: blockDetail.result.time,
                                    blockHash: blockDetail.result.hash,
                                    tx: txStrArr,
                                },
                                target: EVENT.BLOCK_HEIGHT_CHANGED
                            });
                        }

                    }, '*');
                }
            }, '*');
            const txArr = await getLocalStorage(`${network}TxArr`, (temp) => {}) || [];
            httpPost(`${apiUrl}/v1/transactions/confirms`, {txids: txArr}, (txConfirmData) => {
                if (txConfirmData.bool_status) {
                    const txConfirms = txConfirmData.result;
                    txConfirms.forEach(item => {
                        const tempIndex = txArr.findIndex(e => e === item);
                        if (tempIndex >= 0) {
                            txArr.splice(tempIndex, 1);
                        }
                        httpGet(`${apiUrl}/v1/transactions/gettransaction/${item}`, (txDetail) => {
                            if (txDetail.bool_status) {
                                windowCallback({
                                    data: {
                                        txid: txDetail.result.txID,
                                        blockHeight: txDetail.result.blockIndex,
                                        blockTime: txDetail.result.blockTime,
                                    },
                                    target: EVENT.TRANSACTION_CONFIRMED
                                });
                            }
                        }, '*');
                    });
                }
                const setData = {};
                setData[`${network}TxArr`] = txArr;
                setLocalStorage(setData);
            }, null);
        });
    }, 20000);
    if (navigator.language === 'zh-CN') {
        getStorage('lang', res => {
            if (res === undefined) {
                currLang = 'zh_CN';
                setStorage({ lang: currLang });
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
        case requestTarget.Send:
            {
                const params = request.parameter;
                let queryString = '';
                for (const key in params) {
                    if (params.hasOwnProperty(key)) {
                        const value = params[key];
                        queryString += `${key}=${value}&`;
                    }
                }
                chrome.tabs.query({
                    active: true,
                    currentWindow: true
                }, (tabs) => {
                    tabCurr = tabs;
                });
                getLocalStorage('wallet', (wallet) => {
                    if (wallet !== undefined && wallet.accounts[0].address !== params.fromAddress) {
                        windowCallback({
                            target: returnTarget.Send,
                            data: ERRORS.MALFORMED_INPUT
                        });
                    } else {
                        window.open(`index.html#popup/notification/transfer?${queryString}`,
                            '_blank', 'height=620, width=386, resizable=no, top=0, left=0');
                    }
                });
                sendResponse('');
                return true;
            }
        case requestTarget.Connect:
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
                                target: returnTarget.Connect,
                                data: false
                            });
                            return;
                        }
                        windowCallback({
                            target: returnTarget.Connect,
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
        case requestTarget.Balance: {
            const parameter = request.parameter as GetBalanceArgs;
            const postData = [];
            if (!(parameter.params as BalanceRequest[]).length) {
                const tempParams = parameter.params as BalanceRequest;
                const pushData = {
                    address: tempParams.address,
                    assets: tempParams.assets || [],
                    fetchUTXO: tempParams.fetchUTXO || false
                };
                postData.push(pushData);
            } else {
                (parameter.params as BalanceRequest[]).forEach(item => {
                    const pushData = {
                        address: item.address,
                        assets: item.assets || [],
                        fetchUTXO: item.fetchUTXO || false
                    };
                    postData.push(pushData);
                });
            }
            httpPost(`${parameter.network}/v1/getbalances`, { params: postData }, (returnData) => {
                windowCallback({
                    target: returnTarget.Balance,
                    data: returnData
                });
            }, null);
            sendResponse('');
            return;
        }
        case requestTarget.InvokeRead: {
            const args = request.parameter[2];
            args.forEach((item, index) => {
                if (item.type === 'Address') {
                    args[index] = {
                        type: 5,
                        value: reverseHex(getScriptHashFromAddress(item.value))
                    };
                }
            });
            request.parameter[2] = args;
            httpPost(`${request.network}/v1/transactions/invokeread`, { params: request.parameter }, (res) => {
                res.target = returnTarget.InvokeRead;
                windowCallback(res);
            }, null);
            sendResponse('');
            return;
        }
        case requestTarget.Invoke: {
            chrome.tabs.query({
                active: true,
                currentWindow: true
            }, (tabs) => {
                tabCurr = tabs;
            });
            const params = request.parameter;
            getStorage('connectedWebsites', (res) => {
                let queryString = '';
                for (const key in params) {
                    if (params.hasOwnProperty(key)) {
                        const value = key === 'args' || key === 'assetIntentOverrides' || key === 'attachedAssets' ||
                            key === 'assetIntentOverrides' || key === 'txHashAttributes' ?
                            JSON.stringify(params[key]) : params[key];
                        queryString += `${key}=${value}&`;
                    }
                }
                window.open(`index.html#popup/notification/invoke?${queryString}`,
                    '_blank', 'height=620, width=386, resizable=no, top=0, left=0');
            });
            sendResponse('');
            return;
        }

        case requestTarget.Deploy: {
            chrome.tabs.query({
                active: true,
                currentWindow: true
            }, (tabs) => {
                tabCurr = tabs;
            });
            const params = request.parameter;
            getStorage('connectedWebsites', (res) => {
                let queryString = '';
                for (const key in params) {
                    if (params.hasOwnProperty(key)) {
                        const value = params[key];
                        queryString += `${key}=${value}&`;
                    }
                }
                console.log(`index.html#popup/notification/deploy?${queryString}`);
                window.open(`index.html#popup/notification/deploy?${queryString}`,
                    '_blank', 'height=620, width=386, resizable=no, top=0, left=0');
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
