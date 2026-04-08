export { Account3, Wallet3, requestTargetN3 } from '../../cross-runtime/neo3-shared';
import { TransactionAttributeJson } from '@cityofzion/neon-core-neo3/lib/tx/components';

export enum EVENT {
  READY = 'NEOLine.N3.EVENT.READY',
  INIT_DAPI = 'NEOLine.N3.EVENT.INIT_DAPI'
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
  attributes?: TransactionAttributeJson[];
  validUntilBlock?: number;
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
  attributes?: TransactionAttributeJson[];
  validUntilBlock?: number;
}

export interface N3CreateTransactionArg {
  scriptHash: string;
  operation: string;
  args: ContractParamJson[];
  abortOnFail?: boolean;
}

export interface N3CreateTransactionArgs {
  invokeArgs: N3CreateTransactionArg[];
  signers: SignerLike[];
  extraSystemFee?: string;
  overrideSystemFee?: string;
  attributes?: TransactionAttributeJson[];
  validUntilBlock?: number;
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

declare class HexString {
  get length(): number;
  get byteLength(): number;
  assert(value: string): void;
  /**
   * Initiate a HexString
   * @param value - a string that contains only [1-9a-f]. Can be prefixed with 0x.
   * @param littleEndian - indicate whether value is little endian or not. default to be false.
   */
  protected constructor(value: string, littleEndian?: boolean);
  toString(): string;
  /**
   * Export as big endian string
   */
  toBigEndian(): string;
  /**
   * Export as little endian string
   */
  toLittleEndian(): string;
  /**
   * Returns a new HexString with internal value reversed hex.
   */
  reversed(): HexString;
  /**
   * Judge if 2 HexString are equal
   */
  equals(other: HexString | string): boolean;
  /**
   * XOR with another HexString to get a new one.
   */
  xor(other: HexString): HexString;
  /**
   * Export as ASCII string
   */
  toAscii(): string;
  /**
   * Export as number
   * @param asLittleEndian - whether export as little endian number, default to be false
   */
  toNumber(asLittleEndian?: boolean): number;
  /**
   * Export to ArrayBuffer in Uint8Array
   * @param asLittleEndian - whether export as little endian array, default to be false
   */
  toArrayBuffer(asLittleEndian?: boolean): Uint8Array;
  /**
   * Export as a base64-encoded string.
   * @param asLittleEndian - whether to encode as little endian, default to be false
   */
  toBase64(asLittleEndian?: boolean): string;
  /**
   * Get HexString instance from a hex string
   * @param str - hexstring
   * @param littleEndian - whether `str` is little endian
   */
  static fromHex(str: string, littleEndian: boolean): HexString;
  static fromHex(str: string | HexString): HexString;
  /**
   * Get HexString instance from a ASCII string
   */
  static fromAscii(str: string): HexString;
  /**
   * Get HexString instance from a number
   * @param littleEndian - whether `num` is little endian
   */
  static fromNumber(num: number): HexString;
  /**
   * Get HexString instance from array buffer
   * @param littleEndian - whether `arr` is little endian
   */
  static fromArrayBuffer(
    arr: ArrayBuffer | ArrayLike<number>,
    littleEndian?: boolean
  ): HexString;
  /**
   * Get HexString instance from a Base64-encoded string
   * @param littleEndian - whether the decoded hexstring is little endian
   */
  static fromBase64(encodedString: string, littleEndian?: boolean): HexString;
}

declare enum WitnessScope {
  None = 0,
  /**
   * CalledByEntry means that this condition must hold: EntryScriptHash == CallingScriptHash
   * No params is needed, as the witness/permission/signature given on first invocation will automatically expire if entering deeper internal invokes
   * This can be default safe choice for native NEO/GAS (previously used on Neo 2 as "attach" mode)
   */
  CalledByEntry = 1,
  /**
   * Custom hash for contract-specific
   */
  CustomContracts = 16,
  /**
   * Custom pubkey for group members, group can be found in contract manifest
   */
  CustomGroups = 32,
  /**
   * Custom rules for witness to adhere by.
   */
  WitnessRules = 64,
  /**
   * Global allows this witness in all contexts (default Neo2 behavior)
   * This cannot be combined with other flags
   */
  Global = 128,
}

interface BooleanWitnessConditionJson {
  type: 'Boolean';
  expression: boolean;
}
interface NotWitnessConditionJson {
  type: 'Not';
  expression: WitnessConditionJson;
}
interface AndWitnessConditionJson {
  type: 'And';
  expressions: WitnessConditionJson[];
}
interface OrWitnessConditionJson {
  type: 'Or';
  expressions: WitnessConditionJson[];
}
interface ScriptHashWitnessConditionJson {
  type: 'ScriptHash';
  hash: string;
}
interface GroupWitnessConditionJson {
  type: 'Group';
  group: string;
}
interface CalledByEntryWitnessConditionJson {
  type: 'CalledByEntry';
}
interface CalledByContractWitnessConditionJson {
  type: 'CalledByContract';
  hash: string;
}
interface CalledByGroupWitnessConditionJson {
  type: 'CalledByGroup';
  group: string;
}

type WitnessConditionJson =
  | BooleanWitnessConditionJson
  | AndWitnessConditionJson
  | NotWitnessConditionJson
  | OrWitnessConditionJson
  | ScriptHashWitnessConditionJson
  | GroupWitnessConditionJson
  | CalledByEntryWitnessConditionJson
  | CalledByContractWitnessConditionJson
  | CalledByGroupWitnessConditionJson;

interface WitnessRuleJson {
  action: string;
  condition: WitnessConditionJson;
}

interface SignerLike {
  account: string | HexString;
  scopes: number | string | WitnessScope;
  allowedContracts?: (string | HexString)[];
  allowedGroups?: (string | HexString)[];
  rules?: WitnessRuleJson[];
}

type ContractParamMapJson = {
  key: ContractParamJson;
  value: ContractParamJson;
}[];
interface ContractParamJson {
  type: string;
  value?:
    | string
    | boolean
    | number
    | ContractParamJson[]
    | ContractParamMapJson
    | null;
}
