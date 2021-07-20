import { NetworkItem, NetworkType } from '../types';
import { ChainType } from './chain';

/**
 * @param name The name of the custom chain.
 * @param chainId Unique identifier for interaction with DAPP.
 * @param nodeUrl URL of the rpc node.
 * @param blockBrowser URL of the block explorer.
 * @param magicNumber ID of the NEO network.
 */
export const Neo2Networks: Array<NetworkItem> = [
    {
        name: 'MainNet',
        chainId: 1,
        nodeUrl: 'https://neo2-mainnet.neoline.io',
        blockBrowser: 'https://neotube.io',
        magicNumber: 1,
        chainType: ChainType.Neo2,
    },
    {
        name: 'TestNet',
        chainId: 2,
        nodeUrl: 'https://neo2-testnet.neoline.io',
        blockBrowser: 'https://neotube.io',
        magicNumber: 2,
        chainType: ChainType.Neo2,
    }
];

export const N3Networks: Array<NetworkItem> = [
    // {
    //     name: 'N3MainNet',
    //     chainId: 3,
    //     nodeUrl: 'https://neo3-testnet.neoline.vip',
    //     blockBrowser: 'https://neo3.neotube.io',
    //     magicNumber: 844378958
    //     chainType: ChainType.Neo3,
    // },
    {
        name: 'N3TestNet',
        chainId: 4,
        nodeUrl: 'https://neo3-testnet.neoline.vip',
        blockBrowser: 'https://neo3.neotube.io',
        magicNumber: 844378958,
        chainType: ChainType.Neo3,
    }
];

export const NETWORKS: NetworkType = {
    Neo2: Neo2Networks,
    Neo3: N3Networks
}

export const NEOLINE_NETWORKS = 'NEOLINE_NETWORKS';
export const ACTIVE_NETWORK = 'ACTIVE_NETWORK';
