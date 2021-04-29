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
import { mainApi, RPC, ChainType } from '../common/constants';
import {
    requestTarget, GetBalanceArgs, ERRORS,
    EVENT, AccountPublicKey, GetBlockInputArgs,
    TransactionInputArgs, GetStorageArgs, VerifyMessageArgs,
    SendArgs
} from '../common/data_module_neo2';
import {
    N3ApplicationLogArgs, N3BalanceArgs, N3GetBlockInputArgs,
    N3GetStorageArgs, N3InvokeArgs, N3InvokeMultipleArgs,
    N3InvokeReadArgs, N3InvokeReadMultiArgs, N3SendArgs , N3TransactionArgs,
    N3VerifyMessageArgs, requestTargetN3
} from '../common/data_module_neo3';
import { base64Encode, getPrivateKeyFromWIF, getPublicKeyFromPrivateKey, getScriptHashFromAddress, hexstring2str, sign, str2hexstring } from '../common/utils';
import randomBytes = require('randomBytes');

/**
 * Background methods support.
 * Call window.NeoLineBackground to use.
 */
declare var chrome;

let currLang = 'en';
let currNetWork = 'MainNet';
let currCahinId = 1;
let tabCurr: any;
let currChain = 'Neo2';
export let password = '';

export let haveBackupTip: boolean = null;

export const version = chrome.runtime.getManifest().version;

