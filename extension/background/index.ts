export {
  getStorage,
  httpGet,
  httpPost,
  setStorage,
  removeStorage,
  clearStorage,
  notification,
  setLocalStorage,
  removeLocalStorage,
  clearLocalStorage,
  getLocalStorage,
} from '../common';
import {
  getStorage,
  setStorage,
  notification,
  httpPost,
  httpPostPromise,
  setLocalStorage,
  getLocalStorage,
  getSessionStorage,
  handleNeo3StackNumberValue,
  removeLocalStorage,
  clearLocalStorage,
  removeStorage,
  clearStorage,
  setSessionStorage,
  clearSessionStorage,
} from '../common';
import {
  WitnessScope,
  NEO,
  GAS,
  NEO3,
  GAS3,
  STORAGE_NAME,
  ConnectedWebsitesType,
} from '../common/constants';
import {
  requestTarget,
  ERRORS,
  VerifyMessageArgs,
  SendArgs,
} from '../common/data_module_neo2';
import {
  N3CreateTransactionArgs,
  N3InvokeArgs,
  N3InvokeMultipleArgs,
  N3VerifyMessageArgs,
  requestTargetN3,
} from '../common/data_module_neo3';
import {
  getScriptHashFromAddress,
  verify,
  reverseHex,
  isN3Asset,
} from '../common/utils';
import { u as u3, wallet as wallet3 } from '@cityofzion/neon-core-neo3/lib';
import BigNumber from 'bignumber.js';
import { requestTargetEVM } from '../common/data_module_evm';
import {
  createWindow,
  getCurrentNeo2Network,
  getCurrentNeo3Network,
  getChainType,
  listenBlock,
  waitTxs,
  resetData,
  windowCallback,
  canCurrentWalletSignTransaction,
} from './tool';
import { walletHandlerMap, ethereumRPCHandler } from './handlers';
import { neoRequestHandlerMap } from './request-handlers';
import { ethErrors } from 'eth-rpc-errors';
import { remove0xPrefix } from '@cityofzion/neon-core-neo3/lib/u';
import { createNeo3Tx, handleInvokeArgs } from './neo3-tx';
import { N3SendArgs } from '../../cross-runtime/neo3-shared';

/**
 * Background methods support.
 * Call window.NeoLineBackground to use.
 */
declare var chrome;

async function canSignWithOnePasswordMode(
  signerAddress: string,
  hostname: string,
  chain: 'Neo3' | 'Neo2' | 'NeoX',
): Promise<boolean> {
  if (!signerAddress || !hostname) return false;
  const onePassword = await getLocalStorage('onePassword', () => {});
  if (!onePassword) return false;
  const allWebsites = await new Promise<ConnectedWebsitesType>((resolve) => {
    getStorage(STORAGE_NAME.connectedWebsites, (res: ConnectedWebsitesType) => {
      resolve(res);
    });
  });
  const connected = allWebsites?.[hostname]?.connectedAddress?.[signerAddress];
  return !!connected && connected.chain === chain;
}

chrome.alarms.create({ periodInMinutes: 1 });
chrome.alarms.onAlarm.addListener(async () => {
  const { currN2Network } = await getCurrentNeo2Network();
  const { currN3Network } = await getCurrentNeo3Network();
  const chainType = await getChainType();
  setTimeout(async () => {
    await listenBlock(chainType === 'Neo2' ? currN2Network : currN3Network);
  }, 0);
  waitTxs(chainType === 'Neo2' ? currN2Network : currN3Network, chainType);
});

(function init() {
  const currentLocale = chrome.i18n.getMessage('@@ui_locale');
  const supportedLocaleLang =
    currentLocale === 'zh_CN' || currentLocale === 'ko' || currentLocale === 'ja'
      ? currentLocale
      : undefined;

  if (supportedLocaleLang) {
    getStorage('lang', (res) => {
      if (res === undefined) {
        setStorage({ lang: supportedLocaleLang });
      }
    });
  }
})();

