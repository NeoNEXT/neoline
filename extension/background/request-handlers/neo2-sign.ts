import {
  requestTarget,
  ERRORS,
  VerifyMessageArgs,
  SendArgs,
} from '../../common/data_module_neo2';
import { NEO, GAS, STORAGE_NAME } from '../../common/constants';
import {
  httpPost,
  httpPostPromise,
  getLocalStorage,
  handleNeo3StackNumberValue,
} from '../../common';
import { verify } from '../../common/utils';
import BigNumber from 'bignumber.js';
import { createWindow, windowCallback } from '../tool';
import { RequestHandlerModule } from './context';

const verifyMessage: RequestHandlerModule = {
  targets: [requestTarget.VerifyMessage],
  handle: ({ request, sendResponse }) => {
    const parameter = request.parameter as VerifyMessageArgs;
    const parameterHexString = Buffer.from(parameter.message).toString('hex');
    const lengthHex = (parameterHexString.length / 2)
      .toString(16)
      .padStart(2, '0');
    const messageHex = lengthHex + parameterHexString;
    const serializedTransaction = '010001f0' + messageHex + '0000';
    windowCallback({
      return: requestTarget.VerifyMessage,
      data: {
        result: verify(
          serializedTransaction,
          parameter.data,
          parameter.publicKey
        ),
      },
      ID: request.ID,
    });
    sendResponse('');
    return;
  },
};

const signMessage: RequestHandlerModule = {
  targets: [requestTarget.SignMessage],
  handle: ({ request, sendResponse }) => {
    const params = request.parameter;
    let queryString = '';
    for (const key in params) {
      if (params.hasOwnProperty(key)) {
        const value = encodeURIComponent(params[key]);
        queryString += `${key}=${value}&`;
      }
    }
    createWindow(`signature?${queryString}messageID=${request.ID}`);
    sendResponse('');
    return;
  },
};

const invoke: RequestHandlerModule = {
  targets: [requestTarget.Invoke],
  handle: ({ request, sendResponse }) => {
    const params = request.parameter;
    let queryString = '';
    for (const key in params) {
      if (params.hasOwnProperty(key)) {
        const value =
          key === 'args' ||
          key === 'assetIntentOverrides' ||
          key === 'attachedAssets' ||
          key === 'assetIntentOverrides' ||
          key === 'txHashAttributes' ||
          key === 'extra_witness'
            ? JSON.stringify(params[key])
            : params[key];
        queryString += `${key}=${value}&`;
      }
    }
    createWindow(`invoke?${queryString}messageID=${request.ID}`);
    sendResponse('');
    return;
  },
};

const invokeMulti: RequestHandlerModule = {
  targets: [requestTarget.InvokeMulti],
  handle: ({ request, sendResponse }) => {
    const params = request.parameter;
    let queryString = '';
    for (const key in params) {
      if (params.hasOwnProperty(key)) {
        const value =
          key === 'invokeArgs' ||
          key === 'assetIntentOverrides' ||
          key === 'attachedAssets' ||
          key === 'assetIntentOverrides' ||
          key === 'txHashAttributes' ||
          key === 'extra_witness'
            ? JSON.stringify(params[key])
            : params[key];
        queryString += `${key}=${value}&`;
      }
    }
    createWindow(`invoke-multi?${queryString}messageID=${request.ID}`);
    sendResponse('');
    return;
  },
};

const send: RequestHandlerModule = {
  targets: [requestTarget.Send],
  handle: ({ request, sendResponse, currN2Network }) => {
    const parameter = request.parameter as SendArgs;
    let assetID = parameter.asset;
    const data = {
      jsonrpc: '2.0',
      method: 'getnep5balances',
      params: [parameter.fromAddress],
      id: 1,
    };
    let isNep5 = true;
    if (assetID.toLowerCase() === 'neo') {
      assetID = NEO;
    }
    if (assetID.toLowerCase() === 'gas') {
      assetID = GAS;
    }
    assetID = assetID.startsWith('0x') ? assetID : '0x' + assetID;
    request.parameter.asset = assetID;
    if (assetID === NEO || assetID === GAS) {
      isNep5 = false;
      data.method = 'getaccountstate';
    }
    httpPost(currN2Network.rpcUrl, data, async (res) => {
      let assetBalance;
      if (res?.result?.balances && isNep5 === false) {
        const tempAsset = res?.result?.balances.find((item) =>
          assetID.includes(item.asset)
        );
        if (tempAsset) {
          assetBalance = tempAsset.value;
        }
      }
      if (res?.result?.balance && isNep5 === true) {
        const tempAsset = res?.result?.balance.find((item) =>
          assetID.includes(item.asset_hash)
        );
        if (tempAsset) {
          assetBalance = tempAsset.amount;
        }
      }
      if (assetBalance === undefined) {
        windowCallback({
          return: requestTarget.Send,
          error: ERRORS.INSUFFICIENT_FUNDS,
          ID: request.ID,
        });
        sendResponse('');
        return;
      }
      if (isNep5) {
        const decimalsData = {
          jsonrpc: '2.0',
          id: 1,
          method: 'invokefunction',
          params: [assetID, 'decimals'],
        };
        const decimalsRes: any = await httpPostPromise(
          currN2Network.rpcUrl,
          decimalsData
        );
        const decimals = handleNeo3StackNumberValue(decimalsRes);
        assetBalance = new BigNumber(assetBalance).shiftedBy(-decimals);
      }
      if (
        new BigNumber(assetBalance).comparedTo(
          new BigNumber(parameter.amount)
        ) >= 0
      ) {
        let queryString = '';
        for (const key in parameter) {
          if (parameter.hasOwnProperty(key)) {
            const value =
              key === 'txHashAttributes'
                ? JSON.stringify(parameter[key])
                : parameter[key];
            queryString += `${key}=${value}&`;
          }
        }
        getLocalStorage(STORAGE_NAME.wallet, (wallet) => {
          if (
            wallet !== undefined &&
            wallet.accounts[0].address !== parameter.fromAddress
          ) {
            windowCallback({
              return: requestTarget.Send,
              error: ERRORS.MALFORMED_INPUT,
              ID: request.ID,
            });
          } else {
            createWindow(`transfer?${queryString}messageID=${request.ID}`);
          }
        });
      } else {
        windowCallback({
          return: requestTarget.Send,
          error: ERRORS.INSUFFICIENT_FUNDS,
          ID: request.ID,
        });
        sendResponse('');
        return;
      }
    });
    return true;
  },
};

const deploy: RequestHandlerModule = {
  targets: [requestTarget.Deploy],
  handle: ({ request, sendResponse }) => {
    const params = request.parameter;
    let queryString = '';
    for (const key in params) {
      if (params.hasOwnProperty(key)) {
        const value = params[key];
        queryString += `${key}=${value}&`;
      }
    }
    createWindow(`deploy?${queryString}messageID=${request.ID}`);
    sendResponse('');
    return;
  },
};

export default [verifyMessage, signMessage, invoke, invokeMulti, send, deploy];