export function expand() {
    window.open('index.html#asset', '_blank');
}
(function init() {
    setInterval(async () => {
        const chainType = await getLocalStorage('chainType', () => { });
        const chainId = chainType === ChainType.Neo2 ? 1 : 1;
        let rpcUrl = RPC[chainType]['TestNet'];
        if (chainType === ChainType.Neo2) {
            rpcUrl = RPC[chainType][currNetWork];
        } else if (chainType === ChainType.Neo3) {
            rpcUrl = RPC[chainType][currNetWork];
        }
        setTimeout(async () => {
            let oldHeight = await getLocalStorage(`${chainType}_${currNetWork}BlockHeight`, () => { }) || 0;
            httpPost(rpcUrl, {
                jsonrpc: '2.0',
                method: 'getblockcount',
                params: [],
                id: chainId
            }, async (blockHeightData) => {
                if (oldHeight === 0 || blockHeightData.result - oldHeight > 5) {
                    oldHeight = blockHeightData.result - 1;
                }
                let heightInterval = blockHeightData.result - oldHeight;
                if (blockHeightData.err === undefined && heightInterval === 1) {
                    const setData = {};
                    setData[`${chainType}_${currNetWork}BlockHeight`] = blockHeightData.result;
                    setLocalStorage(setData);
                    httpPost(rpcUrl, {
                        jsonrpc: '2.0',
                        method: 'getblock',
                        params: [blockHeightData.result - 1, 1],
                        id: chainId
                    }, (blockDetail) => {
                        if (blockDetail.error === undefined) {
                            const txStrArr = [];
                            blockDetail.result.tx.forEach(item => {
                                txStrArr.push(item.txid);
                            });
                            windowCallback({
                                data: {
                                    chainId: currCahinId,
                                    currNetWork,
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
                            setData[`${chainType}_${currNetWork}BlockHeight`] = oldHeight + intervalIndex + 1;
                            setLocalStorage(setData);
                            httpPost(rpcUrl, {
                                jsonrpc: '2.0',
                                method: 'getblock',
                                params: [oldHeight + 1, 1],
                                id: chainId
                            }, (blockDetail) => {
                                if (blockDetail.error === undefined) {
                                    const txStrArr = [];
                                    blockDetail.result.tx.forEach(item => {
                                        txStrArr.push(item.txid);
                                    });
                                    windowCallback({
                                        data: {
                                            currNetWork,
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
            }, '*')
        }, 0);
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

export function setNetWork(netWork) {
    currNetWork = netWork;
}

export function setChainId(chainId) {
    currCahinId = chainId;
}

export function setChainType(chainType) {
    currChain = chainType;
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


chrome.runtime.onMessage.addListener(async (request, sender, sendResponse) => {
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
            return true;
        }
        case requestTarget.AccountPublicKey: {
            try {
                const key = currChain === 'Neo2' ? '' : `-${currChain}`;
                const walletArr = await getLocalStorage(`walletArr${key}`, () => { });
                const currWallet = await getLocalStorage('wallet', () => { });
                const WIFArr = await getLocalStorage(`WIFArr${key}`, () => { });
                const data: AccountPublicKey = { address: '', publicKey: '' };
                if (currWallet !== undefined && currWallet.accounts[0] !== undefined) {
                    const privateKey = getPrivateKeyFromWIF(WIFArr[walletArr.findIndex(item =>
                        item.accounts[0].address === currWallet.accounts[0].address)]
                    );
                    data.address = currWallet.accounts[0].address;
                    data.publicKey = getPublicKeyFromPrivateKey(privateKey);
                }
                windowCallback({
                    return: requestTarget.AccountPublicKey,
                    data,
                    ID: request.ID
                })
            } catch (error) {
                console.log(error)
                windowCallback({ data: [], ID: request.ID, return: requestTarget.AccountPublicKey, error: ERRORS.DEFAULT });
            }
            return;
        }

        case requestTarget.Balance: {
            const parameter = request.parameter as GetBalanceArgs;
            const postData = [];
            let params = [];
            if (parameter.params instanceof Array) {
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
                        if (asset.length === 64) {
                            assetIds.push(`0x${asset}`);
                        }
                        if (asset.length === 40) {
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
                if (response.status === 'success') {
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
        case requestTarget.Transaction: {
            try {
                const parameter = request.parameter;
                const url = `${mainApi}/v1/neo2/transaction/${parameter.txid}`;
                httpGet(url, (response) => {
                    if (response.status === 'success') {
                        const returnData = response.data;
                        windowCallback({
                            return: requestTarget.Transaction,
                            ID: request.ID,
                            data: returnData,
                            error: null
                        });
                    } else {
                        windowCallback({
                            return: requestTarget.Transaction,
                            data: null,
                            ID: request.ID,
                            error: ERRORS.DEFAULT
                        });
                    }
                }, {
                    Network: parameter.network === 'MainNet' ? 'mainnet' : 'testnet'
                });
            } catch (error) {
                windowCallback({
                    return: requestTarget.Transaction,
                    data: null,
                    ID: request.parameter.ID,
                    error: error
                });
            }
            sendResponse('');
            return;
        }
        case requestTarget.Block: {
            try {
                const parameter = request.parameter as GetBlockInputArgs;
                const nodeUrl = RPC.Neo2[parameter.network];
                httpPost(nodeUrl, {
                    jsonrpc: '2.0',
                    method: 'getblock',
                    params: [parameter.blockHeight, 1],
                    id: 1
                }, (response) => {
                    windowCallback({
                        return: requestTarget.Block,
                        data: response.error !== undefined ? null : response.result,
                        ID: request.ID,
                        error: response.error === undefined ? null : ERRORS.RPC_ERROR
                    });
                    sendResponse('');
                }, null);
            } catch (error) {
                windowCallback({
                    return: requestTarget.Block,
                    data: null,
                    ID: request.ID,
                    error: error
                });
                sendResponse('');
            }
            return;
        }
        case requestTarget.ApplicationLog: {
            try {
                const parameter = request.parameter as TransactionInputArgs;
                const nodeUrl = RPC.Neo2[parameter.network];
                httpPost(nodeUrl, {
                    jsonrpc: '2.0',
                    method: 'getapplicationlog',
                    params: [parameter.txid],
                    id: 1
                }, (response) => {
                    windowCallback({
                        return: requestTarget.ApplicationLog,
                        data: response.error !== undefined ? null : response.result,
                        ID: request.ID,
                        error: response.error === undefined ? null : ERRORS.RPC_ERROR
                    });
                    sendResponse('');
                }, null);
            } catch (error) {
                windowCallback({
                    return: requestTarget.ApplicationLog,
                    data: null,
                    ID: request.ID,
                    error: error
                });
                sendResponse('');
            }
            return;
        }
        case requestTarget.Storage: {
            try {
                const parameter = request.parameter as GetStorageArgs;
                const nodeUrl = RPC.Neo2[parameter.network];
                httpPost(nodeUrl, {
                    jsonrpc: '2.0',
                    method: 'getstorage',
                    params: [parameter.scriptHash, str2hexstring(parameter.key)],
                    id: 1
                }, (response) => {
                    windowCallback({
                        return: requestTarget.Storage,
                        data: response.error !== undefined ? null : ({ result: hexstring2str(response.result) } || null),
                        ID: request.ID,
                        error: response.error === undefined ? null : ERRORS.RPC_ERROR
                    });
                    sendResponse('');
                }, null);
            } catch (error) {
                windowCallback({
                    return: requestTarget.Storage,
                    data: null,
                    ID: request.ID,
                    error: error
                });
                sendResponse('');
            }
            return;
        }
        case requestTarget.InvokeRead: {
            const nodeUrl = RPC.Neo2[request.parameter.network];
            request.parameter = [request.parameter.scriptHash, request.parameter.operation, request.parameter.args];
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
                            windowCallback({
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
            httpPost(nodeUrl, {
                jsonrpc: '2.0',
                method: 'invokefunction',
                params: request.parameter,
                id: 1
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
                const nodeUrl = RPC.Neo2[request.parameter.network];
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
                                    windowCallback({
                                        error: ERRORS.MALFORMED_INPUT,
                                        return: requestTarget.InvokeReadMulti,
                                        ID: request.ID
                                    });
                                    window.close();
                                }
                            }
                        }
                    });
                    requestData.invokeReadArgs[index] = [invokeReadItem.scriptHash, invokeReadItem.operation, invokeReadItem.args];
                })
                const returnRes = { data: [], ID: request.ID, return: requestTarget.InvokeReadMulti, error: null };
                let requestCount = 0;
                requestData.invokeReadArgs.forEach(item => {
                    httpPost(nodeUrl, {
                        jsonrpc: '2.0',
                        method: 'invokefunction',
                        params: item,
                        id: 1
                    }, (res) => {
                        requestCount++;
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
                        if (requestCount === requestData.invokeReadArgs.length) {
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
        case requestTarget.VerifyMessage: {
            const parameter = request.parameter as VerifyMessageArgs;
            const walletArr = await getLocalStorage('walletArr', () => { });
            const currWallet = await getLocalStorage('wallet', () => { });
            const WIFArr = await getLocalStorage('WIFArr', () => { });
            if (currWallet !== undefined && currWallet.accounts[0] !== undefined) {
                const privateKey = getPrivateKeyFromWIF(WIFArr[walletArr.findIndex(item =>
                    item.accounts[0].address === currWallet.accounts[0].address)]
                );
                const publicKey = getPublicKeyFromPrivateKey(privateKey);
                const parameterHexString = str2hexstring(parameter.message);
                const lengthHex = (parameterHexString.length / 2).toString(16).padStart(2, '0');
                const concatenatedString = lengthHex + parameterHexString;
                const serializedTransaction = '010001f0' + concatenatedString + '0000';
                windowCallback({
                    return: requestTarget.VerifyMessage,
                    data: {
                        result: sign(serializedTransaction, privateKey) === parameter.data &&
                            publicKey === parameter.publicKey ? true : false
                    },
                    ID: request.ID
                });
            }
            sendResponse('');
            return;
        }
        case requestTarget.SignMessage: {
            const parameter = request.parameter;
            const walletArr = await getLocalStorage('walletArr', () => { });
            const currWallet = await getLocalStorage('wallet', () => { });
            const WIFArr = await getLocalStorage('WIFArr', () => { });
            if (currWallet !== undefined && currWallet.accounts[0] !== undefined) {
                const privateKey = getPrivateKeyFromWIF(WIFArr[walletArr.findIndex(item =>
                    item.accounts[0].address === currWallet.accounts[0].address)]
                );
                const randomSalt = randomBytes(16).toString('hex');
                const publicKey = getPublicKeyFromPrivateKey(privateKey);
                const parameterHexString = str2hexstring(randomSalt + parameter.message);
                const lengthHex = (parameterHexString.length / 2).toString(16).padStart(2, '0');
                const concatenatedString = lengthHex + parameterHexString;
                const serializedTransaction = '010001f0' + concatenatedString + '0000';
                windowCallback({
                    return: requestTarget.SignMessage,
                    data: {
                        publicKey,
                        data: sign(serializedTransaction, privateKey),
                        salt: randomSalt,
                        message: parameter.message
                    },
                    ID: request.ID
                });
            }
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
                            key === 'assetIntentOverrides' || key === 'txHashAttributes' || key === 'extra_witness' ?
                            JSON.stringify(params[key]) : params[key];
                        queryString += `${key}=${value}&`;
                    }
                }
                window.open(`index.html#popup/notification/invoke?${queryString}messageID=${request.ID}`,
                    '_blank', 'height=620, width=386, resizable=no, top=0, left=0');
            });
            sendResponse('');
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
        case requestTarget.Send: {
            const parameter = request.parameter as SendArgs;
            const assetID = parameter.asset.length < 10 ? '' : parameter.asset;
            const symbol = parameter.asset.length >= 10 ? '' : parameter.asset;
            httpGet(`${mainApi}/v1/neo2/address/assets?address=${parameter.fromAddress}`, (resBalance) => {
                let enough = true; // 有足够的钱
                let hasAsset = false;  // 该地址有这个资产
                const assets = (resBalance.data.asset as []).concat(resBalance.data.nep5 || []) as any;
                for (const asset of assets) {
                    if (asset.asset_id === assetID || String(asset.symbol).toLowerCase() === symbol.toLowerCase()) {
                        hasAsset = true;
                        request.parameter.asset = asset.asset_id;
                        if (Number(asset.balance) < Number(parameter.amount)) {
                            enough = false;
                        }
                        break;
                    }
                }
                if (enough && hasAsset) {
                    let queryString = '';
                    for (const key in parameter) {
                        if (parameter.hasOwnProperty(key)) {
                            const value = parameter[key];
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
                        if (wallet !== undefined && wallet.accounts[0].address !== parameter.fromAddress) {
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
                } else {
                    window.postMessage({
                        return: requestTarget.Send,
                        error: ERRORS.INSUFFICIENT_FUNDS,
                        ID: request.ID
                    }, '*');
                    return;
                }
            }, {
                Network: request.parameter.network === 'MainNet' ? 'mainnet' : 'testnet'
            });
            return true;
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

        // neo3 dapi method
        case requestTargetN3.Balance: {
            try {
                const parameter = request.parameter as N3BalanceArgs;
                httpGet(`${mainApi}/v1/neo3/address/assets?address=${parameter.address}`, (response) => {
                    if (response.status === 'success') {
                        const returnData = response.data;
                        windowCallback({
                            return: requestTargetN3.Balance,
                            ID: request.ID,
                            data: returnData,
                            error: null
                        });
                    } else {
                        windowCallback({
                            return: requestTargetN3.Balance,
                            data: null,
                            ID: request.ID,
                            error: ERRORS.DEFAULT
                        });
                    }
                    sendResponse('');
                }, {
                    Network: parameter.network === 'MainNet' ? 'mainnet' : 'testnet'
                });
            } catch (error) {
                windowCallback({
                    return: requestTargetN3.Balance,
                    data: null,
                    ID: request.parameter.ID,
                    error: ERRORS.DEFAULT
                });
                sendResponse('');
            }
            return true;
        }
        case requestTargetN3.Transaction: {
            try {
                const parameter = request.parameter as N3TransactionArgs;
                const url = `${mainApi}/v1/neo3/dapi/transaction/${parameter.txid}`;
                httpGet(url, (response) => {
                    if (response.status === 'success') {
                        const returnData = response.data;
                        windowCallback({
                            return: requestTargetN3.Transaction,
                            ID: request.ID,
                            data: returnData,
                            error: null
                        });
                    } else {
                        windowCallback({
                            return: requestTargetN3.Transaction,
                            data: null,
                            ID: request.ID,
                            error: ERRORS.DEFAULT
                        });
                    }
                    sendResponse('');
                }, {
                    Network: parameter.network === 'MainNet' ? 'mainnet' : 'testnet'
                });
            } catch (error) {
                windowCallback({
                    return: requestTargetN3.Transaction,
                    data: null,
                    ID: request.parameter.ID,
                    error: error
                });
                sendResponse('');
            }
            return;
        }
        case requestTargetN3.Block: {
            try {
                const parameter = request.parameter as N3GetBlockInputArgs;
                const nodeUrl = RPC.Neo3[parameter.network];
                httpPost(nodeUrl, {
                    jsonrpc: '2.0',
                    method: 'getblock',
                    params: [parameter.blockHeight, 1],
                    id: 1
                }, (response) => {
                    windowCallback({
                        return: requestTargetN3.Block,
                        data: response.error !== undefined ? null : response.result,
                        ID: request.ID,
                        error: response.error === undefined ? null : ERRORS.RPC_ERROR
                    });
                    sendResponse('');
                }, null);
            } catch (error) {
                windowCallback({
                    return: requestTargetN3.Block,
                    data: null,
                    ID: request.ID,
                    error: error
                });
                sendResponse('');
            }
            return;
        }
        case requestTargetN3.ApplicationLog: {
            try {
                const parameter = request.parameter as N3ApplicationLogArgs;
                const nodeUrl = RPC.Neo3[parameter.network];
                httpPost(nodeUrl, {
                    jsonrpc: '2.0',
                    method: 'getapplicationlog',
                    params: [parameter.txid],
                    id: 1
                }, (response) => {
                    windowCallback({
                        return: requestTargetN3.ApplicationLog,
                        data: response.error !== undefined ? null : response.result,
                        ID: request.ID,
                        error: response.error === undefined ? null : ERRORS.RPC_ERROR
                    });
                    sendResponse('');
                }, null);
            } catch (error) {
                windowCallback({
                    return: requestTargetN3.ApplicationLog,
                    data: null,
                    ID: request.ID,
                    error: error
                });
                sendResponse('');
            }
            return;
        }
        case requestTargetN3.Storage: {
            try {
                const parameter = request.parameter as N3GetStorageArgs;
                const nodeUrl = RPC.Neo3[parameter.network];
                httpPost(nodeUrl, {
                    jsonrpc: '2.0',
                    method: 'getstorage',
                    params: [parameter.scriptHash, base64Encode(parameter.key)],
                    id: 1
                }, (response) => {
                    windowCallback({
                        return: requestTargetN3.Storage,
                        data: response.error !== undefined ? null : ({ result: response.result } || null),
                        ID: request.ID,
                        error: response.error === undefined ? null : ERRORS.RPC_ERROR
                    });
                    sendResponse('');
                }, null);
            } catch (error) {
                windowCallback({
                    return: requestTargetN3.Storage,
                    data: null,
                    ID: request.ID,
                    error: error
                });
                sendResponse('');
            }
            return;
        }
        case requestTargetN3.InvokeRead: {
            const parameter = request.parameter as N3InvokeReadArgs;
            const nodeUrl = RPC.Neo3[parameter.network];
            request.parameter = [parameter.scriptHash, parameter.operation, parameter.args, parameter.signers];
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
                                return: requestTargetN3.InvokeRead,
                                ID: request.ID
                            });
                            window.close();
                        }
                    }
                }
            });
            request.parameter[2] = args;
            const returnRes = { data: {}, ID: request.ID, return: requestTargetN3.InvokeRead, error: null };
            httpPost(nodeUrl, {
                jsonrpc: '2.0',
                method: 'invokefunction',
                params: request.parameter,
                id: 1
            }, (res) => {
                res.return = requestTargetN3.InvokeRead;
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
        case requestTargetN3.InvokeReadMulti: {
            try {
                const requestData = request.parameter;
                const nodeUrl = RPC.Neo3[requestData.network];
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
                                        return: requestTargetN3.InvokeReadMulti,
                                        ID: request.ID
                                    });
                                    window.close();
                                }
                            }
                        }
                    });
                    requestData.invokeReadArgs[index] = [invokeReadItem.scriptHash, invokeReadItem.operation, invokeReadItem.args, requestData.signers];
                });
                const returnRes = { data: [], ID: request.ID, return: requestTargetN3.InvokeReadMulti, error: null };
                let requestCount = 0;
                requestData.invokeReadArgs.forEach(item => {
                    httpPost(nodeUrl, {
                        jsonrpc: '2.0',
                        method: 'invokefunction',
                        params: item,
                        id: 1
                    }, (res) => {
                        requestCount++;
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
                        if (requestCount === requestData.invokeReadArgs.length) {
                            windowCallback(returnRes);
                            sendResponse('');
                        }
                    }, null);
                })
            } catch (error) {
                console.log(error)
                windowCallback({ data: [], ID: request.ID, return: requestTargetN3.InvokeReadMulti, error: ERRORS.RPC_ERROR });
                sendResponse('');
            };
            return;
        }
        case requestTargetN3.VerifyMessage: {
            const parameter = request.parameter as N3VerifyMessageArgs;
            const walletArr = await getLocalStorage('walletArr-Neo3', () => { });
            const currWallet = await getLocalStorage('wallet', () => { });
            const WIFArr = await getLocalStorage('WIFArr-Neo3', () => { });
            if (currWallet !== undefined && currWallet.accounts[0] !== undefined) {
                const privateKey = getPrivateKeyFromWIF(WIFArr[walletArr.findIndex(item =>
                    item.accounts[0].address === currWallet.accounts[0].address)]
                );
                const publicKey = getPublicKeyFromPrivateKey(privateKey);
                const parameterHexString = str2hexstring(parameter.message);
                const lengthHex = (parameterHexString.length / 2).toString(16).padStart(2, '0');
                const concatenatedString = lengthHex + parameterHexString;
                const serializedTransaction = '010001f0' + concatenatedString + '0000';
                windowCallback({
                    return: requestTargetN3.VerifyMessage,
                    data: {
                        result: sign(serializedTransaction, privateKey) === parameter.data &&
                            publicKey === parameter.publicKey ? true : false
                    },
                    ID: request.ID
                });
                sendResponse('');
            }
            return;
        }
        case requestTargetN3.SignMessage: {
            const parameter = request.parameter;
            const walletArr = await getLocalStorage('walletArr-Neo3', () => { });
            const currWallet = await getLocalStorage('wallet', () => { });
            const WIFArr = await getLocalStorage('WIFArr-Neo3', () => { });
            if (currWallet !== undefined && currWallet.accounts[0] !== undefined) {
                const privateKey = getPrivateKeyFromWIF(WIFArr[walletArr.findIndex(item =>
                    item.accounts[0].address === currWallet.accounts[0].address)]
                );
                const randomSalt = randomBytes(16).toString('hex');
                const publicKey = getPublicKeyFromPrivateKey(privateKey);
                const parameterHexString = str2hexstring(randomSalt + parameter.message);
                const lengthHex = (parameterHexString.length / 2).toString(16).padStart(2, '0');
                const concatenatedString = lengthHex + parameterHexString;
                const serializedTransaction = '010001f0' + concatenatedString + '0000';
                windowCallback({
                    return: requestTargetN3.SignMessage,
                    data: {
                        publicKey,
                        data: sign(serializedTransaction, privateKey),
                        salt: randomSalt,
                        message: parameter.message
                    },
                    ID: request.ID
                });
                sendResponse('');
            }
            return;
        }
        case requestTargetN3.Invoke: {
            chrome.tabs.query({
                active: true,
                currentWindow: true
            }, (tabs) => {
                tabCurr = tabs;
            });
            const params = request.parameter as N3InvokeArgs;
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
            sendResponse('');
            return;
        }
        case requestTargetN3.InvokeMultiple: {
            chrome.tabs.query({
                active: true,
                currentWindow: true
            }, (tabs) => {
                tabCurr = tabs;
            });
            const params = request.parameter as N3InvokeMultipleArgs;
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
            sendResponse('');
            return;
        }
        case requestTargetN3.Send: {
            const parameter = request.parameter as N3SendArgs;
            const assetID = parameter.asset.length < 10 ? '' : parameter.asset;
            const symbol = parameter.asset.length >= 10 ? '' : parameter.asset;
            httpGet(`${mainApi}/v1/neo3/address/assets?address=${parameter.fromAddress}`, (resBalance) => {
                let enough = true; // 有足够的钱
                let hasAsset = false;  // 该地址有这个资产
                const assets = resBalance.data;
                for (let index = 0; index < assets.length; index++) {
                    if (assets[index].contract === assetID || String(assets[index].symbol).toLowerCase() === symbol.toLowerCase()) {
                        hasAsset = true;
                        parameter.asset = assets[index].contract;
                        if (Number(assets[index].balance) < Number(parameter.amount)) {
                            enough = false;
                        }
                        break;
                    }
                }
                if (enough && hasAsset) {
                    let queryString = '';
                    for (const key in parameter) {
                        if (parameter.hasOwnProperty(key)) {
                            const value = parameter[key];
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
                        if (wallet !== undefined && wallet.accounts[0].address !== parameter.fromAddress) {
                            windowCallback({
                                return: requestTargetN3.Send,
                                error: ERRORS.MALFORMED_INPUT,
                                ID: request.ID
                            });
                        } else {
                            window.open(`index.html#popup/notification/neo3-transfer?${queryString}messageID=${request.ID}`,
                                '_blank', 'height=620, width=386, resizable=no, top=0, left=0');
                        }
                    });
                } else {
                    window.postMessage({
                        return: requestTargetN3.Send,
                        error: ERRORS.INSUFFICIENT_FUNDS,
                        ID: request.ID
                    }, '*');
                    return;
                }
            }, {
                Network: parameter.network === 'MainNet' ? 'mainnet' : 'testnet'
            });
            return true;
        }
    }
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
