export const NEO = '0xc56f33fc6ecfcd0c225c4ab356fee59390af8560be0e930faebe74a6daff7c9b';
export const GAS = '0x602c79718b16e442de58778e148d0b1084e3b2dffd5de6b7b16cee7969282de7';
export const mainApi = 'https://api.neoline.io';
export enum ChainType {
    Neo2 = 'Neo2',
    Neo3 = 'Neo3'
}
export const RPC = {
    Neo2: {
        TestNet: 'https://neo2-testnet.neoline.io',
        MainNet: 'https://neo2-mainnet.neoline.io',
    },
    Neo3: {
        TestNet: 'https://neo3-testnet.neoline.vip',
        MainNet: 'https://neo3-testnet.neoline.vip',
    }
};

/**
 * @param N3MainNet Mainnet is not yet online, Mainnet Id 3
 */
export enum ChainId {
    Neo2MainNet = 1,
    Neo2TestNet = 2,
    N3MainNet = 4,
    N3TestNet = 4,
}
