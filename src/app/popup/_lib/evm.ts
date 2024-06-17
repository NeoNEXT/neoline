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
        hdWalletIndex?: number;
        hasBackup?: boolean;
        ledgerSLIP44?: string;
        ledgerAddressIndex?: number;
      };
    }
  ];
}

export const DEFAULT_NEOX_RPC_NETWORK: RpcNetwork[] = [
  {
    id: 12227331,
    symbol: 'GAS',
    chainId: 12227331,
    name: 'Neo X TESTNET',
    network: NetworkType.EVM,
    rpcUrl: 'https://neoxseed1.ngd.network',
    explorer: 'https://xt3scan.ngd.network',
    keep: true,
  },
];
