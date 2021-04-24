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
import { requestTarget, GetBalanceArgs, ERRORS, mainApi, EVENT, RPC } from '../common/data_module';
import { getScriptHashFromAddress, hexstring2str } from '../common/utils';

/**
 * Background methods support.
 * Call window.NeoLineBackground to use.
 */
declare var chrome;

let currLang = 'en';
let tabCurr: any;
export let password = '';

export let haveBackupTip: boolean = null;

export const version = chrome.runtime.getManifest().version;

export function expand() {
    window.open('index.html#asset', '_blank');
}
(function init() {
    setInterval(() => {
        getLocalStorage('chainType', async (chainType) => {
            getStorage('net', async (res) => {
                const chain = chainType || 'Neo2';
                const network = res || 'MainNet';
                let RPCUrl = RPC[chain][network];
                httpPost(RPCUrl, {
                    jsonrpc: '2.0',
                    method: 'getblockcount',
                    params: [],
                    id: 1
                }, async (blockHeightData) => {
                    let oldHeight = await getLocalStorage(`${chain}_${network}BlockHeight`, () => { }) || 0;
                    if (oldHeight === 0 || blockHeightData.result - oldHeight > 5) {
                        oldHeight = blockHeightData.result - 1;
                    }
                    let heightInterval = blockHeightData.result - oldHeight;
                    if (blockHeightData.err === undefined && heightInterval === 1) {
                            const setData = {};
                            setData[`${chain}_${network}BlockHeight`] = blockHeightData.result;
                            setLocalStorage(setData);
                            httpPost(RPCUrl, {
                                jsonrpc: '2.0',
                                method: 'getblock',
                                params: [blockHeightData.result - 1, 1],
                                id: 1
                            }, (blockDetail) => {
                                if (blockDetail.error === undefined) {
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
                                        return: EVENT.BLOCK_HEIGHT_CHANGED
                                    });
                                }
                            }, '*');
                    } else if (blockHeightData.err === undefined && heightInterval > 1) {
                        let timer;
                        for (let intervalIndex = 0; intervalIndex < heightInterval; intervalIndex++) {
                            timer = setTimeout(() => {
                                const setData = {};
                                setData[`${chain}_${network}BlockHeight`] = oldHeight + intervalIndex + 1;
                                setLocalStorage(setData);
                                httpPost(RPCUrl, {
                                    jsonrpc: '2.0',
                                    method: 'getblock',
                                    params: [oldHeight + 1, 1],
                                    id: 1
                                }, (blockDetail) => {
                                    if (blockDetail.error === undefined) {
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
                                            return: EVENT.BLOCK_HEIGHT_CHANGED
                                        });
                                    }
                                }, '*');
                            }, 500 * intervalIndex);
                            if (heightInterval <= 1) {
                                clearTimeout(timer);
                            }
                        }
                    }
                }, '*');
                if (chainType === 'Neo2') {
                    const txArr = await getLocalStorage(`${network}TxArr`, (temp) => { }) || [];
                    if (txArr.length === 0) {
                        return;
                    }
                    httpPost(`${mainApi}/v1/neo2/txids_valid`, { txids: txArr }, (txConfirmData) => {
                        if (txConfirmData.status === 'success') {
                            const txConfirms = txConfirmData.data || [];
                            txConfirms.forEach(item => {
                                const tempIndex = txArr.findIndex(e => e === item);
                                if (tempIndex >= 0) {
                                    txArr.splice(tempIndex, 1);
                                }
                                httpGet(`${mainApi}/v1/neo2/transaction/${item}`, (txDetail) => {
                                    if (txDetail.status === 'success') {
                                        windowCallback({
                                            data: {
                                                txid: item,
                                                blockHeight: txDetail.data.block_index,
                                                blockTime: txDetail.data.block_time,
                                            },
                                            return: EVENT.TRANSACTION_CONFIRMED
                                        });
                                    }
                                }, {
                                    Network: network === 'MainNet' ? 'mainnet' : 'testnet'
                                });
                            });
                        };
                        const setData = {};
                        setData[`${network}TxArr`] = txArr;
                        setLocalStorage(setData);
                    }, {
                        Network: network === 'MainNet' ? 'mainnet' : 'testnet'
                    });
                }
            });
        });
    }, 8000);

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
        case requestTarget.Connect:
        case requestTarget.AuthState:
            {
                getStorage('connectedWebsites', (res: any) => {
                    if ((res !== undefined && res[request.hostname] !== undefined) || request.connect === 'true') {
                        if (res !== undefined && res[request.hostname] !== undefined && res[request.hostname].status === 'false') {
                            notification(chrome.i18n.getMessage('rejected'), chrome.i18n.getMessage('rejectedTip'));
                            windowCallback({
                                return: requestTarget.Connect,
                                data: false
                            });
                            return;
                        }
                        windowCallback({
                            return: requestTarget.Connect,
                            data: true
                        });
                        notification(`${chrome.i18n.getMessage('from')}: ${request.hostname}`, chrome.i18n.getMessage('connectedTip'));
                    } else {
                        window.open(`/index.html#popup/notification/authorization?icon=${request.icon}&hostname=${request.hostname}&title=${request.title}`, '_blank',
                            'height=620, width=386, resizable=no, top=0, left=0');
                    }
                    sendResponse('');
                });
                return true;
            }
        case requestTarget.Login: {
            getLocalStorage('shouldLogin', res => {
                if (res === 'false' || res === false) {
                    windowCallback({
                        return: requestTarget.Login,
                        data: true
                    });
                } else {
                    window.open('/index.html#popup/login?notification=true', '_blank',
                        'height=620, width=386, resizable=no, top=0, left=0');
                }
            })
            return true
        }
    }
    getLocalStorage('chainType', async (chainType) => {
        if (chainType === 'Neo2') {
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
                                    return: requestTarget.Send,
                                    error: ERRORS.MALFORMED_INPUT,
                                    ID: request.ID
                                });
                            } else {
                                window.open(`index.html#popup/notification/transfer?${queryString}messageID=${request.ID}`,
                                    '_blank', 'height=620, width=386, resizable=no, top=0, left=0');
                            }
                        });
                        return true;
                    }
                case requestTarget.Balance: {
                    const parameter = request.parameter as GetBalanceArgs;
                    const postData = [];
                    let params = [];
                    if(parameter.params instanceof Array) {
                        params = parameter.params
                    } else {
                        params.push(parameter.params)
                    }
                    params.forEach(item => {
                        const assetIds = [];
                        const symbols = [];
                        (item.assets || []).forEach((asset: string) => {
                            try {
                                if (asset.startsWith('0x') && asset.length === 66) {
                                    asset = asset.substring(2);
                                }
                                hexstring2str(asset);
                                if(asset.length === 64) {
                                    assetIds.push(`0x${asset}`);
                                }
                                if(asset.length === 40) {
                                    assetIds.push(asset)
                                }
                            } catch (error) {
                                symbols.push(asset);
                            }
                        });
                        const pushData = {
                            address: item.address,
                            asset_ids: assetIds,
                            symbols,
                            fetch_utxo: item.fetchUTXO || false
                        };
                        postData.push(pushData);
                    });
                    httpPost(`${mainApi}/v1/neo2/address/balances`, { params: postData }, (response) => {
                        if(response.status === 'success') {
                            const returnData = response.data
                            for (const key in returnData) {
                                if (Object.prototype.hasOwnProperty.call(returnData, key)) {
                                    if (returnData[key]) {
                                        returnData[key].map(item => {
                                            item.assetID = item.asset_id;
                                            item.asset_id = undefined;
                                            return item;
                                        })
                                    }
                                }
                            }
                            windowCallback({
                                return: requestTarget.Balance,
                                data: returnData,
                                ID: request.ID,
                                error: null
                            });
                            sendResponse('');
                        } else {
                            windowCallback({
                                return: requestTarget.Balance,
                                data: null,
                                ID: request.ID,
                                error: ERRORS.RPC_ERROR
                            });
                            sendResponse('');
                        }
                    }, {
                        Network: parameter.network === 'MainNet' ? 'mainnet' : 'testnet'
                    });
                    return;
                }
                case requestTarget.InvokeRead: {
                    const args = request.parameter[2];
                    args.forEach((item, index) => {
                        if (item.type === 'Address') {
                            args[index] = {
                                type: 'Hash160',
                                value: getScriptHashFromAddress(item.value)
                            }
                        } else if (item.type === 'Boolean') {
                            if (typeof item.value === 'string') {
                                if ((item.value && item.value.toLowerCase()) === 'true') {
                                    args[index] = {
                                        type: 'Boolean',
                                        value: true
                                    }
                                } else if (item.value && item.value.toLowerCase() === 'false') {
                                    args[index] = {
                                        type: 'Boolean',
                                        value: false
                                    }
                                } else {
                                    chrome.windowCallback({
                                        error: ERRORS.MALFORMED_INPUT,
                                        return: requestTarget.InvokeRead,
                                        ID: request.ID
                                    });
                                    window.close();
                                }
                            }
                        }
                    });
                    request.parameter[2] = args;
                    const returnRes = { data: {}, ID: request.ID, return: requestTarget.InvokeRead, error: null };
                    httpPost(`${request.network}`, {
                        jsonrpc: '2.0',
                        method: 'invokefunction',
                        params: request.parameter,
                        id: 3
                    }, (res) => {
                        res.return = requestTarget.InvokeRead;
                        if (!res.error) {
                            returnRes.data = {
                                script: res.result.script,
                                state: res.result.state,
                                gas_consumed: res.result.gas_consumed,
                                stack: res.result.stack
                            };
                        } else {
                            returnRes.error = ERRORS.RPC_ERROR;
                        }
                        windowCallback(returnRes);
                        sendResponse('');
                    }, null);
                    return;
                }
                case requestTarget.InvokeReadMulti: {
                    try {
                        const requestData = request.parameter;
                        requestData.invokeReadArgs.forEach((invokeReadItem: any, index) => {
                            invokeReadItem.args.forEach((item, itemIndex) => {
                                if (item.type === 'Address') {
                                    invokeReadItem.args[itemIndex] = {
                                        type: 'Hash160',
                                        value: getScriptHashFromAddress(item.value)
                                    }
                                } else if (item.type === 'Boolean') {
                                    if (typeof item.value === 'string') {
                                        if ((item.value && item.value.toLowerCase()) === 'true') {
                                            invokeReadItem.args[itemIndex] = {
                                                type: 'Boolean',
                                                value: true
                                            }
                                        } else if (item.value && item.value.toLowerCase() === 'false') {
                                            invokeReadItem.args[itemIndex] = {
                                                type: 'Boolean',
                                                value: false
                                            }
                                        } else {
                                            chrome.windowCallback({
                                                error: ERRORS.MALFORMED_INPUT,
                                                return: requestTarget.InvokeReadMulti,
                                                ID: request.ID
                                            });
                                            window.close();
                                        }
                                    }
                                }
                            });
                            requestData.invokeReadArgs[index] = [invokeReadItem.scriptHash,invokeReadItem.operation, invokeReadItem.args];
                        })
                        const returnRes = { data: [], ID: request.ID, return: requestTarget.InvokeReadMulti, error: null };
                        let requestCount = 0;
                        requestData.invokeReadArgs.forEach(item => {
                            httpPost(`${request.network}`, {
                                jsonrpc: '2.0',
                                method: 'invokefunction',
                                params: item,
                                id: 3
                            }, (res) => {
                                requestCount ++;
                                if (!res.error) {
                                    returnRes.data.push({
                                        script: res.result.script,
                                        state: res.result.state,
                                        gas_consumed: res.result.gas_consumed,
                                        stack: res.result.stack
                                    });
                                } else {
                                    returnRes.error = ERRORS.RPC_ERROR;
                                }
                                if(requestCount === requestData.invokeReadArgs.length) {
                                    windowCallback(returnRes);
                                    sendResponse('');
                                }
                            }, null);
                        })
                    } catch (error) {
                        windowCallback({ data: [], ID: request.ID, return: requestTarget.InvokeReadMulti, error: ERRORS.RPC_ERROR });
                        sendResponse('');
                    }
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
                                    key === 'assetIntentOverrides' || key === 'txHashAttributes' || key === 'extra_witness' ?
                                    JSON.stringify(params[key]) : params[key];
                                queryString += `${key}=${value}&`;
                            }
                        }
                        window.open(`index.html#popup/notification/invoke?${queryString}messageID=${request.ID}`,
                            '_blank', 'height=620, width=386, resizable=no, top=0, left=0');
                    });
                    // sendResponse('');
                    return;
                }
                case requestTarget.InvokeMulti: {
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
                                const value = key === 'invokeArgs' || key === 'assetIntentOverrides' || key === 'attachedAssets' ||
                                    key === 'assetIntentOverrides' || key === 'txHashAttributes' || key === 'extra_witness' ?
                                    JSON.stringify(params[key]) : params[key];
                                queryString += `${key}=${value}&`;
                            }
                        }
                        window.open(`index.html#popup/notification/invoke-multi?${queryString}messageID=${request.ID}`,
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
                        window.open(`index.html#popup/notification/deploy?${queryString}messageID=${request.ID}`,
                            '_blank', 'height=620, width=386, resizable=no, top=0, left=0');
                    });

                    sendResponse('');
                    return;
                }
            }
        } else if (chainType === 'Neo3') {
            switch (request.target) {
                case requestTarget.Send: {
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
                                    return: requestTarget.Send,
                                    error: ERRORS.MALFORMED_INPUT,
                                    ID: request.ID
                                });
                            } else {
                                window.open(`index.html#popup/notification/neo3Transfer?${queryString}messageID=${request.ID}`,
                                    '_blank', 'height=620, width=386, resizable=no, top=0, left=0');
                            }
                        });
                        return true;
                }
                case requestTarget.Neo3Balance: {
                    const parameter = request.parameter;
                    httpGet(`${mainApi}/v1/neo3/address/assets?address=${parameter.address}`, (response) => {
                        if (response.status === 'success') {
                            const returnData = response.data;
                            windowCallback({
                                return: requestTarget.Neo3Balance,
                                ID: request.ID,
                                data: returnData,
                                error: null
                            });
                        } else {
                            windowCallback({
                                return: requestTarget.Neo3Balance,
                                data: null,
                                ID: request.ID,
                                error: ERRORS.RPC_ERROR
                            });
                        }
                        sendResponse('');
                    }, {
                        Network: parameter.network === 'MainNet' ? 'mainnet' : 'testnet'
                    });
                    return;
                }
                case requestTarget.InvokeRead: {
                    const args = request.parameter[2];
                    args.forEach((item, index) => {
                        if (item.type === 'Address') {
                            args[index] = {
                                type: 'Hash160',
                                value: getScriptHashFromAddress(item.value)
                            }
                        } else if (item.type === 'Boolean') {
                            if (typeof item.value === 'string') {
                                if ((item.value && item.value.toLowerCase()) === 'true') {
                                    args[index] = {
                                        type: 'Boolean',
                                        value: true
                                    }
                                } else if (item.value && item.value.toLowerCase() === 'false') {
                                    args[index] = {
                                        type: 'Boolean',
                                        value: false
                                    }
                                } else {
                                    chrome.windowCallback({
                                        error: ERRORS.MALFORMED_INPUT,
                                        return: requestTarget.InvokeRead,
                                        ID: request.ID
                                    });
                                    window.close();
                                }
                            }
                        }
                    });
                    request.parameter[2] = args;
                    const returnRes = { data: {}, ID: request.ID, return: requestTarget.InvokeRead, error: null };
                    httpPost(`${request.network}`, {
                        jsonrpc: '2.0',
                        method: 'invokefunction',
                        params: request.parameter,
                        id: 3
                    }, (res) => {
                        res.return = requestTarget.InvokeRead;
                        if (!res.error) {
                            returnRes.data = {
                                script: res.result.script,
                                state: res.result.state,
                                gas_consumed: res.result.gas_consumed,
                                stack: res.result.stack
                            };
                        } else {
                            returnRes.error = ERRORS.RPC_ERROR;
                        }
                        windowCallback(returnRes);
                        sendResponse('');
                    }, null);
                    return;
                }
                case requestTarget.InvokeReadMulti: {
                    if (!(request.parameter.signers instanceof Array)) {
                        return new Promise((_, reject) => {
                            reject(ERRORS.MALFORMED_INPUT);
                        });
                    }
                    getStorage('net', async (net) => {
                        try {
                            const requestData = request.parameter;
                            requestData.invokeReadArgs.forEach((invokeReadItem: any, index) => {
                                invokeReadItem.args.forEach((item, itemIndex) => {
                                    if (item === null || typeof item !== 'object') {
                                        return;
                                    } else if (item.type === 'Address') {
                                        invokeReadItem.args[itemIndex] = {
                                            type: 'Hash160',
                                            value: getScriptHashFromAddress(item.value)
                                        }
                                    } else if (item.type === 'Boolean') {
                                        if (typeof item.value === 'string') {
                                            if ((item.value && item.value.toLowerCase()) === 'true') {
                                                invokeReadItem.args[itemIndex] = {
                                                    type: 'Boolean',
                                                    value: true
                                                }
                                            } else if (item.value && item.value.toLowerCase() === 'false') {
                                                invokeReadItem.args[itemIndex] = {
                                                    type: 'Boolean',
                                                    value: false
                                                }
                                            } else {
                                                chrome.windowCallback({
                                                    error: ERRORS.MALFORMED_INPUT,
                                                    return: requestTarget.InvokeReadMulti,
                                                    ID: request.ID
                                                });
                                                window.close();
                                            }
                                        }
                                    }
                                });
                                requestData.invokeReadArgs[index] = [invokeReadItem.scriptHash,invokeReadItem.operation, invokeReadItem.args, requestData.signers];
                            });
                            const returnRes = { data: [], ID: request.ID, return: requestTarget.InvokeReadMulti, error: null };
                            let requestCount = 0;
                            const nodeUrl = RPC[chainType][net];
                            requestData.invokeReadArgs.forEach(item => {
                                httpPost(nodeUrl, {
                                    jsonrpc: '2.0',
                                    method: 'invokefunction',
                                    params: item,
                                    id: 3
                                }, (res) => {
                                    requestCount ++;
                                    if (!res.error) {
                                        returnRes.data.push({
                                            script: res.result.script,
                                            state: res.result.state,
                                            gas_consumed: res.result.gas_consumed,
                                            stack: res.result.stack
                                        });
                                    } else {
                                        returnRes.error = ERRORS.RPC_ERROR;
                                    }
                                    if(requestCount === requestData.invokeReadArgs.length) {
                                        windowCallback(returnRes);
                                        sendResponse('');
                                    }
                                }, null);
                            })
                        } catch (error) {
                            console.log(error)
                            windowCallback({ data: [], ID: request.ID, return: requestTarget.InvokeReadMulti, error: ERRORS.RPC_ERROR });
                            sendResponse('');
                        };
                    })
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
                                const value = key === 'args' || key === 'signers' || key === 'txHashAttributes' ?
                                    JSON.stringify(params[key]) : params[key];
                                queryString += `${key}=${value}&`;
                            }
                        }
                        window.open(`index.html#popup/notification/neo3-invoke?${queryString}messageID=${request.ID}`,
                            '_blank', 'height=620, width=386, resizable=no, top=0, left=0');
                    });
                    // sendResponse('');
                    return;
                }
                case requestTarget.Neo3InvokeMultiple: {
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
                                const value = key === 'invokeArgs' || key === 'txHashAttributes' || key === 'signers' ?
                                JSON.stringify(params[key]) : params[key];
                                queryString += `${key}=${value}&`;
                            }
                        }
                        window.open(`index.html#popup/notification/neo3-invoke-multiple?${queryString}messageID=${request.ID}`,
                            '_blank', 'height=620, width=386, resizable=no, top=0, left=0');
                    });
                }
            }
        }
    })
    sendResponse('');
    return true;
});

export function windowCallback(data) {
    chrome.tabs.query({
    }, (tabs: any) => {
        // console.log(tabs);
        // tabCurr = tabs;
        if (tabs.length > 0) {
            tabs.forEach(item => {
                chrome.tabs.sendMessage(item.id, data, (response) => {
                    // tabCurr = null;
                });
            })
        }
    });
}
