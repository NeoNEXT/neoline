import {
  requestTarget,
  ERRORS,
  GetBalanceArgs,
} from '../../common/data_module_neo2';
import { requestTargetN3, N3BalanceArgs } from '../../common/data_module_neo3';
import { NEO, GAS, NEO3, GAS3, STORAGE_NAME } from '../../common/constants';
import {
  httpPostPromise,
  getAssetSymbol,
  getAssetDecimal,
  getLocalStorage,
} from '../../common';
import { wallet as wallet3 } from '@cityofzion/neon-core-neo3/lib';
import BigNumber from 'bignumber.js';
import { windowCallback } from '../tool';
import { RequestHandlerModule } from './context';

const balanceNeo2: RequestHandlerModule = {
  targets: [requestTarget.Balance],
  handle: ({ request, sendResponse, currN2Network }) => {
    const parameter = request.parameter as GetBalanceArgs;
    let params = [];
    if (parameter.params instanceof Array) {
      params = parameter.params;
    } else {
      params.push(parameter.params);
    }
    const nativeBalanceReqs = [];
    const nep5BalanceReqs = [];
    const utxoReqs = [];
    for (const item of params) {
      (item.assets || []).forEach((asset: string, index) => {
        if (asset.toLowerCase() === 'neo') {
          item.assets[index] = NEO;
        }
        if (asset.toLowerCase() === 'gas') {
          item.assets[index] = GAS;
        }
      });
      const nativeData = {
        jsonrpc: '2.0',
        method: 'getaccountstate',
        params: [item.address],
        id: 1,
      };
      const nep5Data = { ...nativeData, method: 'getnep5balances' };
      const nativeReq = httpPostPromise(currN2Network.rpcUrl, nativeData);
      const nepReq = httpPostPromise(currN2Network.rpcUrl, nep5Data);
      nativeBalanceReqs.push(nativeReq);
      nep5BalanceReqs.push(nepReq);
      if (item.fetchUTXO) {
        const utxoData = { ...nativeData, method: 'getunspents' };
        const utxoReq = httpPostPromise(currN2Network.rpcUrl, utxoData);
        utxoReqs.push(utxoReq);
      }
    }
    Promise.all(nativeBalanceReqs.concat(nep5BalanceReqs).concat(utxoReqs))
      .then(async (res) => {
        try {
          const returnData = {};
          let i = 0;
          let j = nativeBalanceReqs.length;
          let k = j * 2;
          for (const item of params) {
            returnData[item.address] = [];
            for (const assetId of item?.assets || []) {
              const res_1 = (res[i]?.balances || []).find((asset_1) =>
                assetId.includes(asset_1.asset)
              );
              const res_2 = (res[j]?.balance || []).find((asset_2) =>
                assetId.includes(asset_2.asset_hash)
              );
              const assetRes = { assetID: assetId, amount: '0', symbol: '' };
              let symbol = '';
              if (assetId === NEO) {
                symbol = 'NEO';
              } else if (assetId === GAS) {
                symbol = 'GAS';
              } else {
                symbol = await getAssetSymbol(assetId, currN2Network.rpcUrl);
              }
              if (res_1) {
                assetRes.amount = res_1.value;
              }
              if (res_2) {
                const decimal = await getAssetDecimal(
                  assetId,
                  currN2Network.rpcUrl
                );
                assetRes.amount = new BigNumber(res_2.amount)
                  .shiftedBy(-decimal)
                  .toFixed();
              }
              assetRes.symbol = symbol;
              returnData[item.address].push(assetRes);
            }
            if (!item.assets || item.assets.length === 0) {
              for (const res_1 of res[i].balances || []) {
                let symbol = '';
                if (res_1.asset === NEO) {
                  symbol = 'NEO';
                }
                if (res_1.asset === GAS) {
                  symbol = 'GAS';
                }
                const assetRes = {
                  assetID: res_1.asset,
                  amount: res_1.value,
                  symbol,
                };
                returnData[item.address].push(assetRes);
              }
              for (const res_2 of res[j]?.balance || []) {
                const symbol = await getAssetSymbol(
                  res_2.asset_hash,
                  currN2Network.rpcUrl
                );
                const decimal = await getAssetDecimal(
                  res_2.asset_hash,
                  currN2Network.rpcUrl
                );
                const amount = new BigNumber(res_2.amount)
                  .shiftedBy(-decimal)
                  .toFixed();
                const assetRes = {
                  assetID: res_2.asset_hash,
                  amount,
                  symbol,
                };
                returnData[item.address].push(assetRes);
              }
            }
            if (res[k]?.address && res[k].address === item.address) {
              res[k].balance.forEach((utxoAsset) => {
                const assetIndex = returnData[item.address].findIndex(
                  (assetItem) =>
                    assetItem.assetID.includes(utxoAsset.asset_hash)
                );
                if (assetIndex >= 0) {
                  returnData[item.address][assetIndex].unspent =
                    utxoAsset.unspent.map((uxtoItem) => {
                      uxtoItem.asset_id = utxoAsset.asset_hash;
                      return uxtoItem;
                    });
                }
              });
              k++;
            }
            i++;
            j++;
          }
          windowCallback({
            return: requestTarget.Balance,
            data: returnData,
            ID: request.ID,
            error: null,
          });
          sendResponse('');
        } catch (error) {
          windowCallback({
            return: requestTarget.Balance,
            data: null,
            ID: request.ID,
            error: {
              ...ERRORS.RPC_ERROR,
              description: error?.error || error,
            },
          });
          sendResponse('');
        }
      })
      .catch((error) => {
        windowCallback({
          return: requestTarget.Balance,
          data: null,
          ID: request.ID,
          error: { ...ERRORS.RPC_ERROR, description: error?.error || error },
        });
        sendResponse('');
      });
    return;
  },
};

