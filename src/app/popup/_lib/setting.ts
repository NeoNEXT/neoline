import { SelectItem } from './type';

export const LanguagesType: Array<SelectItem> = [
    {
        type: 'en',
        name: 'en'
    },{
        type: 'zh_CN',
        name: 'zh_CN'
    }
]

export const RateCurrencysType: Array<SelectItem> = [
    {
        name: 'USD',
        type: 'USD'
    },{
        name: 'CNY',
        type: 'CNY'
    }
];

export enum RateStorageName {
    assetUSDRate = 'assetUSDRate',
    assetCNYRate = 'assetCNYRate',
    neo3AssetUSDRate = 'neo3AssetUSDRate',
    neo3AssetCNYRate = 'neo3AssetCNYRate',
}
