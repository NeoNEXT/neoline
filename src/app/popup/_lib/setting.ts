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
  id: number;
  title: {
    en: string;
    zh_CN: string;
  };
  content: {
    en: string;
    zh_CN: string;
  };
  time: number;
}

export const LOCAL_NOTICE: LocalNoticeItem[] = [
  {
    id: 1,
    title: {
      en: 'OneKey hardware wallet support',
      zh_CN: '支持 OneKey 硬件钱包',
    },
    content: {
      en: `You can now connect and import your OneKey hardware wallet directly into NeoLine. Safely manage your assets, sign transactions, and enjoy enhanced security — all with your OneKey device.`,
      zh_CN: `您现在可以将 OneKey 硬件钱包直接连接并导入到 NeoLine 中，安全管理资产、签署交易，尽享更高等级的安全体验。`,
    },
    time: 1749052800000,
  },
];
