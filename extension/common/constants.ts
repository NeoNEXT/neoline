export const NEO =
    '0xc56f33fc6ecfcd0c225c4ab356fee59390af8560be0e930faebe74a6daff7c9b';
export const GAS =
    '0x602c79718b16e442de58778e148d0b1084e3b2dffd5de6b7b16cee7969282de7';
export const NEO3 = '0xef4073a0f2b305a38ec4050e4d3d28bc40ea63f5';
export const GAS3 = '0xd2a4cff31913016155e38e474a2c06d08be276cf';
export enum ChainType {
    Neo2 = 'Neo2',
    Neo3 = 'Neo3',
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

enum NetworkType {
    MainNet = 'MainNet',
    TestNet = 'TestNet',
    N3MainNet = 'N3MainNet',
    N3TestNet = 'N3TestNet',
    N3PrivateNet = 'N3PrivateNet'
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
        rpcUrl: 'http://seed7.ngd.network:10332',
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
        rpcUrl: 'https://n3seed2.ngd.network:10332',
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
