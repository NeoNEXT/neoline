import { sc, tx } from '@cityofzion/neon-core-neo3/lib';

interface Neo3Params {
  scriptHash: string;
  operation: string;
  args: sc.ContractParam[];
  fee?: string;
  minReqFee?: string;
  extraSystemFee?: string;
  overrideSystemFee?: string;
  broadcastOverride?: boolean;
  signers: tx.SignerLike[];
}

export interface Neo3InvokeParams extends Neo3Params {
  scriptHash: string;
  operation: string;
  args: sc.ContractParam[];
}

export interface Neo3InvokeMultipleParams extends Neo3Params {
  invokeArgs: sc.ContractCall[];
}
