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
