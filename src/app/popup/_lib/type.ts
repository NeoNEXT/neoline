import { ChainType, NetworkType } from './chain';
import { Wallet as Wallet2 } from '@cityofzion/neon-core/lib/wallet';
import { EvmWalletJSON } from '@popup/_lib';
import { RpcNetwork } from '../../../../cross-runtime/constants';

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

/**
 * Clamp a persisted network index into range for its networks array. A stored
 * index can point past the array (a custom network was removed, a default
 * migration reordered the list, the index was never written, ...); indexing
 * past the end yields `undefined`, which crashes every consumer that reads the
 * current network. Falls back to the first slot.
 */
export function clampNetworkIndex(
  networks: RpcNetwork[],
  index: number
): number {
  if (!Array.isArray(networks) || networks.length === 0) {
    return 0;
  }
  return index >= 0 && index < networks.length ? index : 0;
}

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
  title: string;
  expand: boolean;
  walletArr: Array<Wallet2 | Wallet3 | EvmWalletJSON>;
  isHDWalletGroup?: boolean;
  hdWalletId?: string;
}
