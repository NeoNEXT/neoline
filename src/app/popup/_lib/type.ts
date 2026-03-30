import { ChainType, NetworkType } from './chain';
import { Wallet as Wallet2 } from '@cityofzion/neon-core/lib/wallet';
import { EvmWalletJSON } from '@popup/_lib';

export {
  RpcNetwork,
  DEFAULT_NETWORKS,
  N2MainnetNetwork,
  DEFAULT_N2_RPC_NETWORK,
  N3MainnetNetwork,
  N3TestnetNetwork,
  DEFAULT_N3_RPC_NETWORK,
  DEFAULT_RPC_URLS,
  ConnectedWebsitesType,
} from '../../../../cross-runtime/constants';

import { Wallet3 } from '../../../../cross-runtime/neo3-shared';

export interface GasFeeSpeed {
  slow_price: string;
  propose_price: string;
  fast_price: string;
}

export interface SelectItem {
  type: string;
  name: string;
}

export interface ChainSelectItem extends SelectItem {
  type: ChainType;
}

export const N3T4NetworkChainId = 4;
export interface QRCodeWallet {
  pubKey: string;
  xfp: string;
}
export interface WalletListItem {
  chain: ChainType;
  title:
    | 'Neo N3'
    | 'Neo X (EVM Network)'
    | 'Neo Legacy'
    | 'Private key'
    | 'Ledger'
    | 'OneKey'
    | 'QRCode';
  expand: boolean;
  walletArr: Array<Wallet2 | Wallet3 | EvmWalletJSON>;
}
