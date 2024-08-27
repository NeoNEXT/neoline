import { ChainType } from './chain';

export const TX_LIST_PAGE_SIZE = 10;

export enum BridgeNetwork {
  MainNet = 'MainNet',
  TestNet = 'TestNet',
}

export interface BridgeTransactionItem {
  txId: string;
  network: BridgeNetwork;
  sourceTxID?: string;
  targetTxID?: string;
  sourceChainType: ChainType;
  targetChainType: ChainType;
  sourceExplorer: string;
  targetExplorer: string;
  sourceRpcUrl: string;
}

export interface AddressNonceInfo {
  nonce: number;
  pendingTxs: number;
}
