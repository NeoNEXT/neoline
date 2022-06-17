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
