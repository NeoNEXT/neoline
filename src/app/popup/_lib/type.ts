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
}

export const DEFAULT_N2_RPC_NETWORK: RpcNetwork[] = [
    {
        rpcUrl: 'http://seed5.ngd.network:20332',
        name: 'N2 Testnet',
        explorer: 'https://testnet.neotube.io/',
        network: NetworkType.TestNet
    },
    {
        rpcUrl: 'http://seed7.ngd.network:10332',
        name: 'N2 Mainnet',
        explorer: 'https://neotube.io/',
        network: NetworkType.MainNet
    },
];

export const DEFAULT_N3_RPC_NETWORK: RpcNetwork[] = [
    {
        rpcUrl: 'http://seed3t4.neo.org:20332',
        name: 'N3 Testnet',
        magicNumber: 877933390,
        explorer: 'https://neo3.testnet.neotube.io/',
        network: NetworkType.TestNet
    },
    {
        rpcUrl: 'http://seed7.ngd.network:10332',
        name: 'N3 Mainnet',
        magicNumber: 860833102,
        explorer: 'https://neo3.neotube.io/',
        network: NetworkType.MainNet
    },
];
