import {
  unrestrictedMethods,
  UNSUPPORTED_RPC_METHODS,
} from '../../common/data_module_evm';
import { ethErrors } from 'eth-rpc-errors';
import addEthereumChain from './add-ethereum-chain';
import switchEthereumChain from './switch-ethereum-chain';
import { getCurrentNeoXNetwork } from '../tool';
import { httpPost, httpPostPromise } from '../../common';

const handlers = [addEthereumChain, switchEthereumChain];

export const walletHandlerMap = handlers.reduce((map, handler) => {
  for (const methodName of handler.methodNames) {
    map.set(methodName, handler);
  }
  return map;
}, new Map());

export async function ethereumRPCHandler({ method, params }) {
  if (UNSUPPORTED_RPC_METHODS.has(method)) {
    return Promise.reject(ethErrors.rpc.methodNotSupported());
  }
  if (!unrestrictedMethods.includes(method)) {
    return Promise.reject(ethErrors.rpc.methodNotFound());
  }
  if (method === 'eth_sendTransaction') {
    return;
  }
  const { currNeoXNetwork } = await getCurrentNeoXNetwork();
  const data = { jsonrpc: '2.0', method, params, id: 1 };
  return httpPostPromise(currNeoXNetwork.rpcUrl, data)
    .then((res) => res)
    .catch((error) => Promise.reject(ethErrors.rpc.internal({ data: error })));
}
