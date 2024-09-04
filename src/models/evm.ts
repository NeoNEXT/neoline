import { ethers } from 'ethers';

export enum requestTargetEVM {
  request = 'neoline.target_request_evm',
  isConnected = 'neoline.target_isConnected_evm',
}

export type SignTypedDataMessageV3V4 = {
  types: Record<string, unknown>;
  domain: Record<string, unknown>;
  primaryType: string;
  message: unknown;
};

export enum ETH_EOA_SIGN_METHODS {
  PersonalSign = 'personal_sign',
  SignTypedDataV4 = 'eth_signTypedData_v4',
}

export enum NEOX_EVENT {
  INIT_CHAIN_ID = 'NEOLine.NEOX.EVENT.INIT_CHAIN_ID',
  EVM_ACCOUNT_CHANGED = 'NEOLine.NEOX.EVENT.EVM_ACCOUNT_CHANGED',
  EVM_NETWORK_CHANGED = 'NEOLine.NEOX.EVENT.EVM_NETWORK_CHANGED',
}
