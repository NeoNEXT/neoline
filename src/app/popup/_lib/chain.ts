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
        name: 'Neo Legacy'
    },{
        type: 'Neo3',
        name: 'Neo N3'
    }
];

export enum NetworkType {
    MainNet = 'MainNet',
    TestNet = 'TestNet',
    N3MainNet = 'N3MainNet',
    N3TestNet = 'N3TestNet',
    N3PrivateNet = 'N3PrivateNet'
}
