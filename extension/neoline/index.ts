/**
 * Inject to third part pages.
 */

import {
    httpGet,
    getStorage,
    httpPost
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
if (dapi != null) {
    window.document.body.appendChild(dapi);
}

window.addEventListener('message', (e) => {
    switch (e.data.target) {
        case 'getWalletInfo':
            {
                const manifestData = chrome.runtime.getManifest();
                window.postMessage({
                    target: 'walletInfoRes',
                    data: manifestData
                }, '*');
                return;
            }
        case 'getAccount':
            {
                getStorage('wallet', (res: any) => {
                    let data: any;
                    if (res !== undefined && res.accounts[0] !== undefined) {
                        data = {
                            address: res.accounts[0].address
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
        case 'invokeTest':
            {
                const parameter = e.data.parameter;
                e.data.url =  parameter.network === 'MainNet' ? mainApi : testApi;
                e.data.parameter = [parameter.scriptHash, parameter.operation, parameter.args];
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
        }
        case 'transfer':
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
