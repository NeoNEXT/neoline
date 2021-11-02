export const NEO = '0xc56f33fc6ecfcd0c225c4ab356fee59390af8560be0e930faebe74a6daff7c9b';
export const GAS = '0x602c79718b16e442de58778e148d0b1084e3b2dffd5de6b7b16cee7969282de7';
export const mainApi = 'https://api.neoline.io';
export const NETWORKS = ['MainNet', 'TestNet', 'N3MainNet', 'N3TestNet'];
export enum ChainType {
    Neo2 = 'Neo2',
    Neo3 = 'Neo3'
}

export enum Network {
    Neo2MainNet = 'MainNet',
    Neo2TestNet = 'TestNet',
    N3MainNet = 'N3MainNet',
    N3TestNet = 'N3TestNet'
}

export enum ReqHeaderNetworkType {
    mainnet = 'mainnet',
    testnet = 'testnet'
}

/**
 * @param N3MainNet Replace after N3 mainnet is online, Currently affecting use
 */
export const RPC = {
    Neo2: {
        TestNet: 'https://neo2-testnet.neoline.io',
        MainNet: 'https://neo2-mainnet.neoline.io',
    },
    Neo3: {
        N3TestNet: 'https://neo3-testnet.neoline.vip',
        N3MainNet: 'https://neo3-mainnet.neoline.vip',
    }
};

/**
 * @param N3MainNet Mainnet is not yet online, Mainnet Id 3
 */
export enum ChainId {
    Neo2MainNet = 1,
    Neo2TestNet = 2,
    N3MainNet = 3,
    N3TestNet = 4,
}

export enum WitnessScope {
    None = 0,
    CalledByEntry = 1,
    CustomContracts = 16,
    CustomGroups = 32,
    Global = 128,
}
