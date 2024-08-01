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
