import { NetworkType } from './chain';
import { RpcNetwork } from './type';

export const ETH_SOURCE_ASSET_HASH =
  '0x0000000000000000000000000000000000000000';

export interface EvmWalletJSON {
  crypto?: any;
  id?: string;
  version?: number;
  address?: string;
  name: string;
  accounts: [
    {
      address: string;
      extra: {
        publicKey: string;
        isHDWallet?: boolean;
        hasBackup?: boolean,
        ledgerSLIP44?: string;
        ledgerAddressIndex?: number;
      };
    }
  ];
}

export const DEFAULT_NEOX_RPC_NETWORK: RpcNetwork[] = [
  {
    id: 12227330,
    symbol: 'GAS',
    chainId: 12227330,
    name: 'NeoX TESTNET',
    network: NetworkType.EVM,
    rpcUrl: 'https://neoxseed1.ngd.network',
    explorer: 'https://xt2scan.ngd.network/',
  },
  {
    id: 84532,
    symbol: 'ETH',
    chainId: 84532,
    name: 'Base Sepolia',
    network: NetworkType.EVM,
    rpcUrl: 'https://sepolia.base.org',
    explorer: 'https://base-sepolia.blockscout.com',
  },
];
