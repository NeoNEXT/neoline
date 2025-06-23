import { ChainType, NetworkType } from './chain';

export interface GasFeeSpeed {
  slow_price: string;
  propose_price: string;
  fast_price: string;
}

export interface SelectItem {
  type: string;
  name: string;
}

export interface ChainSelectItem extends SelectItem {
  type: ChainType;
}

export interface RpcNetwork {
  name: string;
  rpcUrl: string;
  rpcUrlArr?: string[];
  network: NetworkType;
  explorer?: string;
  magicNumber?: number;
  chainId: number;
  id: number;
  // evm
  symbol?: string;
  version?: number;
}

export const DEFAULT_NETWORKS = [
  'MainNet',
  'TestNet',
  'N3MainNet',
  'N3TestNet',
  'N3PrivateNet',
  'EVM',
];

const N2_NETWORK_VERSION = 2;
export const N2MainnetNetwork: RpcNetwork = {
  rpcUrl: 'http://seed1.ngd.network:10332',
  rpcUrlArr: [
    'http://seed1.ngd.network:10332',
    'http://seed2.ngd.network:10332',
    'http://seed6.ngd.network:10332',
    'http://seed8.ngd.network:10332',
  ],
  name: 'N2 Mainnet',
  explorer: 'https://neo2.neotube.io/',
  network: NetworkType.MainNet,
  chainId: 1,
  id: 1,
  version: N2_NETWORK_VERSION,
};

export const N2testnetNetwork: RpcNetwork = {
  rpcUrl: 'http://seed5.ngd.network:20332',
  rpcUrlArr: [
    'http://seed3.ngd.network:20332',
    'http://seed4.ngd.network:20332',
    'http://seed5.ngd.network:20332',
    'http://seed8.ngd.network:20332',
  ],
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

const N3_NETWORK_VERSION = 2;
export const N3MainnetNetwork: RpcNetwork = {
  rpcUrl: 'http://seed1.neo.org:10332',
  rpcUrlArr: [
    'http://seed1.neo.org:10332',
    'http://seed2.neo.org:10332',
    'http://seed3.neo.org:10332',
    'http://seed4.neo.org:10332',
    'http://seed5.neo.org:10332',
    'https://n3seed1.ngd.network:10332',
    'https://n3seed2.ngd.network:10332',
    'https://neo3-mainnet.neoline.io',
  ],
  name: 'N3 Mainnet',
  magicNumber: 860833102,
  explorer: 'https://neotube.io/',
  network: NetworkType.N3MainNet,
  chainId: 3,
  id: 3,
  version: N3_NETWORK_VERSION,
};

export const N3T4NetworkChainId = 4;

export const N3TestnetNetwork: RpcNetwork = {
  rpcUrl: 'http://seed3t5.neo.org:20332',
  rpcUrlArr: [
    'http://seed1t5.neo.org:20332',
    'http://seed2t5.neo.org:20332',
    'http://seed3t5.neo.org:20332',
    'http://seed4t5.neo.org:20332',
    'http://seed5t5.neo.org:20332',
  ],
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

export const DEFAULT_RPC_URLS = {
  lastModified: null,
  nodes: {
    [N2MainnetNetwork.chainId]: [
      'http://seed1.ngd.network:10332',
      'http://seed2.ngd.network:10332',
      'http://seed6.ngd.network:10332',
      'http://seed8.ngd.network:10332',
    ],
    [N2testnetNetwork.chainId]: [
      'http://seed3.ngd.network:20332',
      'http://seed4.ngd.network:20332',
      'http://seed5.ngd.network:20332',
      'http://seed8.ngd.network:20332',
    ],
    [N3MainnetNetwork.chainId]: [
      'http://seed1.neo.org:10332',
      'http://seed2.neo.org:10332',
      'http://seed3.neo.org:10332',
      'http://seed4.neo.org:10332',
      'http://seed5.neo.org:10332',
      'https://n3seed1.ngd.network:10332',
      'https://n3seed2.ngd.network:10332',
      'https://neo3-mainnet.neoline.io',
    ],
    [N3TestnetNetwork.chainId]: [
      'http://seed1t5.neo.org:20332',
      'http://seed2t5.neo.org:20332',
      'http://seed3t5.neo.org:20332',
      'http://seed4t5.neo.org:20332',
      'http://seed5t5.neo.org:20332',
    ],
  },
};

export interface ConnectedWebsitesType {
  [hostname: string]: {
    title: string;
    icon: string;
    connectedAddress: {
      [address: string]: {
        keep: boolean;
        chain: ChainType;
      };
    };
  };
}
