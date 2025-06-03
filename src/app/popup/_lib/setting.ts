import { SelectItem } from './type';

export const LanguagesType: Array<SelectItem> = [
  {
    type: 'en',
    name: 'en',
  },
  {
    type: 'zh_CN',
    name: 'zh_CN',
  },
];

export const RateCurrencyType: Array<SelectItem> = [
  {
    name: 'USD',
    type: 'USD',
  },
  {
    name: 'CNY',
    type: 'CNY',
  },
];

export const DEFAULT_ASSET_LOGO = '/assets/images/default_asset_logo.svg';
export const DEFAULT_NFT_LOGO = '/assets/images/default-nft-logo.svg';
export const UNKNOWN_LOGO_URL = '/assets/images/unknown-logo.svg';

interface LocalNoticeItem {
  title: string;
  content: string;
  time: number;
  more: boolean;
}

export const LOCAL_NOTICE: LocalNoticeItem[] = [
  {
    title: 'Support OneKey',
    content:
      'Support OneKey wallet to connect to the wallet, and you can use the OneKey wallet to sign transactions.',
    time: 1748576313097,
    more: false,
  },
  {
    title: 'Support OneKey2',
    content:
      'Support OneKey wallet to connect to the wallet, and you can use the OneKey wallet to sign transactions.',
    time: 1748576313097,
    more: false,
  },
];
