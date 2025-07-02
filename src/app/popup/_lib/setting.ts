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
  {
    type: 'ja',
    name: 'ja',
  },
];

export type CurrencyType = 'USD' | 'CNY' | 'JPY' | 'KRW' | 'EUR';
export const RateCurrencyType: Array<SelectItem> = [
  {
    name: 'USD - United States Dollar',
    type: 'USD',
  },
  {
    name: 'CNY - Chinese Yuan',
    type: 'CNY',
  },
  {
    name: 'JPY - Japanese Yen',
    type: 'JPY',
  },
  {
    name: 'KRW - South Korean Won',
    type: 'KRW',
  },
  {
    name: 'EUR - Euro',
    type: 'EUR',
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
    ja: string;
  };
  content: {
    en: string;
    zh_CN: string;
    ja: string;
  };
  time: number;
}

export const LOCAL_NOTICE: LocalNoticeItem[] = [
  {
    id: 1,
    title: {
      en: 'OneKey hardware wallet support',
      zh_CN: '支持 OneKey 硬件钱包',
      ja: 'OneKey ハードウェアウォレットのサポート',
    },
    content: {
      en: `You can now connect and import your OneKey hardware wallet directly into NeoLine. Safely manage your assets, sign transactions, and enjoy enhanced security — all with your OneKey device.`,
      zh_CN: `您现在可以将 OneKey 硬件钱包直接连接并导入到 NeoLine 中，安全管理资产、签署交易，尽享更高等级的安全体验。`,
      ja: `OneKey ハードウェアウォレットを NeoLine に直接接続してインポートできるようになりました。資産を安全に管理し、取引に署名し、OneKey デバイスでさらに強化されたセキュリティを体験できます`,
    },
    time: 1749398400000,
  },
];

export type LinkType =
  | 'privacy'
  | 'agreement'
  | 'hardwareTutorial'
  | 'bridgeTutorial'
  | 'manageAsset'
  | 'manageTx'
  | 'oneKeyDownload'
  | 'getHelp'
  | 'addSwitchNetwork'
  | 'companyWebsite'
  | 'contactUs'
  | 'followUs'
  | 'onePasswordTutorial'
  | 'speedUpCancelTx';

type langType = 'en' | 'zh_CN';

export const LINKS: Record<LinkType, Record<langType, string>> = {
  privacy: {
    en: 'https://neoline.io/en/privacy',
    zh_CN: 'https://neoline.io/privacy',
  },
  agreement: {
    en: 'https://neoline.io/en/agreement',
    zh_CN: 'https://neoline.io/agreement',
  },
  hardwareTutorial: {
    en: 'https://tutorial.neoline.io/hardware-wallet/ledger-hardware-wallet',
    zh_CN:
      'https://tutorial.neoline.io/cn/ying-jian-qian-bao/ledgerhardwarewallet',
  },
  oneKeyDownload: {
    en: 'https://onekey.so/download/',
    zh_CN: 'https://onekey.so/zh_CN/download/',
  },
  bridgeTutorial: {
    en: 'https://tutorial.neoline.io/create-and-manage-neo-x-wallet/how-to-bridge-gas-using-the-neoline-chrome-extension',
    zh_CN:
      'https://tutorial.neoline.io/cn/neox-qian-bao-de-chuang-jian-he-shi-yong/ru-he-shi-yong-neoline-cha-jian-qian-bao-jin-xing-gas-qiao-jie',
  },
  manageAsset: {
    en: 'https://tutorial.neoline.io/getting-started/manage-assets',
    zh_CN: 'https://tutorial.neoline.io/cn/xin-shou-zhi-nan/zi-chan-guan-li',
  },
  manageTx: {
    en: 'https://tutorial.neoline.io/create-and-manage-neo-x-wallet/about-neoline-activity',
    zh_CN:
      'https://tutorial.neoline.io/cn/neox-qian-bao-de-chuang-jian-he-shi-yong/guan-yu-neoline-activity',
  },
  getHelp: {
    en: 'https://tutorial.neoline.io/',
    zh_CN: 'https://tutorial.neoline.io/cn',
  },
  addSwitchNetwork: {
    en: 'https://tutorial.neoline.io/create-and-manage-neo-x-wallet/how-to-add-and-switch-networks',
    zh_CN:
      'https://tutorial.neoline.io/cn/neox-qian-bao-de-chuang-jian-he-shi-yong/ru-he-tong-guo-neoline-tian-jia-he-qie-huan-qi-ta-evm-wang-luo',
  },
  companyWebsite: {
    en: 'https://neoline.io/en',
    zh_CN: 'https://neoline.io/',
  },
  contactUs: {
    en: 'https://t.me/neoline_community',
    zh_CN: 'https://t.me/neoline_community',
  },
  followUs: {
    en: 'https://x.com/NEOLine20',
    zh_CN: 'https://x.com/NEOLine20',
  },
  onePasswordTutorial: {
    en: 'https://tutorial.neoline.io/getting-started/one-pass-setting-for-neoline-extension-wallet',
    zh_CN:
      'https://tutorial.neoline.io/cn/xin-shou-zhi-nan/neoline-cha-jian-qian-bao-tong-yong-mi-ma-she-zhi',
  },
  speedUpCancelTx: {
    en: 'https://tutorial.neoline.io/getting-started/how-to-speed-up-or-cancel-a-pending-transaction',
    zh_CN:
      'https://tutorial.neoline.io/getting-started/how-to-speed-up-or-cancel-a-pending-transaction',
  },
};
