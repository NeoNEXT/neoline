import { ChainType } from './chain';

export const TX_LIST_PAGE_SIZE = 10;

export interface BridgeTransactionItem {
  txId: string;
  sourceTxID?: string,
  targetTxID?: string,
  sourceChainType: ChainType,
  targetChainType: ChainType,
  sourceExplorer: string,
  targetExplorer: string;
  sourceRpcUrl: string;
}
