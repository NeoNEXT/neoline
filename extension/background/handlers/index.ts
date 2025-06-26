import {
  ETH_EOA_SIGN_METHODS,
  MESSAGE_TYPE,
  unrestrictedMethods,
  UNSUPPORTED_RPC_METHODS,
} from '../../common/data_module_evm';
import { ethErrors } from 'eth-rpc-errors';
import addEthereumChain from './add-ethereum-chain';
import switchEthereumChain from './switch-ethereum-chain';
import watchAsset from './watch-asset';
import { createWindow, getCurrentNeoXNetwork } from '../tool';
import {
  getLocalStorage,
  getStorage,
  httpPostPromise,
  setLocalStorage,
} from '../../common';
import { validateTxParams } from './validation-tx-params';
import { ConnectedWebsitesType, STORAGE_NAME } from '../../common/constants';
import { ethers } from 'ethers';
import { validateSigTypedDataV4Params } from './validation-sigv4-params';
import { u } from '@cityofzion/neon-core-neo3';
import { add0x } from '../../common/evm/tokensController';

const handlers = [addEthereumChain, switchEthereumChain, watchAsset];

export const walletHandlerMap = handlers.reduce((map, handler) => {
  for (const methodName of handler.methodNames) {
    map.set(methodName, handler);
  }
  return map;
}, new Map());

export async function ethereumRPCHandler(
  { method, params },
  messageID: number,
  sender: { origin: string },
  hostInfo: { origin: string; icon: string }
) {
  if (UNSUPPORTED_RPC_METHODS.has(method)) {
    return Promise.reject(ethErrors.rpc.methodNotSupported());
  }
  if (!unrestrictedMethods.includes(method)) {
    return Promise.reject(ethErrors.rpc.methodNotFound());
  }
  if (method === 'eth_sendTransaction') {
    try {
      let txParams = await validateReqParams(params, sender);
      txParams = normalizeTransactionParams(txParams);

      const isEIP1559Compatible = await determineEIP1559Compatibility();
      validateTxParams(txParams, isEIP1559Compatible);
      const localData =
        (await getLocalStorage(STORAGE_NAME.InvokeArgsArray, () => {})) || {};
      const newData = { ...localData, [messageID]: txParams };
      setLocalStorage({ [STORAGE_NAME.InvokeArgsArray]: newData });
      createWindow(
        `evm-send-transaction?messageID=${messageID}&origin=${hostInfo.origin}&icon=${hostInfo.icon}`
      );
    } catch (error) {
      return Promise.reject(error);
    }
  } else if (method === 'personal_sign') {
    try {
      await validateSignReqParams(params, sender);
      params[0] = normalizeMessageData(params[0]);
      const localData =
        (await getLocalStorage(STORAGE_NAME.InvokeArgsArray, () => {})) || {};
      const newData = { ...localData, [messageID]: params };
      setLocalStorage({ [STORAGE_NAME.InvokeArgsArray]: newData });
      createWindow(
        `evm-personal-sign?messageID=${messageID}&origin=${hostInfo.origin}`
      );
    } catch (error) {
      return Promise.reject(error);
    }
  } else if (method === MESSAGE_TYPE.ETH_SIGN_TYPED_DATA_V4) {
    try {
      await validateSigTypedDataV4Params(params);
      await validateAndNormalizeKeyholder(params[0], sender);
      const localData =
        (await getLocalStorage(STORAGE_NAME.InvokeArgsArray, () => {})) || {};
      const newData = { ...localData, [messageID]: params };
      setLocalStorage({ [STORAGE_NAME.InvokeArgsArray]: newData });
      createWindow(
        `evm-personal-sign?messageID=${messageID}&method=${ETH_EOA_SIGN_METHODS.SignTypedDataV4}&origin=${hostInfo.origin}`
      );
    } catch (error) {
      return Promise.reject(error);
    }
  } else {
    const { currNeoXNetwork } = await getCurrentNeoXNetwork();
    const data = { jsonrpc: '2.0', method, params, id: 1 };
    return httpPostPromise(currNeoXNetwork.rpcUrl, data)
      .then((res) => res)
      .catch((error) =>
        Promise.reject(ethErrors.rpc.internal({ data: error }))
      );
  }
}

