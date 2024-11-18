import { Asset } from '@/models/models';
import { ChainType } from './chain';

export const TX_LIST_PAGE_SIZE = 10;

export enum BridgeNetwork {
  MainNet = 'MainNet',
  TestNet = 'TestNet',
}

interface BaseTransactionOnBridge {
  txId: string;
  asset: Asset;
  network: BridgeNetwork;
  type: 'approval' | 'bridge';
}

export interface BridgeTransactionOnBridge extends BaseTransactionOnBridge {
  type: 'bridge';
  sourceTxID?: string;
  targetTxID?: string;
  sourceChainType: ChainType;
  targetChainType: ChainType;
  sourceExplorer: string;
  targetExplorer: string;
  sourceRpcUrl: string;
}

export interface ApproveTransactionOnBridge extends BaseTransactionOnBridge {
  type: 'approval';
  neoXExplorer: string;
}

export type TransactionOnBridge =
  | BridgeTransactionOnBridge
  | ApproveTransactionOnBridge;

export interface AddressNonceInfo {
  nonce: number;
  pendingTxs: number;
}
