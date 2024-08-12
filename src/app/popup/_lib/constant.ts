import { Asset, NEO, GAS } from '@/models/models';
import { DEFAULT_NEOX_RPC_NETWORK } from './evm';
import { NEO3_CONTRACT, GAS3_CONTRACT } from './neo3';
import {
  DEFAULT_N2_RPC_NETWORK,
  DEFAULT_N3_RPC_NETWORK,
  DEFAULT_RPC_URLS,
} from './type';

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

export const SECRET_PASSPHRASE = 'secret key neoline';

export enum STORAGE_NAME {
  n2Networks = 'n2Networks',
  n3Networks = 'n3Networks',
  neoXNetworks = 'neoXNetworks',
  n2SelectedNetworkIndex = 'n2SelectedNetworkIndex',
  n3SelectedNetworkIndex = 'n3SelectedNetworkIndex',
  neoXSelectedNetworkIndex = 'neoXSelectedNetworkIndex',
  wallet = 'wallet',
  walletArr = 'walletArr',
  'walletArr-Neo3' = 'walletArr-Neo3',
  'walletArr-NeoX' = 'walletArr-NeoX',
  WIFArr = 'WIFArr',
  'WIFArr-Neo3' = 'WIFArr-Neo3',
  chainType = 'chainType',

  neo3AddressFlag = 'neo3AddressFlag', // Fix the wallet created by neon-core@5-next.4 neon-core@5-next.7
  watch = 'watch',
  nftWatch = 'nft_watch',
  connectedWebsites = 'connectedWebsites', // dAPi connect status
  authAddress = 'authAddress',
  InvokeArgsArray = 'InvokeArgsArray', // dAPi N3 invoke args
  isBackupLater = 'isBackupLater', // show backup tip if create wallet
  hasLoginAddress = 'hasLoginAddress', // has login address
  shouldFindNode = 'shouldFindNode',
  rpcUrls = 'rpcUrls',
  onePassword = 'onePassword', // Whether the current is one password mode
  onePassCheckAddresses = 'onePassCheckAddresses', // one password mode, save verified address
  addressBook = 'addressBook',

  rateCurrency = 'rateCurrency',
  theme ='theme', // light or dark theme
  lang = 'lang',
  evmCustomNonce = 'evmCustomNonce',

  transaction = 'transaction',
  bridgeTransaction = 'bridgeTransaction',
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
  neoXNetworks: {
    type: STORAGE_VALUE_TYPE.array,
    isLocal: true,
    default: DEFAULT_NEOX_RPC_NETWORK,
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
  neoXSelectedNetworkIndex: {
    type: STORAGE_VALUE_TYPE.number,
    isLocal: true,
    default: 0,
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
  'walletArr-NeoX': {
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
  evmCustomNonce: {
    type: STORAGE_VALUE_TYPE.boolean,
    isLocal: false,
    default: false,
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
    type: STORAGE_VALUE_TYPE.object,
    isLocal: true,
  },
  isBackupLater: {
    type: STORAGE_VALUE_TYPE.boolean,
    isLocal: true,
  },
  hasLoginAddress: {
    type: STORAGE_VALUE_TYPE.object,
    isLocal: true,
  },
  shouldFindNode: {
    type: STORAGE_VALUE_TYPE.boolean,
    isLocal: true,
  },
  rpcUrls: {
    type: STORAGE_VALUE_TYPE.object,
    isLocal: true,
    default: DEFAULT_RPC_URLS,
  },
  onePassword: {
    type: STORAGE_VALUE_TYPE.boolean,
    isLocal: true,
  },
  theme: {
    type: STORAGE_VALUE_TYPE.string,
    isLocal: false,
    default: 'light-theme',
  },
  onePassCheckAddresses: {
    type: STORAGE_VALUE_TYPE.object,
    isLocal: true,
  },
  addressBook: {
    type: STORAGE_VALUE_TYPE.object,
    isLocal: true,
  },
  bridgeTransaction: {
    type: STORAGE_VALUE_TYPE.array,
    isLocal: true,
  }
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
