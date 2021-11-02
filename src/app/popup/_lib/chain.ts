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

/**
 * chainId 1 Neo2 MainNet
 * chainId 2 Neo2 TestNet
 * chainId 3 N3 MainNet
 * chainId 4 N3 TestNet
 * @param N3MainNet MainNet is not yet online, MainNet Id 3
 *
 * @export
 * @enum {number}
 */
export enum ChainId {
    Neo2MainNet = 1,
    Neo2TestNet = 2,
    N3MainNet = 3,
    N3TestNet = 4,
}

export enum NetType {
    MainNet = 'MainNet',
    TestNet = 'TestNet',
    N3MainNet = 'N3MainNet',
    N3TestNet = 'N3TestNet'
}
