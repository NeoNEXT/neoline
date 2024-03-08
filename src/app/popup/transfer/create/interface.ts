import { Asset, NftToken } from '@/models/models';
import { ChainType, RpcNetwork } from '../../_lib';
import { Wallet as Wallet2 } from '@cityofzion/neon-core/lib/wallet';
import { Wallet as Wallet3 } from '@cityofzion/neon-core-neo3/lib/wallet';
import { EvmWalletJSON } from '../../_lib/evm';

export interface TransferData {
  from: string;
  to: { address: string; name: string };
  asset: Asset;
  nftToken: NftToken;
  amount: string;
  fee: string;
  gasBalance: string;
  chainType: ChainType;
  isNFT: boolean;
  nftContract?: string;
  network: RpcNetwork;
  currentWallet: Wallet2 | Wallet3 | EvmWalletJSON;
  currentWIF: string;
}
