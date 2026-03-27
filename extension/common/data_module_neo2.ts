import { ChainType } from '../../cross-runtime/constants';

export { ERRORS, EVENT, requestTarget } from '../../cross-runtime/neo2-shared';

export * from '../../cross-runtime/neo2-dapi-models';

export interface WalletSwitchNetworkArg {
  chainId: number;
  hostname?: string;
  icon?: string;
  chainType?: ChainType;
}

export interface WalletSwitchAccountArg {
  hostname?: string;
  icon?: string;
  chainType?: ChainType;
}