if (chrome.runtime.onRestartRequired) {
  chrome.runtime.onRestartRequired.addListener(() => resetData());
}

chrome.runtime.onInstalled.addListener(() => resetData());

chrome.runtime.onStartup.addListener(() => resetData());

chrome.runtime.onMessage.addListener(async (request, sender, sendResponse) => {
  const { currN2Network } = await getCurrentNeo2Network();
  const { currN3Network, n3Networks } = await getCurrentNeo3Network();
  const chainType = await getChainType();

  // Extracted handlers take precedence; unmigrated targets fall through to the
  // switch below (see ./request-handlers).
  const neoRequestHandler = neoRequestHandlerMap.get(request.target);
  if (neoRequestHandler) {
    return neoRequestHandler({
      request,
      sender,
      sendResponse,
      currN2Network,
      currN3Network,
      n3Networks,
      chainType,
    });
  }

  switch (request.target) {
    case requestTargetEVM.request: {
      const { method, params, hostInfo } = request.parameter;
      const handler = walletHandlerMap.get(method);
      if (handler) {
        const { implementation } = handler;
        implementation(params, request.ID, hostInfo)
          .then((finish) => {
            if (finish) {
              windowCallback({
                data: null,
                ID: request.ID,
                return: requestTargetEVM.request,
              });
            }
            sendResponse('');
          })
          .catch((error) => {
            windowCallback({
              data: null,
              ID: request.ID,
              return: requestTargetEVM.request,
              error:
                typeof error.serialize === 'function'
                  ? error.serialize()
                  : ethErrors.rpc.internal().serialize(),
            });
            sendResponse('');
          });
      } else {
        ethereumRPCHandler(request.parameter, request.ID, sender, hostInfo)
          .then((data) => {
            windowCallback({
              data,
              error: null,
              ID: request.ID,
              return: requestTargetEVM.request,
            });
            sendResponse('');
          })
          .catch((error) => {
            windowCallback({
              data: null,
              ID: request.ID,
              return: requestTargetEVM.request,
              error:
                typeof error.serialize === 'function'
                  ? error.serialize()
                  : ethErrors.rpc.internal().serialize(),
            });
            sendResponse('');
          });
      }
      return;
    }
    //#region neo legacy
    case requestTarget.VerifyMessage: {
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
    }
    case requestTarget.SignMessage: {
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
    }
    case requestTarget.Invoke: {
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
    }
    case requestTarget.InvokeMulti: {
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
    }
    case requestTarget.Send: {
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
    }
    case requestTarget.Deploy: {
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
    }
    //#endregion

    //#region neo3 dapi method
    case requestTargetN3.VerifyMessage: {
      const parameter = request.parameter as N3VerifyMessageArgs;
      const parameterHexString = Buffer.from(parameter.message).toString('hex');
      const lengthHex = u3.num2VarInt(parameterHexString.length / 2);
      const concatenatedString = lengthHex + parameterHexString;
      const messageHex = '010001f0' + concatenatedString + '0000';
      const result = verify(messageHex, parameter.data, parameter.publicKey);
      windowCallback({
        return: requestTargetN3.VerifyMessage,
        data: {
          result,
        },
        ID: request.ID,
      });
      sendResponse('');
      return;
    }
    case requestTargetN3.VerifyMessageV2: {
      const parameter = request.parameter as N3VerifyMessageArgs;
      const parameterHexString = Buffer.from(parameter.message).toString('hex');
      const lengthHex = u3.num2VarInt(parameterHexString.length / 2);
      const concatenatedString = lengthHex + parameterHexString;
      const messageHex =
        '000000000000000000000000000000000000000000000000000100000000000000000000000000000000000000000000' +
        concatenatedString;
      const signHex = u3.num2hexstring(0, 4, true) + u3.sha256(messageHex);
      const result = verify(signHex, parameter.data, parameter.publicKey);
      windowCallback({
        return: requestTargetN3.VerifyMessageV2,
        data: {
          result,
        },
        ID: request.ID,
      });
      sendResponse('');
      return;
    }
    case requestTargetN3.SignMessage:
    case requestTargetN3.SignMessageV2:
    case requestTargetN3.SignMessageWithoutSalt:
    case requestTargetN3.SignMessageWithoutSaltV2: {
      const params = request.parameter;
      let queryString = '';
      for (const key in params) {
        if (params.hasOwnProperty(key)) {
          const value = encodeURIComponent(params[key]);
          queryString += `${key}=${value}&`;
        }
      }
      const route =
        request.target === requestTargetN3.SignMessageV2 ||
        request.target === requestTargetN3.SignMessageWithoutSaltV2
          ? 'neo3-signature-v2'
          : 'neo3-signature';
      const saltSignal =
        request.target === requestTargetN3.SignMessageWithoutSalt ||
        request.target === requestTargetN3.SignMessageWithoutSaltV2
          ? '&withoutSalt=1'
          : '';
      createWindow(`${route}?${queryString}messageID=${request.ID}${saltSignal}`);
      sendResponse('');
      return;
    }
    case requestTargetN3.SignMessageV3: {
      const params = request.parameter;

      const currentWallet = await getLocalStorage(STORAGE_NAME.wallet, () => {});
      const currentAddress = currentWallet?.accounts?.[0]?.address;
      if (params.account) {
        const address = wallet3.getAddressFromScriptHash(
          remove0xPrefix(params.account),
        );
        if (
          currentAddress !== undefined &&
          currentAddress !== address
        ) {
          const allowOnePassSign = await canSignWithOnePasswordMode(
            address,
            request.hostname,
            'Neo3',
          );
          if (!allowOnePassSign) {
            windowCallback({
              return: requestTargetN3.SignMessageV3,
              error: { ...ERRORS.MALFORMED_INPUT, description: 'Current account is not the signer' },
              ID: request.ID,
            });
            sendResponse('');
            return;
          }
        }
      }
      if (
        !params.options?.isLedgerCompatible &&
        currentWallet?.accounts?.[0]?.extra?.ledgerSLIP44
      ) {
        windowCallback({
          return: requestTargetN3.SignMessageV3,
          error: {
            ...ERRORS.MALFORMED_INPUT,
            description:
              "Ledger account requires 'options.isLedgerCompatible = true'. Please set this option and retry.",
          },
          ID: request.ID,
        });
        sendResponse('');
        return;
      }
      const localData =
        (await getLocalStorage(STORAGE_NAME.InvokeArgsArray, () => {})) || {};
      const newData = { ...localData, [request.ID]: params };
      setLocalStorage({ [STORAGE_NAME.InvokeArgsArray]: newData });
      createWindow(`neo3-signature-v3?messageID=${request.ID}`);

      sendResponse('');
      return;
    }
    case requestTargetN3.SignTransaction: {
      try {
        const params = request.parameter || {};
        const currentWallet = await getLocalStorage(STORAGE_NAME.wallet, () => {});
        if (!canCurrentWalletSignTransaction(params, currentWallet)) {
          windowCallback({
            return: requestTargetN3.SignTransaction,
            error: {
              ...ERRORS.MALFORMED_INPUT,
              description: 'Current account cannot sign this transaction context',
            },
            ID: request.ID,
          });
          sendResponse('');
          return;
        }
        const localData =
          (await getLocalStorage(STORAGE_NAME.InvokeArgsArray, () => {})) || {};
        const newData = { ...localData, [request.ID]: params };
        setLocalStorage({ [STORAGE_NAME.InvokeArgsArray]: newData });
        createWindow(`neo3-sign-transaction?messageID=${request.ID}`);
      } catch (error) {
        windowCallback({
          return: requestTargetN3.SignTransaction,
          error: {
            ...ERRORS.MALFORMED_INPUT,
            description: error?.message || error,
          },
          ID: request.ID,
        });
      }
      sendResponse('');
      return;
    }
    case requestTargetN3.CreateTransaction: {
      try {
        const params = request.parameter as N3CreateTransactionArgs;
        const transaction = await createNeo3Tx({
          rpcUrl: currN3Network.rpcUrl,
          invokeArgs: (params.invokeArgs || []).map((item) => ({
            scriptHash: item.scriptHash,
            operation: item.operation,
            args: handleInvokeArgs(item.args),
            abortOnFail: item.abortOnFail,
          })),
          signers: params.signers || [],
          networkFee: '0',
          systemFee: params.extraSystemFee,
          overrideSystemFee: params.overrideSystemFee,
          attributes: params.attributes,
          validUntilBlock: params.validUntilBlock,
        });

        const items = transaction.signers.reduce((acc, signer) => {
          const account = signer.account.toBigEndian();

          acc[account] = {
            script: '',
            parameters: [],
            signatures: {},
          };

          return acc;
        }, {});

        const returnData = {
          type: 'Neo.Network.P2P.Payloads.Transaction',
          hash: transaction.hash(),
          data: u3.hex2base64(transaction.serialize(false)),
          items,
          network: currN3Network.magicNumber,
        };

        windowCallback({
          return: requestTargetN3.CreateTransaction,
          ID: request.ID,
          data: returnData,
          error: null,
        });
      } catch (error) {
        windowCallback({
          return: requestTargetN3.CreateTransaction,
          ID: request.ID,
          data: null,
          error,
        });
      }
      sendResponse('');
      return;
    }
    case requestTargetN3.Invoke: {
      const params = request.parameter as N3InvokeArgs;
      const currWallet = await getLocalStorage(STORAGE_NAME.wallet, () => {});
      const tempScriptHash = getScriptHashFromAddress(
        currWallet.accounts[0].address
      );
      if (!params.signers) {
        params.signers = [
          {
            account: tempScriptHash,
            scopes: WitnessScope.CalledByEntry,
          },
        ];
      } else {
        if (!params.signers[0].account) {
          params.signers[0].account = tempScriptHash;
        }
        if (params.signers[0].scopes === undefined) {
          params.signers[0].scopes = WitnessScope.CalledByEntry;
        }
      }
      const localData =
        (await getLocalStorage(STORAGE_NAME.InvokeArgsArray, () => {})) || {};
      const newData = { ...localData, [request.ID]: params };
      setLocalStorage({ [STORAGE_NAME.InvokeArgsArray]: newData });
      createWindow(`neo3-invoke?messageID=${request.ID}`);
      sendResponse('');
      return;
    }
    case requestTargetN3.InvokeMultiple: {
      const params = request.parameter as N3InvokeMultipleArgs;
      const currWallet = await getLocalStorage(STORAGE_NAME.wallet, () => {});
      const tempScriptHash = getScriptHashFromAddress(
        currWallet.accounts[0].address
      );
      if (!params.signers) {
        params.signers = [
          {
            account: tempScriptHash,
            scopes: WitnessScope.CalledByEntry,
          },
        ];
      } else {
        if (!params.signers[0].account) {
          params.signers[0].account = tempScriptHash;
        }
        if (params.signers[0].scopes === undefined) {
          params.signers[0].scopes = WitnessScope.CalledByEntry;
        }
      }
      const localData =
        (await getLocalStorage(STORAGE_NAME.InvokeArgsArray, () => {})) || {};
      const newData = { ...localData, [request.ID]: params };
      setLocalStorage({ [STORAGE_NAME.InvokeArgsArray]: newData });
      createWindow(`neo3-invoke-multiple?messageID=${request.ID}`);
      sendResponse('');
      return;
    }
    case requestTargetN3.Send: {
      const parameter = request.parameter as N3SendArgs;
      const wallet = await getLocalStorage(STORAGE_NAME.wallet, () => {});
      if (
        wallet !== undefined &&
        wallet.accounts[0].address !== parameter.fromAddress
      ) {
        const allowOnePassSign = await canSignWithOnePasswordMode(
          parameter.fromAddress,
          request.hostname,
          'Neo3',
        );
        if (!allowOnePassSign) {
          windowCallback({
            return: requestTargetN3.Send,
            error: { ...ERRORS.MALFORMED_INPUT, description: 'Current account is not the sender' },
            ID: request.ID,
          });
          sendResponse('');
          return;
        }
      }

      let assetID = parameter.asset;
      if (assetID.toLowerCase() === 'neo') {
        assetID = NEO3;
      }
      if (assetID.toLowerCase() === 'gas') {
        assetID = GAS3;
      }
      if (!isN3Asset(assetID)) {
        windowCallback({
          return: requestTargetN3.Send,
          error: ERRORS.MALFORMED_INPUT,
          ID: request.ID,
        });
        sendResponse('');
        return;
      }
      assetID = assetID.startsWith('0x') ? assetID : '0x' + assetID;
      request.parameter.asset = assetID;

      const [balanceRes, decimalsRes] = await Promise.all([
        httpPostPromise(currN3Network.rpcUrl, {
          jsonrpc: '2.0',
          id: 1,
          method: 'invokefunction',
          params: [
            assetID,
            'balanceOf',
            [
              {
                type: 'Hash160',
                value: wallet3.getScriptHashFromAddress(parameter.fromAddress),
              },
            ],
          ],
        }),
        httpPostPromise(currN3Network.rpcUrl, {
          jsonrpc: '2.0',
          id: 1,
          method: 'invokefunction',
          params: [assetID, 'decimals'],
        }),
      ]);
      const balance = handleNeo3StackNumberValue(balanceRes);
      const decimals = handleNeo3StackNumberValue(decimalsRes);
      const assetBalance = new BigNumber(balance).shiftedBy(-decimals);
      if (parameter.version === 2) {
        parameter.amount = new BigNumber(parameter.amount)
          .shiftedBy(-decimals)
          .toFixed();
        delete parameter.version;
        request.parameter.amount = parameter.amount;
      }
      if (assetBalance.comparedTo(new BigNumber(parameter.amount)) >= 0) {
        const localData =
        (await getLocalStorage(STORAGE_NAME.InvokeArgsArray, () => {})) || {};
        const newData = { ...localData, [request.ID]: parameter };
        setLocalStorage({ [STORAGE_NAME.InvokeArgsArray]: newData });
        createWindow(`neo3-transfer?messageID=${request.ID}`);
      } else {
        windowCallback({
          return: requestTargetN3.Send,
          error: ERRORS.INSUFFICIENT_FUNDS,
          ID: request.ID,
        });
      }
      sendResponse('');
      return true;
    }
    //#endregion
  }
  return true;
});

