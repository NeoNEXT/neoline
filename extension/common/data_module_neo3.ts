type ArgumentDataType = 'String' | 'Boolean' | 'Hash160' | 'Hash256' | 'Integer' | 'ByteArray' | 'Array' | 'Address';

export enum requestTargetN3 {
    N3Provider = 'neoline.target_provider_n3',
    N3Networks = 'neoline.target_networks_n3',
    N3Account = 'neoline.target_account_n3',
    N3AccountPublicKey = 'neoline.target_public_key_n3',
    N3Storage = 'neoline.target_storage_n3',
    N3InvokeRead = 'neoline.target_invoke_read_n3',
    N3InvokeReadMulti = 'neoline.target_invoke_read_multi_n3',
    N3VerifyMessage = 'neoline.target_verify_message_n3',
    N3Transaction = 'neoline.target_transaction_n3',
    N3Block = 'neoline.target_block_n3',
    N3ApplicationLog = 'neoline.target_application_log_n3',
    N3Invoke = 'neoline.target_invoke_n3',
    N3InvokeMulti = 'neoline.target_invoke_multi_n3',
    N3SignMessage = 'neoline.target_sign_message_n3',
    N3Deploy = 'neoline.target_deploy_n3',
    N3Send = 'neoline.target_send_n3',
    N3Connect = 'neoline.target_connect_n3',
    N3AuthState = 'neoline.target_auth_state_n3',
    N3Login = 'neoline.target_login_n3',
    N3Balance = 'neoline.target_balance_n3',
    N3InvokeMultiple = 'neoline.target_invoke_multiple_n3',
}

interface TxHashAttribute extends N3Argument {
    txAttrUsage: 'Hash1' | 'Hash2' | 'Hash3' | 'Hash4' | 'Hash5' | 'Hash6' | 'Hash7' | 'Hash8' |
    'Hash9' | 'Hash10' | 'Hash11' | 'Hash12' | 'Hash13' | 'Hash14' | 'Hash15';
}

// requets params
export interface Signers {
    account: string;
    scopes: string;
}

export interface N3Argument {
    type: ArgumentDataType;
    value: any;
}

export interface N3BalanceArgs {
    address: string;
    network?: string;
}
export interface N3TransactionArgs {
    address: string;
    assetId: string;
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

export interface N3InvokeReadArgs {
    scriptHash: string;
    operation: string;
    args: N3Argument[];
    signers: Signers[];
    network?: string;
}

export interface N3InvokeReadMultiArgs {
    scriptHash: string; // script hash of the smart contract to invoke a read on
    operation: string; // operation on the smart contract to call
    invokeReadArgs: N3Argument[];
    signers: Signers[];
    network?: string;
}

export interface N3InvokeArgs {
    scriptHash: string;
    operation: string;
    args: N3Argument[];
    signers:Signers[];
}

export interface N3InvokeMultiArg {
    scriptHash: string; // script hash of the smart contract to invoke a read on
    operation: string; // operation on the smart contract to call
    args: N3Argument[]; // any input arguments for the operation
}

export interface N3InvokeMultipleArgs {
    scriptHash: string;
    operation: string;
    invokeArgs: Array<N3InvokeMultiArg>;
    fee?: string;
    txHashAttributes?: TxHashAttribute[];
    signers: Signers[];
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
export interface N3BalanceResults {
    balance: string;
    contract: string;
    decimals: number;
    image_url: string;
    name: string;
    symbol: string;
    type: string;
}
interface N3Transfer {
    txid: string;
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
    transfer: N3Transfer[]
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
