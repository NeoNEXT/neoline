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
}

export const DEFAULT_N2_RPC_NETWORK: RpcNetwork[] = [
    {
        rpcUrl: 'http://seed7.ngd.network:10332',
        name: 'N2 Mainnet',
        explorer: 'https://neotube.io/',
        network: NetworkType.MainNet,
        chainId: 1,
    },
    {
        rpcUrl: 'http://seed5.ngd.network:20332',
        name: 'N2 Testnet',
        explorer: 'https://testnet.neotube.io/',
        network: NetworkType.TestNet,
        chainId: 2,
    },
    {
        rpcUrl: '',
        name: 'N2 PrivateNet',
        explorer: '',
        network: NetworkType.PrivateNet,
        chainId: 5,
    },
];

export const DEFAULT_N3_RPC_NETWORK: RpcNetwork[] = [
    {
        rpcUrl: 'https://n3seed2.ngd.network:10332',
        name: 'N3 Mainnet',
        magicNumber: 860833102,
        explorer: 'https://neo3.neotube.io/',
        network: NetworkType.MainNet,
        chainId: 3,
    },
    {
        rpcUrl: 'http://seed3t4.neo.org:20332',
        name: 'N3 Testnet',
        magicNumber: 877933390,
        explorer: 'https://neo3.testnet.neotube.io/',
        network: NetworkType.TestNet,
        chainId: 4,
    },
    {
        rpcUrl: '',
        name: 'N3 PrivateNet',
        magicNumber: undefined,
        explorer: '',
        network: NetworkType.PrivateNet,
        chainId: 6,
    },
];
