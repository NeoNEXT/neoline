import { N3MainnetNetwork, N3T4NetworkChainId, N3TestnetNetwork } from './type';

export {
  NEO3 as NEO3_CONTRACT,
  GAS3 as GAS3_CONTRACT,
} from '@cross-runtime/constants';

export { Account3, Wallet3 } from '@cross-runtime/neo3-shared';

export const NEW_POLICY_CONTRACT = '0xcc5e4edd9f5f8dba8bb65734541df7a1c081c67b';

const N3_NNS_CONTRACT = '0x50ac1c37690cc2cfc594472833cf57505d5f46de';
const N3T4_NNS_CONTRACT = '0x538355b776538a5da0b2a08c139b9900b9c0cbb6';
const N3T5_NNS_CONTRACT = '0xd4dbd72c8965b8f12c14d37ad57ddd91ee1d98cb';
export const NNS_CONTRACT = {
  [N3MainnetNetwork.chainId]: N3_NNS_CONTRACT,
  [N3T4NetworkChainId]: N3T4_NNS_CONTRACT,
  [N3TestnetNetwork.chainId]: N3T5_NNS_CONTRACT,
};
