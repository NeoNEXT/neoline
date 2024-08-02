export const NEO =
  '0xc56f33fc6ecfcd0c225c4ab356fee59390af8560be0e930faebe74a6daff7c9b';
export const GAS =
  '0x602c79718b16e442de58778e148d0b1084e3b2dffd5de6b7b16cee7969282de7';
export const NEO3 = '0xef4073a0f2b305a38ec4050e4d3d28bc40ea63f5';
export const GAS3 = '0xd2a4cff31913016155e38e474a2c06d08be276cf';
export enum ChainType {
  Neo2 = 'Neo2',
  Neo3 = 'Neo3',
  NeoX = 'NeoX',
}

export const DEFAULT_NETWORKS = [
  'MainNet',
  'TestNet',
  'N3MainNet',
  'N3TestNet',
  'N3PrivateNet',
];

export enum WitnessScope {
  None = 0,
  CalledByEntry = 1,
  CustomContracts = 16,
  CustomGroups = 32,
  WitnessRules = 64,
  Global = 128,
}

export enum NetworkType {
  MainNet = 'MainNet',
  TestNet = 'TestNet',
  N3MainNet = 'N3MainNet',
  N3TestNet = 'N3TestNet',
  N3PrivateNet = 'N3PrivateNet',
  EVM = 'EVM',
}
export interface RpcNetwork {
  name: string;
  rpcUrl: string;
  network: NetworkType;
  explorer?: string;
  magicNumber?: number;
  chainId: number;
  id: number;
  // evm
  symbol?: string;
  version?: number;
}

const N2_NETWORK_VERSION = 1;
export const N2MainnetNetwork: RpcNetwork = {
  rpcUrl: 'http://seed1.ngd.network:10332',
  name: 'N2 Mainnet',
  explorer: 'https://neo2.neotube.io/',
  network: NetworkType.MainNet,
  chainId: 1,
  id: 1,
  version: N2_NETWORK_VERSION,
};

export const N2testnetNetwork: RpcNetwork = {
  rpcUrl: 'http://seed5.ngd.network:20332',
  name: 'N2 Testnet',
  explorer: '',
  network: NetworkType.TestNet,
  chainId: 2,
  id: 2,
  version: N2_NETWORK_VERSION,
};

export const DEFAULT_N2_RPC_NETWORK: RpcNetwork[] = [
  N2MainnetNetwork,
  N2testnetNetwork,
];

const N3_NETWORK_VERSION = 1;
export const N3MainnetNetwork: RpcNetwork = {
  rpcUrl: 'http://seed1.neo.org:10332',
  name: 'N3 Mainnet',
  magicNumber: 860833102,
  explorer: 'https://neotube.io/',
  network: NetworkType.N3MainNet,
  chainId: 3,
  id: 3,
  version: N3_NETWORK_VERSION,
};

export const N3TestnetNetwork: RpcNetwork = {
  rpcUrl: 'http://seed3t5.neo.org:20332',
  name: 'N3 Testnet',
  magicNumber: 894710606,
  explorer: 'https://testnet.neotube.io/',
  network: NetworkType.N3TestNet,
  chainId: 6,
  id: 6,
  version: N3_NETWORK_VERSION,
};

export const DEFAULT_N3_RPC_NETWORK: RpcNetwork[] = [
  N3MainnetNetwork,
  N3TestnetNetwork,
];

const NEOX_NETWORK_VERSION = 1;
export const NeoXMainnetNetwork: RpcNetwork = {
  id: 47763,
  symbol: 'GAS',
  chainId: 47763,
  name: 'Neo X Mainnet',
  network: NetworkType.EVM,
  rpcUrl: 'https://mainnet-1.rpc.banelabs.org',
  explorer: 'https://xexplorer.neo.org',
  version: NEOX_NETWORK_VERSION,
};
export const NeoXTestnetNetwork: RpcNetwork = {
  id: 12227332,
  symbol: 'GAS',
  chainId: 12227332,
  name: 'Neo X Testnet',
  network: NetworkType.EVM,
  rpcUrl: 'https://neoxt4seed1.ngd.network',
  explorer: 'https://xt4scan.ngd.network',
  version: NEOX_NETWORK_VERSION,
};
export const DEFAULT_NEOX_RPC_NETWORK: RpcNetwork[] = [
  NeoXMainnetNetwork,
  NeoXTestnetNetwork,
];

const N3PrivateNetworkChainId = 0;

export const ALL_CHAINID = [
  N3PrivateNetworkChainId,
  N2MainnetNetwork.chainId,
  N2testnetNetwork.chainId,
  N3MainnetNetwork.chainId,
  N3TestnetNetwork.chainId,
];
export const SECRET_PASSPHRASE = 'secret key neoline';

export const ExcludeWebsite = ['yandex.com', 'google.com'];

export enum STORAGE_NAME {
  InvokeArgsArray = 'InvokeArgsArray',
  hasLoginAddress = 'hasLoginAddress',
  shouldFindNode = 'shouldFindNode',
  n2Networks = 'n2Networks',
  n3Networks = 'n3Networks',
  neoXNetworks = 'neoXNetworks',
  n2SelectedNetworkIndex = 'n2SelectedNetworkIndex',
  n3SelectedNetworkIndex = 'n3SelectedNetworkIndex',
  neoXSelectedNetworkIndex = 'neoXSelectedNetworkIndex',
  chainType = 'chainType',
  wallet = 'wallet',
  walletArr = 'walletArr',
  'walletArr-Neo3' = 'walletArr-Neo3',
  'walletArr-NeoX' = 'walletArr-NeoX',
  WIFArr = 'WIFArr',
  'WIFArr-Neo3' = 'WIFArr-Neo3',
  connectedWebsites = 'connectedWebsites',
}
