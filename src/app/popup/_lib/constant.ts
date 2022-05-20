import { Asset, NEO, GAS } from '@/models/models';
import { NEO3_CONTRACT, GAS3_CONTRACT } from './neo3';
import { DEFAULT_N2_RPC_NETWORK, DEFAULT_N3_RPC_NETWORK } from './type';

const nameLimitation = [1, 32];
const passwordLimitation = [8, 128];
const pattern = `^.{${passwordLimitation[0]},${passwordLimitation[1]}}$`;
const emailPattern =
    '^[_a-z0-9-]+(.[_a-z0-9-]+)*@[a-z0-9-]+(.[a-z0-9-]+)*(.[a-z]{2,})$';

export const WalletInitConstant = {
    nameLimitation,
    passwordLimitation,
    pattern,
    emailPattern,
};

export enum STORAGE_NAME {
    n2Networks = 'n2Networks',
    n3Networks = 'n3Networks',
    n2SelectedNetworkIndex = 'n2SelectedNetworkIndex',
    n3SelectedNetworkIndex = 'n3SelectedNetworkIndex',
    coinsRate = 'coinsRate',
    fiatRate = 'fiatRate',
    neo3CoinsRate = 'neo3CoinsRate',
    rateCurrency = 'rateCurrency',
    wallet = 'wallet',
    walletArr = 'walletArr',
    'walletArr-Neo3' = 'walletArr-Neo3',
    WIFArr = 'WIFArr',
    'WIFArr-Neo3' = 'WIFArr-Neo3',
    chainType = 'chainType',
    neo3AddressFlag = 'neo3AddressFlag',
    lang = 'lang',
    transaction = 'transaction',
    connectedWebsites = 'connectedWebsites',
    authAddress = 'authAddress',
    InvokeArgsArray = 'InvokeArgsArray',
    walletsStatus = 'walletsStatus',
}

export enum STORAGE_VALUE_TYPE {
    number = 'number',
    string = 'string',
    object = 'object',
    map = 'map',
    boolean = 'boolean',
    array = 'array',
}

export const STORAGE_VALUE_MESSAGE = {
    n2Networks: {
        type: STORAGE_VALUE_TYPE.array,
        isLocal: true,
        default: DEFAULT_N2_RPC_NETWORK,
    },
    n3Networks: {
        type: STORAGE_VALUE_TYPE.array,
        isLocal: true,
        default: DEFAULT_N3_RPC_NETWORK,
    },
    n2SelectedNetworkIndex: {
        type: STORAGE_VALUE_TYPE.number,
        isLocal: true,
        default: 0,
    },
    n3SelectedNetworkIndex: {
        type: STORAGE_VALUE_TYPE.number,
        isLocal: true,
        default: 0,
    },
    coinsRate: {
        type: STORAGE_VALUE_TYPE.object,
        isLocal: false,
    },
    fiatRate: {
        type: STORAGE_VALUE_TYPE.object,
        isLocal: false,
    },
    neo3CoinsRate: {
        type: STORAGE_VALUE_TYPE.object,
        isLocal: false,
    },
    rateCurrency: {
        type: STORAGE_VALUE_TYPE.string,
        isLocal: false,
        default: 'USD',
    },
    wallet: {
        type: STORAGE_VALUE_TYPE.object,
        isLocal: true,
    },
    walletArr: {
        type: STORAGE_VALUE_TYPE.array,
        isLocal: true,
    },
    'walletArr-Neo3': {
        type: STORAGE_VALUE_TYPE.array,
        isLocal: true,
    },
    WIFArr: {
        type: STORAGE_VALUE_TYPE.array,
        isLocal: true,
    },
    'WIFArr-Neo3': {
        type: STORAGE_VALUE_TYPE.array,
        isLocal: true,
    },
    chainType: {
        type: STORAGE_VALUE_TYPE.string,
        isLocal: true,
    },
    neo3AddressFlag: {
        type: STORAGE_VALUE_TYPE.boolean,
        isLocal: true,
    },
    lang: {
        type: STORAGE_VALUE_TYPE.string,
        isLocal: false,
        default: 'en',
    },
    transaction: {
        type: STORAGE_VALUE_TYPE.object,
        isLocal: false,
    },
    connectedWebsites: {
        type: STORAGE_VALUE_TYPE.object,
        isLocal: false,
    },
    authAddress: {
        type: STORAGE_VALUE_TYPE.object,
        isLocal: false,
    },
    InvokeArgsArray: {
        type: STORAGE_VALUE_TYPE.array,
        isLocal: true,
    },
    walletsStatus: {
        type: STORAGE_VALUE_TYPE.object,
        isLocal: true,
    },
};

interface DefaultAsset {
    NEO: Asset;
    GAS: Asset;
}

export const DEFAULT_NEO2_ASSETS: DefaultAsset = {
    NEO: {
        asset_id: NEO,
        symbol: 'NEO',
        decimals: 0,
        balance: '0',
    },
    GAS: {
        asset_id: GAS,
        symbol: 'GAS',
        decimals: 8,
        balance: '0',
    },
};

export const DEFAULT_NEO3_ASSETS: DefaultAsset = {
    NEO: {
        asset_id: NEO3_CONTRACT,
        symbol: 'NEO',
        decimals: 0,
        balance: '0',
    },
    GAS: {
        asset_id: GAS3_CONTRACT,
        symbol: 'GAS',
        decimals: 8,
        balance: '0',
    },
};
