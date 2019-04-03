export interface PageData<T> {
    page: number,
    pages: number,
    per_page: number,
    total: number,
    items: T[]
}

export interface Balance {
    asset_id: string,
    balance: number,
    name: string,
    symbol: string,
    watching: boolean,
    avatar: string,
    rateBalance: number
}
export interface Asset extends Balance {
    watching: boolean
}
export interface Transaction {
    block_time: number,
    id: number,
    size: number,
    txid: string,
    value: string
}

export interface UTXO {
    n: number,
    txid: string,
    id: number,
    value: string,
    asset_id: string
}

export interface Block {
    lastBlockIndex: number,
    time: number
}

export interface AuthorizationData {
    icon: string,
    hostname: string,
    title: string
}

export const NEO = '0xc56f33fc6ecfcd0c225c4ab356fee59390af8560be0e930faebe74a6daff7c9b';
export const GAS = '0x602c79718b16e442de58778e148d0b1084e3b2dffd5de6b7b16cee7969282de7';
export const EDS = '81c089ab996fc89c468a26c0a88d23ae2f34b5c0';
export const EXT = 'e8f98440ad0d7a6e76d84fb1c3d3f8a16e162e97';

export const defaultAssets = [
    {
        asset_id: GAS,
        balance: 0,
        name: 'GAS',
        symbol: 'GAS',
        watching: true,
        avatar: '',
        rateBalance: 0
    },{
        asset_id: NEO,
        balance: 0,
        name: 'NEO',
        symbol: 'NEO',
        watching: true,
        avatar: '',
        rateBalance: 0
    }
];

