import { NeoXFeeInfoProp } from '@/app/popup/transfer/create/interface';

export interface ClaimItem {
  end_height: number;
  generated: number;
  n: number;
  start_height: number;
  sys_fee: number;
  txid: string;
  unclaimed: number;
  value: number;
}

export interface Asset {
  asset_id: string;
  balance?: string;
  name?: string;
  symbol?: string;
  watching?: boolean;
  avatar?: string;
  rateBalance?: string;
  decimals?: number;
  image_url?: string;
}

export interface NftToken {
  tokenid: string;
  symbol: string;
  amount: string;
  name?: string;
  image_url?: string;
  isOwner?: boolean;
}

export interface NftAsset {
  name: string;
  assethash: string;
  symbol?: string;
  tokens?: NftToken[];
  watching?: boolean;
  image_url?: string;
  // contract: string;
  // name: string;
  // symbol: string;
  // info?: any;
  standard?: 'ERC721' | 'ERC1155' | string;
}

export enum TransactionStatus {
  'Failed' = 0,
  'Success' = 1,
  'Dropped' = 2,
  'Cancelled' = 3,
  'Canceling' = 4,
}
export interface Transaction {
  block_time: number;
  id?: number;
  size?: number;
  txid: string;
  value: string;
  net_fee?: any;
  asset_id: string;
  symbol?: string;
  from?: string[];
  to?: string[];
  type:
    | 'sent'
    | 'received'
    | 'sendEther'
    | 'sendToken'
    | 'contractInteraction'
    | 'approve';
  status?: TransactionStatus; // EVM tx status 0: failed, 1: success

  // NFT
  tokenid?: string;

  // EVM
  nonce?: number;
  txParams?: any;
  history?: HistoryTransaction[];
}
interface HistoryTransaction {
  txId: string;
  time: number;
  type: 'create' | 'cancel' | 'speedUp' | 'complete';
  neoXFeeInfo?: NeoXFeeInfoProp;
}

export interface NftTransaction extends Transaction {
  tokenid?: string;
}

export interface UTXO {
  n: number;
  txid: string;
  id: number;
  value: string;
  asset_id: string;
}

export const NEO =
  '0xc56f33fc6ecfcd0c225c4ab356fee59390af8560be0e930faebe74a6daff7c9b';
export const GAS =
  '0x602c79718b16e442de58778e148d0b1084e3b2dffd5de6b7b16cee7969282de7';
