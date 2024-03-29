import { SelectItem } from './type';

/**
 * 链类型
 * - `neo2`
 * - `neo3`
 */
export type ChainType = 'Neo2' | 'Neo3';

export const ChainTypeGroups: SelectItem[] = [
  {
    type: 'Neo2',
    name: 'Neo Legacy',
  },
  {
    type: 'Neo3',
    name: 'Neo N3',
  },
];

export enum NetworkType {
  MainNet = 'MainNet',
  TestNet = 'TestNet',
  N3MainNet = 'N3MainNet',
  N3TestNet = 'N3TestNet',
  N3PrivateNet = 'N3PrivateNet',
}

export const CHAINID_OF_NETWORKTYPE = {
  0: 'N3 PRIVATE NETWORK',
  1: 'N2 MAINNET',
  2: 'N2 TESTNET',
  3: 'N3 MAINNET',
  6: 'N3 TESTNET',
}
