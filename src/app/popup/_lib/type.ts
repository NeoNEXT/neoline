import { NetworkType } from './chain';

export interface GasFeeSpeed {
    slow_price: string;
    propose_price: string;
    fast_price: string;
}

export interface SelectItem {
    type: string;
    name: string;
}

export interface RpcNetwork {
    name: string;
    rpcUrl: string;
    network: NetworkType;
    explorer?: string;
    magicNumber?: number;
    chainId: number;
    id: number;
}

export const DEFAULT_NETWORKS = [
    'MainNet',
    'TestNet',
    'N3MainNet',
    'N3TestNet',
    'N3PrivateNet',
];

export const DEFAULT_N2_RPC_NETWORK: RpcNetwork[] = [
    {
        rpcUrl: 'https://neo2-mainnet.neoline.io',
        name: 'N2 MAINNET',
        explorer: 'https://neotube.io/',
        network: NetworkType.MainNet,
        chainId: 1,
        id: 1,
    },
    {
        rpcUrl: 'http://seed5.ngd.network:20332',
        name: 'N2 TESTNET',
        explorer: 'https://testnet.neotube.io/',
        network: NetworkType.TestNet,
        chainId: 2,
        id: 2,
    },
];

export const DEFAULT_N3_RPC_NETWORK: RpcNetwork[] = [
    {
        rpcUrl: 'https://neo3-mainnet.neoline.vip',
        name: 'N3 MAINNET',
        magicNumber: 860833102,
        explorer: 'https://neo3.neotube.io/',
        network: NetworkType.N3MainNet,
        chainId: 3,
        id: 3,
    },
    {
        rpcUrl: 'http://seed2t4.neo.org:20332',
        name: 'TESTNET(N3T4)',
        magicNumber: 877933390,
        explorer: 'https://n3t4.neotube.io/',
        network: NetworkType.N3TestNet,
        chainId: 4,
        id: 4,
    },
    {
        rpcUrl: 'http://seed3t5.neo.org:20332',
        name: 'TESTNET(N3T5)',
        magicNumber: 894710606,
        explorer: 'https://n3t5.neotube.io/',
        network: NetworkType.N3TestNet,
        chainId: 6,
        id: 6,
    },
];

export const RPC_URLS = {
    1: [
        'https://neo2-mainnet.neoline.io',
        'http://seed6.ngd.network:10332',
        'http://seed7.ngd.network:10332',
        'http://seed8.ngd.network:10332',
        'http://seed1.ngd.network:10332',
    ],
    2: [
        'http://seed5.ngd.network:20332',
        'http://seed4.ngd.network:20332',
        'http://seed3.ngd.network:20332',
        'http://seed8.ngd.network:20332',
        'http://seed7.ngd.network:20332',
        'http://seed1.ngd.network:20332',
    ],
    3: [
        'https://neo3-mainnet.neoline.vip',
        'http://seed3.neo.org:10332',
        'http://seed4.neo.org:10332',
        'https://n3seed1.ngd.network:10332',
        'http://neo3.edgeofneo.com:10332',
        'https://mainnet5.neo.coz.io:443',
    ],
    4: [
        'http://seed2t4.neo.org:20332',
        'https://testnet2.neo.coz.io:443',
        'http://seed4t4.neo.org:20332',
        'http://seed1t4.neo.org:20332',
        'http://seed3t4.neo.org:20332',
        'http://seed5t4.neo.org:20332',
    ],
    6: [
        'http://seed3t5.neo.org:20332',
        'http://seed2t5.neo.org:20332',
        'http://seed4t5.neo.org:20332',
        'http://seed1t5.neo.org:20332',
        'http://seed5t5.neo.org:20332',
    ],
};
