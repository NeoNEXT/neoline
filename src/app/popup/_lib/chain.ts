import { ChainSelectItem } from './type';

/**
 * 链类型
 * - `neo2`
 * - `neo3`
 */
export type ChainType = 'Neo2' | 'Neo3' | 'NeoX';

export const ChainTypeGroups: ChainSelectItem[] = [
  {
    type: 'Neo3',
    name: 'Neo N3',
  },
  {
    type: 'NeoX',
    name: 'Neo X (EVM Network)',
  },
  {
    type: 'Neo2',
    name: 'Neo Legacy',
  },
];

export const AddNetworkChainTypeGroups: ChainSelectItem[] = [
  ChainTypeGroups[0],
  ChainTypeGroups[1],
];

export enum NetworkType {
  MainNet = 'MainNet',
  TestNet = 'TestNet',
  N3MainNet = 'N3MainNet',
  N3TestNet = 'N3TestNet',
  N3PrivateNet = 'N3PrivateNet',
  EVM = 'EVM',
}

export const CHAINID_OF_NETWORKTYPE = {
  0: 'N3 private network',
  1: 'N2 Mainnet',
  2: 'N2 Testnet',
  3: 'N3 Mainnet',
  6: 'N3 Testnet',
};

export const CHAIN_ICON_MAP = {
  100: 'assets/images/chains/100-gnosis.svg',
  1: 'assets/images/chains/1-ethereum.png',
  10: 'assets/images/chains/10-optimism.svg',
  25: 'assets/images/chains/25-cronos.svg',
  30: 'assets/images/chains/30-rootstock.svg',
  56: 'assets/images/chains/56-bsc.svg',
  66: 'assets/images/chains/66-okc.webp',
  108: 'assets/images/chains/108-thunderCore.webp',
  130: 'assets/images/chains/130-unichain.png',
  137: 'assets/images/chains/137-polygon.svg',
  146: 'assets/images/chains/146-sonic.png',
  169: 'assets/images/chains/169-mantaPacific.svg',
  199: 'assets/images/chains/199-bitTorrent.svg',
  250: 'assets/images/chains/250-fantom.svg',
  288: 'assets/images/chains/288-boba.svg',
  314: 'assets/images/chains/314-filecoin.svg',
  321: 'assets/images/chains/321-kcc.png',
  324: 'assets/images/chains/324-zksync.png',
  480: 'assets/images/chains/480-world.png',
  592: 'assets/images/chains/592-astar.png',
  1088: 'assets/images/chains/1088-metis.svg',
  1284: 'assets/images/chains/1284-moonbeam.png',
  1285: 'assets/images/chains/1285-moonriver.png',
  1818: 'assets/images/chains/1818-cube.png',
  1868: 'assets/images/chains/1868-soneium.png',
  2222: 'assets/images/chains/2222-kava.svg',
  4689: 'assets/images/chains/4689-iotx.png',
  5000: 'assets/images/chains/5000-mantle.svg',
  7000: 'assets/images/chains/7000-zeta.svg',
  8453: 'assets/images/chains/8453-base.svg',
  11235: 'assets/images/chains/11235-haqq.png',
  32520: 'assets/images/chains/32520-bitgert.png',
  33139: 'assets/images/chains/33139-ape.svg',
  34443: 'assets/images/chains/34443-mode.svg',
  42161: 'assets/images/chains/42161-arbitrum.svg',
  42170: 'assets/images/chains/42170-arbitrumNova.svg',
  42220: 'assets/images/chains/42220-celo.png',
  43111: 'assets/images/chains/43111-hemi.svg',
  43114: 'assets/images/chains/43114-avalanche.svg',
  47763: 'assets/images/chains/47763-neox.svg',
  59144: 'assets/images/chains/59144-linea.svg',
  81457: 'assets/images/chains/81457-blast.svg',
  167000: 'assets/images/chains/167000-taikoAlethia.svg',
  534352: 'assets/images/chains/534352-scroll.svg',
  810180: 'assets/images/chains/810180-zkLinkNova.svg',
  7777777: 'assets/images/chains/7777777-zora.png',
  12227332: 'assets/images/chains/12227332-neox.svg',
  728126428: 'assets/images/chains/728126428-tron.svg',
  1313161554: 'assets/images/chains/1313161554-aurora.png',
  2046399126: 'assets/images/chains/2046399126-SKALEEuropa.svg',
};
