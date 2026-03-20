import { N3MainnetNetwork, N3TestnetNetwork } from './constants';

export type Base64Encoded = string;
export type Address = string;
export type UInt160 = string;
export type UInt256 = string;
export type ECPoint = string;
export type Integer = number | string;
type HexString = string;
export type Network = number;

export enum NetworkEnum {
  MAINNET = N3MainnetNetwork.magicNumber,
  TESTNET = N3TestnetNetwork.magicNumber,
}

export enum EventNameEnum {
  ACCOUNTS_CHANGED = 'accountchanged',
  NETWORK_CHANGED = 'networkchanged',
}

type ContractParameterType =
  | 'Any'
  | 'Boolean'
  | 'Integer'
  | 'ByteArray'
  | 'String'
  | 'Hash160'
  | 'Hash256'
  | 'PublicKey'
  | 'Signature'
  | 'Array'
  | 'Map'
  | 'InteropInterface'
  | 'Void';

type Parameter = {
  name?: string;
  type: ContractParameterType;
};

export type Account = {
  hash: UInt160;
  address: Address;
  label?: string;
  contract?: {
    script?: Base64Encoded;
    parameters: Parameter[];
    deployed: boolean;
  };
  extra?: any;
};

type WitnessScope =
  | 'None'
  | 'CalledByEntry'
  | 'CustomContracts'
  | 'CustomGroups'
  | 'WitnessRules'
  | 'Global'
  | 'CalledByEntry, CustomContracts'
  | 'CalledByEntry, CustomGroups'
  | 'CalledByEntry, WitnessRules'
  | 'CustomContracts, CustomGroups'
  | 'CustomContracts, WitnessRules'
  | 'CustomGroups, WitnessRules'
  | 'CalledByEntry, CustomContracts, CustomGroups'
  | 'CalledByEntry, CustomContracts, WitnessRules'
  | 'CalledByEntry, CustomGroups, WitnessRules'
  | 'CustomContracts, CustomGroups, WitnessRules'
  | 'CalledByEntry, CustomContracts, CustomGroups, WitnessRules';

type WitnessConditionType =
  | 'Boolean'
  | 'Not'
  | 'And'
  | 'Or'
  | 'ScriptHash'
  | 'Group'
  | 'CalledByEntry'
  | 'CalledByContract'
  | 'CalledByGroup';

interface WitnessCondition {
  type: WitnessConditionType;
}

type WitnessRule = {
  action: 'Deny' | 'Allow';
  condition: WitnessCondition;
};

export type Signer = {
  account: UInt160;
  scopes: WitnessScope;
  allowedContracts?: UInt160[];
  allowedGroups?: ECPoint[];
  rules?: WitnessRule[];
};

type TransactionAttributeType = 'HighPriority' | 'OracleResponse';

interface TransactionAttribute {
  type: TransactionAttributeType;
}

export type Transaction = {
  hash: UInt256;
  size: number;
  blockHash: UInt256;
  blockTime: number;
  confirmations: number;
  version: number;
  nonce: number;
  systemFee: Integer;
  networkFee: Integer;
  validUntilBlock: number;
  sender: UInt160;
  signers: Signer[];
  attributes: TransactionAttribute[];
  script: Base64Encoded;
};

export type Block = {
  hash: UInt256;
  size: number;
  confirmations: number;
  nextBlockHash?: UInt256;
  version: number;
  previousBlockHash: UInt256;
  merkleRoot: UInt256;
  time: number;
  nonce: HexString;
  index: number;
  primary: number;
  nextConsensus: UInt160;
  tx: Transaction[];
};

type TriggerType =
  | 'OnPersist'
  | 'PostPersist'
  | 'Verification'
  | 'Application';

type VMState = 'NONE' | 'HALT' | 'FAULT' | 'BREAK';

type StackItemType =
  | 'Any'
  | 'Pointer'
  | 'Boolean'
  | 'Integer'
  | 'ByteString'
  | 'Buffer'
  | 'Array'
  | 'Struct'
  | 'Map'
  | 'InteropInterface';

type StackItem = {
  type: StackItemType;
  value?: any;
};

type Notification = {
  contract: UInt160;
  eventname: string;
  state: StackItem;
};

export type ApplicationLog = {
  txid: UInt256;
  executions: Array<{
    trigger: TriggerType;
    vmstate: VMState;
    exception?: string;
    gasconsumed: Integer;
    stack: StackItem[];
    notifications: Notification[];
  }>;
};

export type Token = {
  symbol: string;
  decimals: number;
  totalSupply: Integer;
};

export type Argument = {
  type: ContractParameterType;
  value?: any;
};

export type InvocationArguments = {
  hash: UInt160;
  operation: string;
  args?: Argument[];
  abortOnFail?: boolean;
};

export type InvocationResult = {
  script: Base64Encoded;
  state: VMState;
  gasconsumed: Integer;
  exception?: string;
  notifications: Notification[];
  stack: StackItem[];
};

export type FeeOptions = {
  suggestedSystemFee?: Integer;
  extraSystemFee?: Integer;
};

export type ContractParametersContext = {
  type: 'Neo.Network.P2P.Payloads.Transaction';
  hash: UInt256;
  data: Base64Encoded;
  items: Record<
    UInt160,
    {
      script: Base64Encoded;
      parameters: Argument[];
      signatures: Record<ECPoint, Base64Encoded>;
    }
  >;
  network: Network;
};

export type SignOptions = {
  isBase64Encoded?: boolean;
  isTypedData?: boolean;
  isLedgerCompatible?: boolean;
};

export type SignedMessage = {
  payload: Base64Encoded;
  signature: Base64Encoded;
  account: UInt160;
  pubkey: ECPoint;
};

export type AuthenticationChallengePayload = {
  action: 'Authentication';
  grant_type: 'Signature';
  allowed_algorithms: ['ECDSA-P256'];
  domain: string;
  networks: Network[];
  nonce: string;
  timestamp: number;
};

export type AuthenticationResponsePayload = {
  algorithm: 'ECDSA-P256';
  network: Network;
  pubkey: ECPoint;
  address: Address;
  nonce: string;
  timestamp: number;
  signature: Base64Encoded;
};
