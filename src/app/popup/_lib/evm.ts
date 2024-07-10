import { NetworkType } from './chain';
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
      };
    }
  ];
}

export const DEFAULT_NEOX_RPC_NETWORK: RpcNetwork[] = [
  {
    id: 12227331,
    symbol: 'GAS',
    chainId: 12227331,
    name: 'Neo X TESTNET',
    network: NetworkType.EVM,
    rpcUrl: 'https://neoxseed1.ngd.network',
    explorer: 'https://xt3scan.ngd.network',
    keep: true,
  },
];

const CHAIN_IDS = {
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

const ETH_IMAGE_URL = '/assets/images/token/eth.svg';
const TOKEN_IMAGE_URL_PREFIX = '/assets/images/token/';

export const EVM_TOKEN_IMAGE_URL = {
  [CHAIN_IDS.Ethereum]: {
    [ETH_SOURCE_ASSET_HASH]: ETH_IMAGE_URL,
  },
  [CHAIN_IDS.Arbitrum]: {
    [ETH_SOURCE_ASSET_HASH]: ETH_IMAGE_URL,
  },
  [CHAIN_IDS.Avalanche]: {
    [ETH_SOURCE_ASSET_HASH]: `${TOKEN_IMAGE_URL_PREFIX}/avax.svg`,
  },
  [CHAIN_IDS.Optimism]: {
    [ETH_SOURCE_ASSET_HASH]: ETH_IMAGE_URL,
  },
  [CHAIN_IDS.Base]: {
    [ETH_SOURCE_ASSET_HASH]: ETH_IMAGE_URL,
  },
  [CHAIN_IDS.Polygon]: {
    [ETH_SOURCE_ASSET_HASH]: `${TOKEN_IMAGE_URL_PREFIX}/matic.svg`,
  },
  [CHAIN_IDS.BSC]: {
    [ETH_SOURCE_ASSET_HASH]: `${TOKEN_IMAGE_URL_PREFIX}/bnb.svg`,
  },
  [CHAIN_IDS.Celo]: {
    ['0x471EcE3750Da237f93B8E339c536989b8978a438']: `${TOKEN_IMAGE_URL_PREFIX}/celo.svg`,
  },
  [CHAIN_IDS.Scroll]: {
    [ETH_SOURCE_ASSET_HASH]: ETH_IMAGE_URL,
  },
  [CHAIN_IDS.Metis]: {
    [ETH_SOURCE_ASSET_HASH]: ETH_IMAGE_URL,
  },
  [CHAIN_IDS.ZKsync]: {
    [ETH_SOURCE_ASSET_HASH]: ETH_IMAGE_URL,
  },
  [CHAIN_IDS.Blast]: {
    [ETH_SOURCE_ASSET_HASH]: ETH_IMAGE_URL,
  },
  [CHAIN_IDS.Gnosis]: {
    [ETH_SOURCE_ASSET_HASH]: `${TOKEN_IMAGE_URL_PREFIX}/gnosis.svg`,
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