const balanceNeo3: RequestHandlerModule = {
  targets: [requestTargetN3.Balance],
  handle: async ({ request, sendResponse, currN3Network }) => {
    const parameter = request.parameter as N3BalanceArgs;
    let params;
    if (parameter.params) {
      params = parameter.params;
    } else {
      const currWallet = await getLocalStorage(STORAGE_NAME.wallet, () => {});
      if (!wallet3.isAddress(currWallet?.accounts?.[0]?.address, 53)) {
        return;
      }
      params = [{ address: currWallet.accounts[0].address, contracts: [] }];
    }
    const balanceReqs = [];
    for (const item of params) {
      (item.contracts || []).forEach((asset: string, index) => {
        if (asset.toLowerCase() === 'neo') {
          item.contracts[index] = NEO3;
        }
        if (asset.toLowerCase() === 'gas') {
          item.contracts[index] = GAS3;
        }
      });
      const reqData = {
        jsonrpc: '2.0',
        method: 'getnep17balances',
        params: [item.address],
        id: 1,
      };
      const tempReq = httpPostPromise(currN3Network.rpcUrl, reqData);
      balanceReqs.push(tempReq);
    }
    Promise.all(balanceReqs)
      .then(async (res) => {
        try {
          const returnData = {};
          let i = 0;
          for (const item of params) {
            returnData[item.address] = [];
            for (const assetId of item?.contracts || []) {
              const res_1 = (res[i]?.balance || []).find((asset_1) =>
                assetId.includes(asset_1.assethash)
              );
              const assetRes = { contract: assetId, amount: '0', symbol: '' };
              if (res_1) {
                assetRes.symbol = res_1.symbol;
                assetRes.amount = new BigNumber(res_1.amount)
                  .shiftedBy(-res_1.decimals)
                  .toFixed();
              } else {
                const symbol = await getAssetSymbol(
                  assetId,
                  currN3Network.rpcUrl
                );
                assetRes.symbol = symbol;
              }
              returnData[item.address].push(assetRes);
            }
            if (!item.contracts || item.contracts.length === 0) {
              for (const res_1 of res[i]?.balance || []) {
                const amount = new BigNumber(res_1.amount)
                  .shiftedBy(-res_1.decimals)
                  .toFixed();
                const assetRes = {
                  contract: res_1.assethash,
                  amount,
                  symbol: res_1.symbol,
                };
                returnData[item.address].push(assetRes);
              }
            }
            i++;
          }
          windowCallback({
            return: requestTargetN3.Balance,
            ID: request.ID,
            data: returnData,
            error: null,
          });
          sendResponse('');
        } catch (error) {
          windowCallback({
            return: requestTargetN3.Balance,
            data: null,
            ID: request.ID,
            error: {
              ...ERRORS.RPC_ERROR,
              description: error?.error || error,
            },
          });
          sendResponse('');
        }
      })
      .catch((error) => {
        windowCallback({
          return: requestTargetN3.Balance,
          data: null,
          ID: request.ID,
          error: { ...ERRORS.RPC_ERROR, description: error?.error || error },
        });
        sendResponse('');
      });
    return;
  },
};

export default [balanceNeo2, balanceNeo3];
