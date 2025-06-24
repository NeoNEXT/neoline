import { NetworkType } from './chain';
import { HardwareDevice } from './ledger';
import { RpcNetwork } from './type';

export const ETH_SOURCE_ASSET_HASH =
  '0x0000000000000000000000000000000000000000';

export interface EvmWalletJSON {
  crypto?: any;
  id?: string;
  version?: number;
  address?: string;
  name: string;
  accounts: [
    {
      address: string;
      extra: {
        publicKey: string;
        isHDWallet?: boolean;
        hdWalletIndex?: number;
        hasBackup?: boolean;
        ledgerSLIP44?: string;
        ledgerAddressIndex?: number;
        device?: HardwareDevice;
      };
    }
  ];
}

const NEOX_NETWORK_VERSION = 3;
export const NeoXMainnetNetwork: RpcNetwork = {
  id: 47763,
  symbol: 'GAS',
  chainId: 47763,
  name: 'Neo X Mainnet',
  network: NetworkType.EVM,
  rpcUrl: 'https://mainnet-1.rpc.banelabs.org',
  rpcUrlArr: [
    { url: 'https://mainnet-1.rpc.banelabs.org', isDefault: true },
    { url: 'https://mainnet-2.rpc.banelabs.org', isDefault: true },
  ],
  explorer: 'https://neoxscan.ngd.network',
  version: NEOX_NETWORK_VERSION,
  isDefault: true,
};
export const NeoXTestnetNetwork: RpcNetwork = {
  id: 12227332,
  symbol: 'GAS',
  chainId: 12227332,
  name: 'Neo X Testnet',
  network: NetworkType.EVM,
  rpcUrl: 'https://neoxt4seed1.ngd.network',
  rpcUrlArr: [
    { url: 'https://neoxt4seed1.ngd.network', isDefault: true },
    { url: 'https://testnet.rpc.banelabs.org', isDefault: true },
  ],
  explorer: 'https://xt4scan.ngd.network',
  version: NEOX_NETWORK_VERSION,
  isDefault: true,
};
export const DEFAULT_NEOX_RPC_NETWORK: RpcNetwork[] = [
  NeoXMainnetNetwork,
  NeoXTestnetNetwork,
];

const CHAIN_IDS = {
  NeoX: NeoXMainnetNetwork.chainId,
  Ethereum: 1,
  Arbitrum: 42161,
  Avalanche: 43114,
  Optimism: 10,
  Base: 8453,
  Polygon: 137,
  BSC: 56,
  Celo: 42220,
  Scroll: 534352,
  Metis: 1088,
  ZKsync: 324,
  Blast: 81457,
  Gnosis: 100,
} as const;

const ETH_IMAGE_URL = '/assets/images/token/eth.webp';
const USDC_IMAGE_URL = '/assets/images/token/usdc.webp';
const USDT_IMAGE_URL = '/assets/images/token/usdt.webp';
const TOKEN_IMAGE_URL_PREFIX = '/assets/images/token/';

