import {
  unrestrictedMethods,
  UNSUPPORTED_RPC_METHODS,
} from '../../common/data_module_evm';
import { ethErrors } from 'eth-rpc-errors';
import addEthereumChain from './add-ethereum-chain';
import switchEthereumChain from './switch-ethereum-chain';
import { createWindow, getCurrentNeoXNetwork } from '../tool';
import {
  getLocalStorage,
  getStorage,
  httpPostPromise,
  setLocalStorage,
} from '../../common';
import { validateTxParams } from './validation-tx-params';
import { STORAGE_NAME } from '../../common/constants';

const handlers = [addEthereumChain, switchEthereumChain];

export const walletHandlerMap = handlers.reduce((map, handler) => {
  for (const methodName of handler.methodNames) {
    map.set(methodName, handler);
  }
  return map;
}, new Map());

export async function ethereumRPCHandler(
  { method, params },
  messageID: number,
  sender: { origin: string }
) {
  if (UNSUPPORTED_RPC_METHODS.has(method)) {
    return Promise.reject(ethErrors.rpc.methodNotSupported());
  }
  if (!unrestrictedMethods.includes(method)) {
    return Promise.reject(ethErrors.rpc.methodNotFound());
  }
  if (method === 'eth_sendTransaction') {
    try {
      const txParams = await validateReqParams(params, sender);
      validateTxParams(txParams);
      const localData =
        (await getLocalStorage(STORAGE_NAME.InvokeArgsArray, () => {})) || {};
      const newData = { ...localData, [messageID]: params };
      setLocalStorage({ [STORAGE_NAME.InvokeArgsArray]: newData });
      createWindow(`evm-send-transaction?messageID=${messageID}`);
    } catch (error) {
      return Promise.reject(error);
    }
  }
  const { currNeoXNetwork } = await getCurrentNeoXNetwork();
  const data = { jsonrpc: '2.0', method, params, id: 1 };
  return httpPostPromise(currNeoXNetwork.rpcUrl, data)
    .then((res) => res)
    .catch((error) => Promise.reject(ethErrors.rpc.internal({ data: error })));
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
  const data = [];

  return new Promise((resolve) => {
    getStorage(STORAGE_NAME.connectedWebsites, (allWebsites) => {
      Object.keys(allWebsites || {}).forEach((address: string) => {
        if (
          allWebsites[address].some(
            (item) =>
              item.status === 'true' && sender.origin.includes(item.hostname)
          )
        ) {
          data.push(address);
        }
      });
      resolve(data);
    });
  });
}