async function validateSignReqParams(params, sender: { origin: string }) {
  if (!params || !Array.isArray(params) || params.length < 2) {
    throw ethErrors.rpc.invalidInput();
  }
  const challenge = params[0];
  if (!challenge || typeof challenge !== 'string') {
    throw ethErrors.rpc.invalidParams({
      message: `Expected a string 'challenge'. Received: ${challenge}`,
    });
  }
  const signAddress = params[1];
  await validateAndNormalizeKeyholder(
    (signAddress === null || signAddress === void 0 ? void 0 : signAddress) ||
      '',
    sender
  );
}

/**
 * Normalizes properties on transaction params.
 *
 * @param txParams - The transaction params to normalize.
 * @returns Normalized transaction params.
 */
export function normalizeTransactionParams(txParams) {
  const normalizedTxParams = { from: '' };

  Object.keys(txParams).forEach((key) => {
    if (txParams[key]) {
      normalizedTxParams[key] = txParams[key];
    }
  });

  if (!normalizedTxParams['value']) {
    normalizedTxParams['value'] = '0x0';
  }

  return normalizedTxParams;
}

async function validateReqParams(params, sender: { origin: string }) {
  if (!params || !Array.isArray(params) || !(params.length >= 1)) {
    throw ethErrors.rpc.invalidInput();
  }
  const currParams = params[0];
  const txParams = Object.assign(Object.assign({}, currParams), {
    from: await validateAndNormalizeKeyholder(
      (currParams === null || currParams === void 0
        ? void 0
        : currParams.from) || '',
      sender
    ),
  });
  return txParams;
}

/**
 * Validates the keyholder address, and returns a normalized (i.e. lowercase)
 * copy of it.
 *
 * @param address - The address to validate and normalize.
 * @returns {string} - The normalized address, if valid. Otherwise, throws
 * an error
 */
async function validateAndNormalizeKeyholder(
  address,
  sender: { origin: string }
) {
  if (
    typeof address === 'string' &&
    address.length > 0 &&
    resemblesAddress(address)
  ) {
    // Ensure that an "unauthorized" error is thrown if the requester does not have the `eth_accounts`
    // permission.
    const accounts = await getAccounts(sender);
    const normalizedAccounts = accounts.map((_address) =>
      _address.toLowerCase()
    );
    const normalizedAddress = address.toLowerCase();
    if (normalizedAccounts.includes(normalizedAddress)) {
      return normalizedAddress;
    }
    throw ethErrors.provider.unauthorized();
  }
  throw ethErrors.rpc.invalidParams({
    message: `Invalid parameters: must provide an Ethereum address.`,
  });
}
function resemblesAddress(str) {
  // hex prefix 2 + 20 bytes
  return str.length === 2 + 20 * 2;
}

function getAccounts(sender: { origin: string }): Promise<string[]> {
  const url = new URL(sender.origin);
  const hostname = url.hostname;
  const data = [];

  return new Promise((resolve) => {
    getStorage(
      STORAGE_NAME.connectedWebsites,
      (allWebsites: ConnectedWebsitesType) => {
        Object.keys(allWebsites[hostname]?.connectedAddress || {}).forEach(
          (address) => {
            const item = allWebsites[hostname].connectedAddress[address];
            if (item.chain === 'NeoX') {
              data.push(address);
            }
          }
        );
        resolve(data);
      }
    );
  });
}

async function determineEIP1559Compatibility() {
  const { currNeoXNetwork } = await getCurrentNeoXNetwork();
  const provider = new ethers.JsonRpcProvider(currNeoXNetwork.rpcUrl);
  provider._detectNetwork().catch(() => {
    provider.destroy();
  });
  const block = await provider.getBlock('latest');

  if (!block) {
    return undefined;
  }
  return block.baseFeePerGas !== undefined;
}

const hexRe = /^[0-9A-Fa-f]+$/gu;
/**
 * A helper function that converts rawmessageData buffer data to a hex, or just returns the data if
 * it is already formatted as a hex.
 *
 * @param data - The buffer data to convert to a hex.
 * @returns A hex string conversion of the buffer data.
 */
function normalizeMessageData(data: string) {
  try {
    const stripped = u.remove0xPrefix(data);
    if (stripped.match(hexRe)) {
      return add0x(stripped);
    }
  } catch (e) {
    /* istanbul ignore next */
  }
  return u.ab2hexstring(Buffer.from(data, 'utf8'));
}