export const All_CHAIN_TOKENS = {
  [CHAIN_IDS.NeoX]: {
    [ETH_SOURCE_ASSET_HASH]: {
      symbol: 'GAS',
      address: ETH_SOURCE_ASSET_HASH,
      logo: TOKEN_IMAGE_URL_PREFIX + `gas.svg`,
    },
    '0xc28736dc83f4fd43d6fb832Fd93c3eE7bB26828f': {
      symbol: 'NEO',
      address: '0xc28736dc83f4fd43d6fb832Fd93c3eE7bB26828f',
      logo: TOKEN_IMAGE_URL_PREFIX + `neo.png`,
    },
  },
  [CHAIN_IDS.Ethereum]: {
    [ETH_SOURCE_ASSET_HASH]: {
      symbol: 'ETH',
      address: ETH_SOURCE_ASSET_HASH,
      logo: ETH_IMAGE_URL,
    },
    '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48': {
      symbol: 'USDC',
      address: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
      logo: USDC_IMAGE_URL,
    },
    '0xdAC17F958D2ee523a2206206994597C13D831ec7': {
      symbol: 'USDT',
      address: '0xdAC17F958D2ee523a2206206994597C13D831ec7',
      logo: USDT_IMAGE_URL,
    },
  },
  [CHAIN_IDS.Avalanche]: {
    [ETH_SOURCE_ASSET_HASH]: {
      symbol: 'AVAX',
      address: ETH_SOURCE_ASSET_HASH,
      logo: TOKEN_IMAGE_URL_PREFIX + `avax.webp`,
    },
    '0xB97EF9Ef8734C71904D8002F8b6Bc66Dd9c48a6E': {
      symbol: 'USDC',
      address: '0xB97EF9Ef8734C71904D8002F8b6Bc66Dd9c48a6E',
      logo: USDC_IMAGE_URL,
    },
    '0x9702230A8Ea53601f5cD2dc00fDBc13d4dF4A8c7': {
      symbol: 'USDT',
      address: '0x9702230A8Ea53601f5cD2dc00fDBc13d4dF4A8c7',
      logo: USDT_IMAGE_URL,
    },
  },
  [CHAIN_IDS.Scroll]: {
    [ETH_SOURCE_ASSET_HASH]: {
      symbol: 'ETH',
      address: ETH_SOURCE_ASSET_HASH,
      logo: ETH_IMAGE_URL,
    },
    '0x06eFdBFf2a14a7c8E15944D1F4A48F9F95F663A4': {
      symbol: 'USDC',
      address: '0x06eFdBFf2a14a7c8E15944D1F4A48F9F95F663A4',
      logo: USDC_IMAGE_URL,
    },
    '0xf55BEC9cafDbE8730f096Aa55dad6D22d44099Df': {
      symbol: 'USDT',
      address: '0xf55BEC9cafDbE8730f096Aa55dad6D22d44099Df',
      logo: TOKEN_IMAGE_URL_PREFIX + 'scroll-usdt.png',
    },
  },
  [CHAIN_IDS.Arbitrum]: {
    [ETH_SOURCE_ASSET_HASH]: {
      symbol: 'ETH',
      address: ETH_SOURCE_ASSET_HASH,
      logo: ETH_IMAGE_URL,
    },
    '0xaf88d065e77c8cC2239327C5EDb3A432268e5831': {
      symbol: 'USDC',
      address: '0xaf88d065e77c8cC2239327C5EDb3A432268e5831',
      logo: USDC_IMAGE_URL,
    },
    '0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9': {
      symbol: 'USDT',
      address: '0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9',
      logo: USDT_IMAGE_URL,
    },
  },
  [CHAIN_IDS.Optimism]: {
    [ETH_SOURCE_ASSET_HASH]: {
      symbol: 'ETH',
      address: ETH_SOURCE_ASSET_HASH,
      logo: ETH_IMAGE_URL,
    },
    '0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85': {
      symbol: 'USDC',
      address: '0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85',
      logo: USDC_IMAGE_URL,
    },
    '0x94b008aA00579c1307B0EF2c499aD98a8ce58e58': {
      symbol: 'USDT',
      address: '0x94b008aA00579c1307B0EF2c499aD98a8ce58e58',
      logo: USDT_IMAGE_URL,
    },
  },
  [CHAIN_IDS.BSC]: {
    [ETH_SOURCE_ASSET_HASH]: {
      symbol: 'BNB',
      address: ETH_SOURCE_ASSET_HASH,
      logo: TOKEN_IMAGE_URL_PREFIX + 'bnb.webp',
    },
    '0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d': {
      symbol: 'USDC',
      address: '0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d',
      logo: USDC_IMAGE_URL,
    },
    '0x55d398326f99059fF775485246999027B3197955': {
      symbol: 'USDT',
      address: '0x55d398326f99059fF775485246999027B3197955',
      logo: USDT_IMAGE_URL,
    },
    '0xe9e7CEA3DedcA5984780Bafc599bD69ADd087D56': {
      symbol: 'BUSD',
      address: '0xe9e7CEA3DedcA5984780Bafc599bD69ADd087D56',
      logo: TOKEN_IMAGE_URL_PREFIX + 'busd.webp',
    },
  },
  [CHAIN_IDS.Base]: {
    [ETH_SOURCE_ASSET_HASH]: {
      symbol: 'ETH',
      address: ETH_SOURCE_ASSET_HASH,
      logo: ETH_IMAGE_URL,
    },
    '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913': {
      symbol: 'USDC',
      address: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
      logo: USDC_IMAGE_URL,
    },
  },
  [CHAIN_IDS.Polygon]: {
    [ETH_SOURCE_ASSET_HASH]: {
      symbol: 'MATIC',
      address: ETH_SOURCE_ASSET_HASH,
      logo: TOKEN_IMAGE_URL_PREFIX + 'matic.webp',
    },
    '0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359': {
      symbol: 'USDC',
      address: '0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359',
      logo: USDC_IMAGE_URL,
    },
    '0xc2132D05D31c914a87C6611C10748AEb04B58e8F': {
      symbol: 'USDT',
      address: '0xc2132D05D31c914a87C6611C10748AEb04B58e8F',
      logo: USDT_IMAGE_URL,
    },
  },
  [CHAIN_IDS.Celo]: {
    '0x471EcE3750Da237f93B8E339c536989b8978a438': {
      symbol: 'CELO',
      address: '0x471EcE3750Da237f93B8E339c536989b8978a438',
      logo: TOKEN_IMAGE_URL_PREFIX + 'celo.webp',
    },
    '0x765DE816845861e75A25fCA122bb6898B8B1282a': {
      symbol: 'cUSD',
      address: '0x765DE816845861e75A25fCA122bb6898B8B1282a',
      logo: TOKEN_IMAGE_URL_PREFIX + 'cusd.webp',
    },
  },
  [CHAIN_IDS.Metis]: {
    [ETH_SOURCE_ASSET_HASH]: {
      symbol: 'METIS',
      address: ETH_SOURCE_ASSET_HASH,
      logo: TOKEN_IMAGE_URL_PREFIX + 'metis.webp',
    },
    '0xEA32A96608495e54156Ae48931A7c20f0dcc1a21': {
      symbol: 'm.USDC',
      address: '0xEA32A96608495e54156Ae48931A7c20f0dcc1a21',
      logo: USDC_IMAGE_URL,
    },
    '0xbB06DCA3AE6887fAbF931640f67cab3e3a16F4dC': {
      symbol: 'm.USDT',
      address: '0xbB06DCA3AE6887fAbF931640f67cab3e3a16F4dC',
      logo: USDT_IMAGE_URL,
    },
  },
  [CHAIN_IDS.ZKsync]: {
    [ETH_SOURCE_ASSET_HASH]: {
      symbol: 'ETH',
      address: ETH_SOURCE_ASSET_HASH,
      logo: ETH_IMAGE_URL,
    },
    '0x1d17CBcF0D6D143135aE902365D2E5e2A16538D4': {
      symbol: 'USDC',
      address: '0x1d17CBcF0D6D143135aE902365D2E5e2A16538D4',
      logo: USDC_IMAGE_URL,
    },
    '0x493257fD37EDB34451f62EDf8D2a0C418852bA4C': {
      symbol: 'USDT',
      address: '0x493257fD37EDB34451f62EDf8D2a0C418852bA4C',
      logo: ETH_IMAGE_URL,
    },
  },
  [CHAIN_IDS.Blast]: {
    [ETH_SOURCE_ASSET_HASH]: {
      symbol: 'ETH',
      address: ETH_SOURCE_ASSET_HASH,
      logo: ETH_IMAGE_URL,
    },
    '0x4300000000000000000000000000000000000003': {
      symbol: 'USDB',
      address: '0x4300000000000000000000000000000000000003',
      logo: TOKEN_IMAGE_URL_PREFIX + 'usdb.webp',
    },
  },
  [CHAIN_IDS.Gnosis]: {
    [ETH_SOURCE_ASSET_HASH]: {
      symbol: 'xDai',
      address: ETH_SOURCE_ASSET_HASH,
      logo: TOKEN_IMAGE_URL_PREFIX + 'xdai.png',
    },
    '0xDDAfbb505ad214D7b80b1f830fcCc89B60fb7A83': {
      symbol: 'USDC',
      address: '0xDDAfbb505ad214D7b80b1f830fcCc89B60fb7A83',
      logo: USDC_IMAGE_URL,
    },
    '0x4ECaBa5870353805a9F068101A40E0f32ed605C6': {
      symbol: 'USDT',
      address: '0x4ECaBa5870353805a9F068101A40E0f32ed605C6',
      logo: USDT_IMAGE_URL,
    },
  },
};

