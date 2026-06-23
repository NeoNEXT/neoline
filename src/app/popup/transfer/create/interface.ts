import { Asset, NftAsset, NftToken } from '@/models/models';
import { ChainType, RpcNetwork } from '../../_lib';
import { Wallet as Wallet2 } from '@cityofzion/neon-core/lib/wallet';
import { Wallet3 } from '@popup/_lib';
import { EvmWalletJSON } from '../../_lib/evm';

export interface TransferData {
  from: string;
  to: { address: string; name: string };
  asset: Asset;
  nftAsset?: NftAsset,
  nftToken?: NftToken;
  amount: string;
  fee: string;
  gasBalance: string;
  chainType: ChainType;
  isNFT: boolean;
  nftContract?: string;
  network: RpcNetwork;
  currentWallet: Wallet2 | Wallet3 | EvmWalletJSON;
  currentWIF: string;
  neoXFeeInfo?: NeoXFeeInfoProp;
}

export interface EvmGasEstimateResult {
  /** Gas limit to use: the live estimate, or the fallback when the simulation reverts. */
  gasLimit: bigint;
  /** True when eth_estimateGas reverted and gasLimit is the block-gas-limit fallback. */
  simulationFailed: boolean;
  /** Latest block fetched for this estimate, reused by getGasInfo to save a second RPC. */
  block: any;
}

export interface NeoXFeeInfoProp {
  maxFeePerGas?: string;
  maxPriorityFeePerGas?: string;
  gasLimit: string;
  estimateGas: string;
  gasPrice?: string;
  custom?: boolean;
  estimateGasError?: boolean;
}

export interface NeoDataJsonProp {
  fromAddress: string;
  toAddress: string;
  symbol: string;
  asset: string;
  tokenId?: string;
  amount: string;
  fee: string;
  networkFee: string;
  systemFee: string;
  networkId: number;
  chainId: number;
  estimatedFee: string;
}
