import addEthereumChain from './add-ethereum-chain';

const handlers = [
  addEthereumChain,
];

export const evmHandlerMap = handlers.reduce((map, handler) => {
  for (const methodName of handler.methodNames) {
    map.set(methodName, handler);
  }
  return map;
}, new Map());