//#region opensea chains
interface OpenseaChains {
  [key: number]: {
    name: string;
    value: string;
  };
}

// mainnet
export const OPENSEA_MAINNET_CHAINS: OpenseaChains = {
  1: {
    name: 'Ethereum Mainnet',
    value: 'ethereum',
  },
  137: {
    name: 'Polygon Matic',
    value: 'matic',
  },
  8217: {
    name: 'Klaytn',
    value: 'klaytn',
  },
  56: {
    name: 'BNB Chain',
    value: 'bsc',
  },
  42161: {
    name: 'Arbitrum',
    value: 'arbitrum',
  },
  42170: {
    name: 'Arbitrum Nova',
    value: 'arbitrum_nova',
  },
  43114: {
    name: 'Avalanche',
    value: 'avalanche',
  },
  10: {
    name: 'Optimism',
    value: 'optimism',
  },
  245022934: {
    name: 'Solana',
    value: 'solana',
  },
  8453: {
    name: 'Base',
    value: 'base',
  },
  81457: {
    name: 'Blast',
    value: 'blast',
  },
  7777777: {
    name: 'Zora',
    value: 'zora',
  },
  1329: {
    name: 'Sei',
    value: 'sei',
  },
};
export const OPENSEA_TESTNET_CHAINS: OpenseaChains = {
  11155111: {
    name: 'Sepolia',
    value: 'sepolia',
  },
  80002: {
    name: 'Polygon Amoy',
    value: 'amoy',
  },
  1001: {
    name: 'Klaytn Baobab',
    value: 'baobab',
  },
  97: {
    name: 'BNB Testnet',
    value: 'bsctestnet',
  },
  421614: {
    name: 'Arbitrum Sepolia',
    value: 'arbitrum_sepolia',
  },
  43113: {
    name: 'Avalanche Fuji',
    value: 'avalanche_fuji',
  },
  11155420: {
    name: 'Optimism Sepolia',
    value: 'optimism_sepolia',
  },
  245022926: {
    name: 'Solana Devnet',
    value: 'soldev',
  },
  84532: {
    name: 'Base Sepolia',
    value: 'base_sepolia',
  },
  168587773: {
    name: 'Blast Sepolia',
    value: 'blast_sepolia',
  },
  999999999: {
    name: 'Zora Sepolia',
    value: 'zora_sepolia',
  },
  1328: {
    name: 'Sei Testnet',
    value: 'sei_testnet',
  },
};
export const OPENSEA_ALL_CHAINS: OpenseaChains = Object.assign(
  {},
  OPENSEA_MAINNET_CHAINS,
  OPENSEA_TESTNET_CHAINS
);
//#endregion
