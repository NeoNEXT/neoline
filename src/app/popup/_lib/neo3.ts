import { N3MainnetNetwork, N3T4NetworkChainId, N3TestnetNetwork } from './type';
import { Account, Wallet } from '@cityofzion/neon-core-neo3/lib/wallet';

export const NEO3_CONTRACT = '0xef4073a0f2b305a38ec4050e4d3d28bc40ea63f5';
export const GAS3_CONTRACT = '0xd2a4cff31913016155e38e474a2c06d08be276cf';
export const NEW_POLICY_CONTRACT = '0xcc5e4edd9f5f8dba8bb65734541df7a1c081c67b';

const N3_NNS_CONTRACT = '0x50ac1c37690cc2cfc594472833cf57505d5f46de';
const N3T4_NNS_CONTRACT = '0x538355b776538a5da0b2a08c139b9900b9c0cbb6';
const N3T5_NNS_CONTRACT = '0xd4dbd72c8965b8f12c14d37ad57ddd91ee1d98cb';
export const NNS_CONTRACT = {
  [N3MainnetNetwork.chainId]: N3_NNS_CONTRACT,
  [N3T4NetworkChainId]: N3T4_NNS_CONTRACT,
  [N3TestnetNetwork.chainId]: N3T5_NNS_CONTRACT,
};

export class Account3 extends Account {
  extra: {
    [key: string]: any;
  };
  export() {
    return {
      ...super.export(),
      extra: this.extra,
    };
  }
}
export class Wallet3 extends Wallet {
  accounts: Account3[];
  extra: {
    [key: string]: any;
  };
  export() {
    return {
      ...super.export(),
      extra: this.extra,
    };
  }
}
