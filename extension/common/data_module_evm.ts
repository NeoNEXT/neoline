export enum requestTargetEVM {
  request = 'neoline.target_request_evm',
  isConnected = 'neoline.target_isConnected_evm',
}

export enum NEOX_EVENT {
  INIT_CHAIN_ID = 'NEOLine.NEOX.EVENT.INIT_CHAIN_ID',
}

export const RestrictedMethods = Object.freeze({
  eth_accounts: 'eth_accounts',
} as const);

export const MESSAGE_TYPE = {
  ADD_ETHEREUM_CHAIN: 'wallet_addEthereumChain',
  SWITCH_ETHEREUM_CHAIN: 'wallet_switchEthereumChain',
  WATCH_ASSET: 'wallet_watchAsset',
  PERSONAL_SIGN: 'personal_sign',
  ETH_ACCOUNTS: RestrictedMethods.eth_accounts,
  ETH_SIGN_TYPED_DATA_V4: 'eth_signTypedData_v4',
  ETH_REQUEST_ACCOUNTS: 'eth_requestAccounts',
} as const;

/**
 * Ethereum JSON-RPC methods that are known to exist but that we intentionally
 * do not support.
 */
export const UNSUPPORTED_RPC_METHODS = new Set([
  // This is implemented later in our middleware stack – specifically, in
  // eth-json-rpc-middleware – but our UI does not support it.
  'eth_signTransaction' as const,
]);

/**
 * The largest possible chain ID we can handle.
 * Explanation: https://gist.github.com/rekmarks/a47bd5f2525936c4b8eee31a16345553
 */
export const MAX_SAFE_CHAIN_ID = 4503599627370476;
export const UNKNOWN_TICKER_SYMBOL = 'UNKNOWN';

/**
 * All unrestricted methods recognized by the PermissionController.
 * Unrestricted methods are ignored by the permission system, but every
 * JSON-RPC request seen by the permission system must correspond to a
 * restricted or unrestricted method, or the request will be rejected with a
 * "method not found" error.
 */
export const unrestrictedMethods = Object.freeze([
  'eth_blockNumber',
  'eth_call',
  'eth_chainId',
  // 'eth_coinbase',
  // 'eth_decrypt',
  'eth_estimateGas',
  // 'eth_feeHistory',
  'eth_gasPrice',
  'eth_getBalance',
  'eth_getBlockByHash',
  'eth_getBlockByNumber',
  'eth_getBlockTransactionCountByHash',
  'eth_getBlockTransactionCountByNumber',
  'eth_getCode',
  // 'eth_getEncryptionPublicKey',
  'eth_getFilterChanges',
  'eth_getFilterLogs',
  'eth_getLogs',
  // 'eth_getProof',
  'eth_getStorageAt',
  'eth_getTransactionByBlockHashAndIndex',
  'eth_getTransactionByBlockNumberAndIndex',
  'eth_getTransactionByHash',
  'eth_getTransactionCount',
  'eth_getTransactionReceipt',
  'eth_getUncleByBlockHashAndIndex',
  'eth_getUncleByBlockNumberAndIndex',
  'eth_getUncleCountByBlockHash',
  'eth_getUncleCountByBlockNumber',
  // 'eth_getWork',
  // 'eth_hashrate',
  // 'eth_mining',
  'eth_newBlockFilter',
  'eth_newFilter',
  'eth_newPendingTransactionFilter',
  // 'eth_protocolVersion',
  'eth_sendRawTransaction',
  'eth_sendTransaction',
  // 'eth_sign',
  // 'eth_signTypedData',
  // 'eth_signTypedData_v1',
  // 'eth_signTypedData_v3',
  'eth_signTypedData_v4',
  // 'eth_submitHashrate',
  // 'eth_submitWork',
  'eth_syncing',
  'eth_uninstallFilter',
  // 'net_listening',
  // 'net_peerCount',
  'net_version',
  // 'personal_ecRecover',
  'personal_sign',
  'wallet_watchAsset',
  'web3_clientVersion',
  'web3_sha3',
]);

export enum ETH_EOA_SIGN_METHODS {
  PersonalSign = 'personal_sign',
  SignTypedDataV4 = 'eth_signTypedData_v4',
}
