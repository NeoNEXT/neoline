export interface NetworkType {
    Neo2: Array<NetworkItem>,
    Neo3: Array<NetworkItem>
}

/**
 * @param name The name of the custom chain.
 * @param chainId Unique identifier for interaction with DAPP.
 * @param nodeUrl URL of the rpc node.
 * @param blockBrowser URL of the block explorer.
 * @param magicNumber ID of the NEO network.
 */
export interface NetworkItem {
    name: string,
    chainId: number,
    nodeUrl: string,
    blockBrowser: string,
    magicNumber: number
}
