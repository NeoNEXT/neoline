export {
  ChainType,
  NEO,
  GAS,
  NEO3,
  GAS3,
  DEFAULT_NETWORKS,
  NetworkType,
  RpcNetwork,
  N2MainnetNetwork,
  DEFAULT_N2_RPC_NETWORK,
  N3MainnetNetwork,
  N3TestnetNetwork,
  DEFAULT_N3_RPC_NETWORK,
  NeoXMainnetNetwork,
  NeoXTestnetNetwork,
  DEFAULT_NEOX_RPC_NETWORK,
  EVMNetworkChainId,
  ALL_CHAINID,
  STORAGE_NAME,
  ConnectedWebsitesType,
  SECRET_PASSPHRASE,
} from '../../cross-runtime/constants';

export enum WitnessScope {
  None = 0,
  CalledByEntry = 1,
  CustomContracts = 16,
  CustomGroups = 32,
  WitnessRules = 64,
  Global = 128,
}

export const ExcludeWebsite = ['yandex.com', 'google.com'];
