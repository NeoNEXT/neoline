import { ContractParamJson } from '@cityofzion/neon-core-neo3/lib/sc';
import { SignerLike } from '@cityofzion/neon-core-neo3/lib/tx';

export enum requestTargetN3 {
  Provider = 'neoline.target_provider_n3',
  Networks = 'neoline.target_networks_n3',
  Account = 'neoline.target_account_n3',
  AccountPublicKey = 'neoline.target_public_key_n3',
  Storage = 'neoline.target_storage_n3',
  InvokeRead = 'neoline.target_invoke_read_n3',
  InvokeReadMulti = 'neoline.target_invoke_read_multi_n3',
  VerifyMessage = 'neoline.target_verify_message_n3',
  VerifyMessageV2 = 'neoline.target_verify_message_v2_n3',
  Transaction = 'neoline.target_transaction_n3',
  Block = 'neoline.target_block_n3',
  ApplicationLog = 'neoline.target_application_log_n3',
  Invoke = 'neoline.target_invoke_n3',
  InvokeMulti = 'neoline.target_invoke_multi_n3',
  SignMessageWithoutSalt = 'neoline.target_sign_message_without_salt_n3',
  SignMessageWithoutSaltV2 = 'neoline.target_sign_message_without_salt_v2_n3',
  SignMessage = 'neoline.target_sign_message_n3',
  SignMessageV2 = 'neoline.target_sign_message_v2_n3',
  SignTransaction = 'neoline.target_sign_transaction_n3',
  Deploy = 'neoline.target_deploy_n3',
  Send = 'neoline.target_send_n3',
  Connect = 'neoline.target_connect_n3',
  Login = 'neoline.target_login_n3',
  Balance = 'neoline.target_balance_n3',
  InvokeMultiple = 'neoline.target_invoke_multiple_n3',
  PickAddress = 'neoline.target_pick_address_n3',
  AddressToScriptHash = 'neoline.target_address_toScriptHash_n3',
  ScriptHashToAddress = 'neoline.target_scriptHash_toAddress_n3',
  WalletSwitchNetwork = 'neoline.target_wallet_switch_network_n3',
  WalletSwitchAccount = 'neoline.target_wallet_switch_account_n3',
}

export enum EVENT {
  READY = 'NEOLine.N3.EVENT.READY',
}

// requets params
export interface Signers {
  account: string;
  scopes: 0 | 1 | 16 | 32 | 128;
  allowedContracts?: string;
  allowedGroups?: string;
}

export interface N3BalanceRequest {
  contracts: string[];
  address: string;
}

export interface N3AddressToScriptHash {
  address: string;
}

export interface N3ScriptHashToAddress {
  scriptHash: string;
}

export interface N3BalanceArgs {
  params: N3BalanceRequest[];
  network?: string;
}
export interface N3TransactionArgs {
  txid: string;
  network?: string;
}

export interface N3GetBlockInputArgs {
  blockHeight: string;
  network?: string;
}

export interface N3ApplicationLogArgs {
  txid: string;
  network?: string;
}
export interface N3GetStorageArgs {
  scriptHash: string;
  key: string;
  network?: string;
}

export interface N3VerifyMessageArgs {
  message: string; // Salt prefix + original message
  data: string; // Signed message
  publicKey: string; // Public key of account that signed message
}

export interface N3InvokeReadArgs {
  scriptHash: string;
  operation: string;
  args?: [];
  signers: SignerLike[];
  network?: string;
}

export interface N3InvokeReadMultiArgs {
  scriptHash: string; // script hash of the smart contract to invoke a read on
  operation: string; // operation on the smart contract to call
  invokeReadArgs: ContractParamJson[];
  signers: SignerLike[];
  network?: string;
}

export interface N3InvokeArgs {
  scriptHash: string;
  operation: string;
  args: ContractParamJson[];
  fee?: string;
  signers: SignerLike[];
}

export interface N3InvokeMultiArg {
  scriptHash: string; // script hash of the smart contract to invoke a read on
  operation: string; // operation on the smart contract to call
  args: ContractParamJson[]; // any input arguments for the operation
}

export interface N3InvokeMultipleArgs {
  scriptHash: string;
  operation: string;
  invokeArgs: Array<N3InvokeMultiArg>;
  fee?: string;
  signers: SignerLike[];
}

export interface N3SendArgs {
  fromAddress: string;
  toAddress: string;
  asset: string;
  amount: string;
  remark: string;
  fee: string;
  network: string;
  broadcastOverride: boolean;
}

// result
export interface N3Balance {
  contract: string;
  symbol: string;
  amount: string;
}

export interface N3BalanceResults {
  [address: string]: N3Balance[];
}
interface N3Transfer {
  hash: string;
  src: string;
  contract: string;
  from: string;
  to: string;
  amount: string;
}

export interface N3TransactionDetails {
  hash: string;
  size: number;
  sys_fee: string;
  net_fee: string;
  block_index: number;
  block_time: number;
  version: number;
  transfers: N3Transfer[];
}

export interface N3StorageResponse {
  result: string;
}

export interface N3Response {
  result: boolean;
}

export interface N3SendOutput {
  txid: string;
  nodeURL: string;
}
