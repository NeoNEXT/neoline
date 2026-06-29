import {
  requestTargetN3,
  N3VerifyMessageArgs,
  N3CreateTransactionArgs,
  N3InvokeArgs,
  N3InvokeMultipleArgs,
} from '../../common/data_module_neo3';
import { N3SendArgs } from '../../../cross-runtime/neo3-shared';
import { ERRORS } from '../../common/data_module_neo2';
import { NEO3, GAS3, STORAGE_NAME, WitnessScope } from '../../common/constants';
import {
  httpPostPromise,
  getLocalStorage,
  setLocalStorage,
  handleNeo3StackNumberValue,
} from '../../common';
import {
  verify,
  getScriptHashFromAddress,
  isN3Asset,
} from '../../common/utils';
import { u as u3, wallet as wallet3 } from '@cityofzion/neon-core-neo3/lib';
import { remove0xPrefix } from '@cityofzion/neon-core-neo3/lib/u';
import BigNumber from 'bignumber.js';
import { createNeo3Tx, handleInvokeArgs } from '../neo3-tx';
import {
  createWindow,
  windowCallback,
  canSignWithOnePasswordMode,
  canCurrentWalletSignTransaction,
} from '../tool';
import { RequestHandlerModule } from './context';

const verifyMessage: RequestHandlerModule = {
  targets: [requestTargetN3.VerifyMessage],
  handle: ({ request, sendResponse }) => {
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
  },
};

const verifyMessageV2: RequestHandlerModule = {
  targets: [requestTargetN3.VerifyMessageV2],
  handle: ({ request, sendResponse }) => {
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
  },
};

const signMessage: RequestHandlerModule = {
  targets: [
    requestTargetN3.SignMessage,
    requestTargetN3.SignMessageV2,
    requestTargetN3.SignMessageWithoutSalt,
    requestTargetN3.SignMessageWithoutSaltV2,
  ],
  handle: ({ request, sendResponse }) => {
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
  },
};

const signMessageV3: RequestHandlerModule = {
  targets: [requestTargetN3.SignMessageV3],
  handle: async ({ request, sendResponse }) => {
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
  },
};

const signTransaction: RequestHandlerModule = {
  targets: [requestTargetN3.SignTransaction],
  handle: async ({ request, sendResponse }) => {
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
  },
};

const createTransaction: RequestHandlerModule = {
  targets: [requestTargetN3.CreateTransaction],
  handle: async ({ request, sendResponse, currN3Network }) => {
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
  },
};

const invoke: RequestHandlerModule = {
  targets: [requestTargetN3.Invoke],
  handle: async ({ request, sendResponse }) => {
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
  },
};

const invokeMultiple: RequestHandlerModule = {
  targets: [requestTargetN3.InvokeMultiple],
  handle: async ({ request, sendResponse }) => {
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
  },
};

const send: RequestHandlerModule = {
  targets: [requestTargetN3.Send],
  handle: async ({ request, sendResponse, currN3Network }) => {
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
  },
};

export default [
  verifyMessage,
  verifyMessageV2,
  signMessage,
  signMessageV3,
  signTransaction,
  createTransaction,
  invoke,
  invokeMultiple,
  send,
];
