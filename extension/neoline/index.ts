/**
 * Inject to third part pages.
 */

import {
    httpGet,
    getStorage,
    getLocalStorage
} from '../common/index';
import { requestTarget, Account, AccountPublicKey,
    SendArgs, GetBlockInputArgs, TransactionInputArgs, ERRORS, VerifyMessageArgs, mainApi, testApi } from '../common/data_module';
import { getPrivateKeyFromWIF, getPublicKeyFromPrivateKey, sign, str2hexstring, verify, hexstring2str } from '../common/utils';
import randomBytes = require('randomBytes');



declare var chrome: any;


// 注意，此script可以单方面执行第三方页面内的逻辑，但第三方页面并不能直接操作此script，必须使用message方式
// 后续补充一个dapi让第三方页面引入，来隐藏消息收发的实现
// 也可以动态注入脚本进第三方页面，此方式注入的脚本如何使用ts待考虑

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

window.onload = () => {
    if (window.document.body != null) {
        window.document.body.appendChild(dapi);
    }
};

window.addEventListener('message', async (e) => {
    switch (e.data.target) {
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
            getStorage('net', (res) => {
                window.postMessage({
                    return: requestTarget.Networks,
                    data: {
                        networks: ['MainNet', 'TestNet'],
                        defaultNetwork: res || 'MainNet'
                    },
                    ID: e.data.ID
                }, '*');
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
        case requestTarget.AccountPublicKey: {
            const walletArr = await getLocalStorage('walletArr', () => { });
            const currWallet = await getLocalStorage('wallet', () => { });
            const WIFArr = await getLocalStorage('WIFArr', () => { });
            const data: AccountPublicKey = { address: '', publicKey: '' };
            if (currWallet !== undefined && currWallet.accounts[0] !== undefined) {
                const privateKey = getPrivateKeyFromWIF(WIFArr[walletArr.findIndex(item =>
                    item.accounts[0].address === currWallet.accounts[0].address)]
                );
                data.address = currWallet.accounts[0].address;
                data.publicKey = getPublicKeyFromPrivateKey(privateKey);
            }
            window.postMessage({
                return: requestTarget.AccountPublicKey,
                data,
                ID: e.data.ID
            }, '*');
            return;
        }
        case requestTarget.Balance: {
            getStorage('net', async (res) => {
                let apiUrl = e.data.parameter.network;
                if (apiUrl !== 'MainNet' && apiUrl !== 'TestNet') {
                    apiUrl = res || 'MainNet';
                }
                apiUrl = apiUrl === 'MainNet' ? mainApi : testApi;
                e.data.parameter.network = apiUrl;
                chrome.runtime.sendMessage(e.data, (response) => {
                    return Promise.resolve('Dummy response to keep the console quiet');
                });
            });
            return;
        }

        case requestTarget.Storage: {
            getStorage('net', async (res) => {
                let apiUrl = e.data.parameter.network;
                if (apiUrl !== 'MainNet' && apiUrl !== 'TestNet') {
                    apiUrl = res || 'MainNet';
                }
                apiUrl = apiUrl === 'MainNet' ? mainApi : testApi;
                httpGet(`${apiUrl}/v1/getstorage?script_hash=${e.data.parameter.scriptHash}&key=${str2hexstring(e.data.parameter.key)}`, (returnRes) => {
                    window.postMessage({
                        return: requestTarget.Storage,
                        data: !returnRes.bool_status ? null : ({result: hexstring2str(returnRes.result)} || null),
                        ID: e.data.ID,
                        error: returnRes.bool_status ? null : ERRORS.RPC_ERROR
                    }, '*');
                }, null);
            });
            return;
        }

        case requestTarget.InvokeRead: {
            getStorage('net', async (res) => {
                let apiUrl = e.data.parameter.network;
                const parameter = e.data.parameter;
                if (apiUrl !== 'MainNet' && apiUrl !== 'TestNet') {
                    apiUrl = res || 'MainNet';
                }
                apiUrl = apiUrl === 'MainNet' ? mainApi : testApi;
                e.data.network = apiUrl;
                e.data.parameter = [parameter.scriptHash, parameter.operation, parameter.args];
                chrome.runtime.sendMessage(e.data, (response) => {
                    return Promise.resolve('Dummy response to keep the console quiet');
                });
            });
            return;
        }

        case requestTarget.VerifyMessage: {
            const parameter = e.data.parameter as VerifyMessageArgs;
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
                window.postMessage({
                    return: requestTarget.VerifyMessage,
                    data: {
                        result: sign(serializedTransaction, privateKey) === parameter.data &&
                        publicKey === parameter.publicKey ? true : false
                    },
                    ID: e.data.ID
                }, '*');
            }
            return;
        }

        case requestTarget.Transaction: {
            getStorage('net', async (res) => {
                let apiUrl = e.data.parameter.network;
                const parameter = e.data.parameter;
                if (apiUrl !== 'MainNet' && apiUrl !== 'TestNet') {
                    apiUrl = res || 'MainNet';
                }
                apiUrl = apiUrl === 'MainNet' ? mainApi : testApi;
                e.data.network = apiUrl;
                e.data.parameter = [parameter.scriptHash, parameter.operation, parameter.args];
                httpGet(`${apiUrl}/v1/transactions/gettransaction/${parameter.txid}`, (returnRes) => {
                    window.postMessage({
                        return: requestTarget.Transaction,
                        data: !returnRes.bool_status ? null : returnRes.result,
                        ID: e.data.ID,
                        error: returnRes.bool_status ? null : ERRORS.RPC_ERROR
                    }, '*');
                }, null);
            });
            return;
        }

        case requestTarget.Block: {
            getStorage('net', async (res) => {
                let apiUrl = e.data.parameter.network;
                const parameter = e.data.parameter as GetBlockInputArgs;
                if (apiUrl !== 'MainNet' && apiUrl !== 'TestNet') {
                    apiUrl = res || 'MainNet';
                }
                apiUrl = apiUrl === 'MainNet' ? mainApi : testApi;
                httpGet(`${apiUrl}/v1/getblock?block_index=${parameter.blockHeight}`, (returnRes) => {
                    window.postMessage({
                        return: requestTarget.Block,
                        data: !returnRes.bool_status ? null : returnRes.result,
                        ID: e.data.ID,
                        error: returnRes.bool_status ? null : ERRORS.RPC_ERROR
                    }, '*');
                }, null);
            });
            return;
        }

        case requestTarget.ApplicationLog: {
            getStorage('net', async (res) => {
                let apiUrl = e.data.parameter.network;
                const parameter = e.data.parameter as TransactionInputArgs;
                if (apiUrl !== 'MainNet' && apiUrl !== 'TestNet') {
                    apiUrl = res || 'MainNet';
                }
                apiUrl = apiUrl === 'MainNet' ? mainApi : testApi;
                httpGet(`${apiUrl}/v1/getapplicationlog?txid=${parameter.txid}`, (returnRes) => {
                    window.postMessage({
                        return: requestTarget.ApplicationLog,
                        data: !returnRes.bool_status ? null : returnRes.result,
                        ID: e.data.ID,
                        error: returnRes.bool_status ? null : ERRORS.RPC_ERROR
                    }, '*');
                }, null);
            });
            return;
        }

        case requestTarget.Invoke: {
            getStorage('net', async (res) => {
                let apiUrl = e.data.parameter.network;
                if (apiUrl !== 'MainNet' && apiUrl !== 'TestNet') {
                    apiUrl = res || 'MainNet';
                }
                e.data.parameter.network = apiUrl;
                chrome.runtime.sendMessage(e.data, (response) => {
                    return Promise.resolve('Dummy response to keep the console quiet');
                });
            });
            return;
        }

        case requestTarget.InvokeMulti: {
            getStorage('net', async (res) => {
                let apiUrl = e.data.parameter.network;
                if (apiUrl !== 'MainNet' && apiUrl !== 'TestNet') {
                    apiUrl = res || 'MainNet';
                }
                e.data.parameter.network = apiUrl;
                chrome.runtime.sendMessage(e.data, (response) => {
                    return Promise.resolve('Dummy response to keep the console quiet');
                });
            });
            return;
        }

        case requestTarget.SignMessage: {
            const parameter = e.data.parameter;
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
                window.postMessage({
                    return: requestTarget.SignMessage,
                    data: {
                        publicKey,
                        data: sign(serializedTransaction, privateKey),
                        salt: randomSalt,
                        message: parameter.message
                    },
                    ID: e.data.ID
                }, '*');
            }
            return;
        }

        case requestTarget.Deploy: {
            getStorage('net', async (res) => {
                let apiUrl = e.data.parameter.network;
                if (apiUrl !== 'MainNet' && apiUrl !== 'TestNet') {
                    apiUrl = res || 'MainNet';
                }
                e.data.parameter.network = apiUrl;
                chrome.runtime.sendMessage(e.data, (response) => {
                    return Promise.resolve('Dummy response to keep the console quiet');
                });
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
                    data: currWallet ?  res[currWallet.accounts[0].address] || [] : []
                }, '*');
            });
            return;
        }

        case requestTarget.Send: {
            const parameter = e.data.parameter as SendArgs;
            const assetID = parameter.asset.length < 10 ? '' : parameter.asset;
            const symbol = parameter.asset.length >= 10 ? '' : parameter.asset;
            getStorage('net', async (res) => {
                let apiUrl = parameter.network;
                if (apiUrl !== 'MainNet' && apiUrl !== 'TestNet') {
                    apiUrl = res || 'MainNet';
                }
                e.data.parameter.network = apiUrl;
                apiUrl = apiUrl === 'MainNet' ? mainApi : testApi;
                httpGet(`${apiUrl}/v1/address/assets?address=${parameter.fromAddress}${assetID !== '' ? `&asset_id=${assetID}` : ''}${symbol !== '' ? `&symbol=${symbol}` : ''}`, (resBalance) => {
                    let enough = true; // 有足够的钱
                    let hasAsset = false;  // 该地址有这个资产
                    for (const asset of resBalance.result) {
                        if (asset.asset_id === assetID || String(asset.symbol).toLowerCase() === symbol.toLowerCase()) {
                            hasAsset = true;
                            e.data.parameter.asset = asset.asset_id;
                            if (asset.balance < parameter.amount) {
                                enough = false;
                            }
                            break;
                        }
                    }
                    if (enough && hasAsset) {
                        chrome.runtime.sendMessage(e.data, (response) => {
                            return Promise.resolve('Dummy response to keep the console quiet');
                        });
                    } else {
                        window.postMessage({
                            return: requestTarget.Send,
                            error: ERRORS.INSUFFICIENT_FUNDS,
                            ID: e.data.ID
                        }, '*');
                        return;
                    }
                }, null);
            });

            return;
        }
        case requestTarget.Connect: {
            chrome.runtime.sendMessage(e.data, (response) => {
                return Promise.resolve('Dummy response to keep the console quiet');
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


