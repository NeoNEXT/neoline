export const NEO = '0xc56f33fc6ecfcd0c225c4ab356fee59390af8560be0e930faebe74a6daff7c9b';
export const GAS = '0x602c79718b16e442de58778e148d0b1084e3b2dffd5de6b7b16cee7969282de7';
export const mainApi = 'https://api.neoline.io';
export enum ChainType {
    Neo2 = 'Neo2',
    Neo3 = 'Neo3'
}
export const RPC = {
    Neo2: {
        TestNet: 'https://neo2-mainnet.neoline.io',
        MainNet: 'https://neo2-testnet.neoline.io',
    },
    Neo3: {
        TestNet: 'https://neo3-testnet.neoline.vip',
        MainNet: 'https://neo3-testnet.neoline.vip',
    }
};

export enum EVENT {
    READY = 'NEOLine.NEO.EVENT.READY',
    ACCOUNT_CHANGED = 'NEOLine.NEO.EVENT.ACCOUNT_CHANGED',
    CONNECTED = 'NEOLine.NEO.EVENT.CONNECTED',
    DISCONNECTED = 'NEOLine.NEO.EVENT.DISCONNECTED',
    NETWORK_CHANGED = 'NEOLine.NEO.EVENT.NETWORK_CHANGED',
    BLOCK_HEIGHT_CHANGED = 'NEOLine.NEO.EVENT.BLOCK_HEIGHT_CHANGED',
    TRANSACTION_CONFIRMED = 'NEOLine.NEO.EVENT.TRANSACTION_CONFIRMED',
    CHAIN_CHANGED = 'NEOLine.NEO.EVENT.CHAIN_CHANGED'
}
