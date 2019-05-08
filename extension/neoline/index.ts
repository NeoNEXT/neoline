/**
 * Inject to third part pages.
 */

import {
    httpGet,
    getStorage,
    httpPost,
    getLocalStorage
} from '../common/index';

declare var chrome: any;
const mainApi = 'https://mainnet.api.neoline.cn';
const testApi = 'https://testnet.api.neoline.cn';


// 注意，此script可以单方面执行第三方页面内的逻辑，但第三方页面并不能直接操作此script，必须使用message方式
// 后续补充一个dapi让第三方页面引入，来隐藏消息收发的实现
// 也可以动态注入脚本进第三方页面，此方式注入的脚本如何使用ts待考虑

const dapi = window.document.createElement('script');
dapi.setAttribute('type', 'text/javascript');
dapi.async = true;
dapi.src = chrome.extension.getURL('dapi.js');
dapi.onload = () => {
    dapi.parentNode.removeChild(dapi);
    console.log('NEOLine configured.');
    window.postMessage({
        from: 'NEOLine',
        type: 'dapi_LOADED'
    }, '*');
};

window.onload = () => {
    if (window.document.body != null) {
        window.document.body.appendChild(dapi);
    }
};

window.addEventListener('message', (e) => {
    switch (e.data.target) {
        case 'getWalletInfo':
            {
                getStorage('rateCurrency', (res) => {
                    if (res === undefined) {
                        res = 'CNY';
                    }
                    const manifestData = chrome.runtime.getManifest();
                    manifestData.extra = { currency: res };
                    window.postMessage({
                        target: 'walletInfoRes',
                        data: manifestData
                    }, '*');
                });
                return;
            }
        case 'getAccount':
            {
                getLocalStorage('wallet', (res: any) => {
                    let data: any;
                    if (res !== undefined && res.accounts[0] !== undefined) {
                        data = {
                            address: res.accounts[0].address,
                            alias: res.name
                        };
                    }
                    window.postMessage({
                        target: 'accountRes',
                        data
                    }, '*');
                });
                return;
            }
        case 'getBalance':
            {
                const parameter = e.data.parameter;
                const apiUrl = parameter.network === 'MainNet' ? mainApi : testApi;
                httpGet(`${apiUrl}/v1/address/assets?address=${parameter.address}${parameter.assetID !== undefined ? `&asset_id=${parameter.assetID}` : ''}`, (res) => {
                    window.postMessage({
                        target: 'balanceRes',
                        data: res
                    }, '*');
                }, null);
                return;
            }
        case 'getAuthState':
            {
                getStorage('connectedWebsites', (res) => {
                    window.postMessage({
                        target: 'authStateRes',
                        data: res
                    }, '*');
                });
                return;
            }
        case 'getNetworks':
            {
                getStorage('net', (res) => {
                    window.postMessage({
                        target: 'networksRes',
                        data: {
                            using: res || 'MainNet'
                        }
                    }, '*');
                });
                return;
            }
        case 'invokeRead':
            {
                const parameter = e.data.parameter;
                e.data.url =  parameter.network === 'MainNet' ? mainApi : testApi;
                e.data.parameter = [parameter.scriptHash, parameter.operation, parameter.args];
                chrome.runtime.sendMessage(e.data, (response) => {
                    return Promise.resolve('Dummy response to keep the console quiet');
                });
                return;
            }
        case 'invoke':
            {
                const parameter = e.data.parameter;
                e.data.url =  parameter.network === 'MainNet' ? mainApi : testApi;
                chrome.runtime.sendMessage(e.data, (response) => {
                    return Promise.resolve('Dummy response to keep the console quiet');
                });
                return;
            }
        case 'getTransaction':
        {
            const parameter = e.data.parameter;
            const apiUrl = parameter.network === 'MainNet' ? mainApi : testApi;
            httpGet(`${apiUrl}/v1/transactions/gettransaction/${parameter.txID}`, (res) => {
                window.postMessage({
                    target: 'getTransactionRes',
                    data: res
                }, '*');
            }, null);
            return;
        }
        case 'transfer':
            {
                const parameter = e.data;
                const apiUrl = parameter.network === 'MainNet' ? mainApi : testApi;
                const assetID = parameter.assetID === undefined ? '' : parameter.assetID;
                const symbol = parameter.symbol === undefined ? '' : parameter.symbol;
                httpGet(`${apiUrl}/v1/address/assets?address=${parameter.fromAddress}&asset_id=${assetID}&symbol=${symbol}`, (res) => {
                    let enough = true; // 有足够的钱
                    let hasAsset = false;  // 该地址有这个资产
                    for (const asset of res.result) {
                        if (asset.asset_id === assetID || String(asset.symbol).toLowerCase() === symbol.toLowerCase()) {
                            hasAsset = true;
                            e.data.symbol = asset.symbol;
                            e.data.assetID = asset.asset_id;
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
                            target: 'transferRes',
                            data: 'invalid_arguments'
                        }, '*');
                        return;
                    }
                }, null);
                return;
            }
        case 'connect':
            {
                chrome.runtime.sendMessage(e.data, (response) => {
                    return Promise.resolve('Dummy response to keep the console quiet');
                });
            }
    }
}, false);

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    window.postMessage(request, '*');
    sendResponse('');
    return Promise.resolve('Dummy response to keep the console quiet');

});
