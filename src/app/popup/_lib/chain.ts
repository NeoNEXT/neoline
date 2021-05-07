/**
 * 链类型
 * - `neo2`
 * - `neo3`
 */
export type ChainType = 'Neo2' | 'Neo3';
export const ChainTypeGroups = ['Neo2', 'Neo3'];

/**
 * chainId 1 Neo2 MainNet
 * chianId 2 Neo2 TestNet
 * ChainId 3 N3 MainNet
 * ChainId 4 N3 TestNet
 * @param N3MainNet Mainnet is not yet online, Mainnet Id 3
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
    MianNet = 'MainNet',
    TestNet = 'TestNet',
    N3MianNet = 'N3MianNet',
    N3TestNet = 'N3TestNet'
}
