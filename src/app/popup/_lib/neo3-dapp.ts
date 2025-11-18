import { sc, tx } from '@cityofzion/neon-core-neo3/lib';

interface Neo3Params {
  fee?: string;
  minReqFee?: string;
  extraSystemFee?: string;
  overrideSystemFee?: string;
  broadcastOverride?: boolean;
  signers: tx.SignerLike[];
  signersObj?: { name: string; value: string; }[]
}

export interface Neo3InvokeParams extends Neo3Params {
  scriptHash: string;
  operation: string;
  contractName?: string;
  expandArgs?: boolean;
  expandSigners?: boolean;
  args: sc.ContractParamJson[];
  argsObj?: { name: string; value: string; type: string }[];
}

export interface Neo3InvokeMultipleParams extends Neo3Params {
  invokeArgs: (Omit<sc.ContractCallJson, 'args'> & {
    contractName?: string;
    expandArgs?: boolean;
    expandSigners?: boolean;
    args: sc.ContractParamJson[];
    argsObj?: { name: string; value: string; type: string }[];
  })[];
}

export interface N3ContractManifest {
  name: string;
  abi: { methods: N3ContractMethod[] };
  [key: string]: any;
}

interface N3ContractMethod {
  name: string;
  parameters: { type: string; name: string }[];
  [key: string]: any;
}
