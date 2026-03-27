export const ERRORS = {
  NO_PROVIDER: {
    type: 'NO_PROVIDER',
    description: 'Could not find an instance of the dAPI in the webpage',
    data: null,
  },
  CONNECTION_DENIED: {
    type: 'CONNECTION_DENIED',
    description: 'The dAPI provider refused to process this request',
    data: null,
  },
  RPC_ERROR: {
    type: 'RPC_ERROR',
    description: 'An RPC error occurred when submitting the request',
    data: null,
  },
  MALFORMED_INPUT: {
    type: 'MALFORMED_INPUT',
    description: 'Please check your input',
    data: null,
  },
  CANCELLED: {
    type: 'CANCELED',
    description: 'The user cancels, or refuses the dapps request',
    data: null,
  },
  INSUFFICIENT_FUNDS: {
    type: 'INSUFFICIENT_FUNDS',
    description:
      'The user does not have a sufficient balance to perform the requested action',
    data: null,
  },
  FAILED: {
    type: 'FAILED',
    description: 'The contract execution failed.',
    data: null,
  },
  CHAIN_NOT_MATCH: {
    type: 'CHAIN_NOT_MATCH',
    description:
      'The currently opened chain does not match the type of the call chain, please switch the chain.',
    data: null,
  },
  UNAUTHORIZED: {
    type: 'UNAUTHORIZED',
    description:
      'The requested account is not authorized, or the wallet is locked.',
    data: null,
  },
  UNKNOWN: {
    type: 'UNKNOWN',
    description: 'unknown error',
    data: null,
  },
};

export enum EVENT {
  READY = 'NEOLine.NEO.EVENT.READY',
  ACCOUNT_CHANGED = 'NEOLine.NEO.EVENT.ACCOUNT_CHANGED',
  CONNECTED = 'NEOLine.NEO.EVENT.CONNECTED',
  DISCONNECTED = 'NEOLine.NEO.EVENT.DISCONNECTED',
  NETWORK_CHANGED = 'NEOLine.NEO.EVENT.NETWORK_CHANGED',
  BLOCK_HEIGHT_CHANGED = 'NEOLine.NEO.EVENT.BLOCK_HEIGHT_CHANGED',
  TRANSACTION_CONFIRMED = 'NEOLine.NEO.EVENT.TRANSACTION_CONFIRMED',
}

export enum requestTarget {
  Provider = 'neoline.target_provider',
  Networks = 'neoline.target_networks',
  Account = 'neoline.target_account',
  AccountPublicKey = 'neoline.target_public_key',
  Balance = 'neoline.target_balance',
  Storage = 'neoline.target_storage',
  InvokeRead = 'neoline.target_invoke_read',
  InvokeReadMulti = 'neoline.target_invoke_read_multi',
  VerifyMessage = 'neoline.target_verify_message',
  Transaction = 'neoline.target_transaction',
  Block = 'neoline.target_block',
  ApplicationLog = 'neoline.target_application_log',
  Invoke = 'neoline.target_invoke',
  InvokeMulti = 'neoline.target_invoke_multi',
  SignMessage = 'neoline.target_sign_message',
  Deploy = 'neoline.target_deploy',
  Send = 'neoline.target_send',
  Connect = 'neoline.target_connect',
  Login = 'neoline.target_login',
  PickAddress = 'neoline.target_pick_address',
  WalletSwitchNetwork = 'neoline.target_wallet_switch_network',
  WalletSwitchAccount = 'neoline.target_wallet_switch_account',
  SwitchRequestChain = 'neoline.target_switch_request_chain',
}