//#region storage message from popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  switch (request.type) {
    case 'localStorage':
      switch (request.method) {
        case 'get':
          getLocalStorage(request.data, (result) => {
            sendResponse(result);
          });
          return true;
        case 'set':
          setLocalStorage(request.data);
          sendResponse('');
          return true;
        case 'remove':
          removeLocalStorage(request.data);
          sendResponse('');
          return true;
        case 'clear':
          clearLocalStorage();
          sendResponse('');
          return true;
      }
      break;
    case 'syncStorage':
      switch (request.method) {
        case 'get':
          getStorage(request.data, (result) => {
            sendResponse(result);
          });
          return true;
        case 'set':
          setStorage(request.data);
          sendResponse('');
          return true;
        case 'remove':
          removeStorage(request.data);
          sendResponse('');
          return true;
        case 'clear':
          clearStorage();
          sendResponse('');
          return true;
      }
      break;
    case 'sessionStorage':
      switch (request.method) {
        case 'get':
          getSessionStorage(request.data, (result) => {
            sendResponse(result);
          });
          return true;
        case 'set':
          setSessionStorage(request.data);
          sendResponse('');
          return true;
        case 'clear':
          clearSessionStorage();
          sendResponse('');
          return true;
      }
      break;
  }
});
//#endregion

chrome.notifications.onClicked.addListener((id: string) => {
  chrome.windows.create({
    url: id,
    focused: true,
    type: 'normal',
  });
});
