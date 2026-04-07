import {
  rpc,
  sc,
  tx,
  u,
  wallet as wallet3,
} from '@cityofzion/neon-core-neo3/lib';
import {
  Transaction,
  Witness,
} from '@cityofzion/neon-core-neo3/lib/tx';
import {
  TransactionAttribute,
  TransactionAttributeJson,
} from '@cityofzion/neon-core-neo3/lib/tx/components';
import BigNumber from 'bignumber.js';
import { ERRORS } from '../common/data_module_neo2';
import { normalizeNeoDapiError } from '../../cross-runtime/neo-dapi-error';

interface InvokeArg extends sc.ContractCall {
  abortOnFail?: boolean;
}

interface CreateNeo3TxInput {
  rpcUrl: string;
  invokeArgs: InvokeArg[];
  signers: any[];
  networkFee?: string;
  systemFee?: string;
  overrideSystemFee?: string;
  attributes?: TransactionAttributeJson[];
  validUntilBlock?: number;
}

// 这里只是为了给 RPC 估算手续费提供结构合法的 witness，因此固定的临时私钥就够了。
// This is only used to provide a structurally valid witness for RPC fee estimation, so a fixed temporary private key is sufficient.
const DUMMY_NETWORK_FEE_WIF = 'KyEUreM7QVQvzUMeGSBTKVtQahKumHyWG6Dj331Vqg5ZWJ8EoaC1';

function asCreateNeo3TxError(error: any, fallback = ERRORS.UNKNOWN) {
  return normalizeNeoDapiError(error, fallback);
}

function toInvokeScript(invokeArgs: InvokeArg[]) {
  const hasAbortOnFail = invokeArgs.some((item) => item.abortOnFail);
  if (!hasAbortOnFail) {
    return sc.createScript(...invokeArgs);
  }

  const sb = new sc.ScriptBuilder();
  for (const item of invokeArgs) {
    if (!item.scriptHash) {
      throw new Error('No scriptHash found!');
    }
    if (!item.operation) {
      throw new Error('No operation found!');
    }
    sb.emitContractCall(item);
    if (item.abortOnFail) {
      // 调用方要求 abortOnFail 时，追加 ASSERT 以实现整段脚本的全有或全无执行。
      // When the caller requests abortOnFail, append ASSERT to make the whole script execute atomically.
      sb.emit(sc.OpCode.ASSERT);
    }
  }

  return sb.build();
}

function toRpcSigners(signers: any[]) {
  return signers.map((signerItem: any) => {
    let scopes = signerItem.scopes;
    if (
      isNaN(Number(signerItem.scopes)) === false &&
      tx.WitnessScope[signerItem.scopes]
    ) {
      scopes = tx.WitnessScope[signerItem.scopes];
    }

    return {
      account: signerItem.account,
      scopes,
      allowedcontracts:
        signerItem?.allowedContracts?.map((item) => item.toString()) || [],
      allowedgroups:
        signerItem?.allowedGroups?.map((item) => item.toString()) || [],
      rules: signerItem?.rules,
    };
  });
}

async function calculateNetworkFee(
  rpcClient: rpc.RPCClient,
  txn: tx.Transaction,
) {
  let txClone = new tx.Transaction({
    signers: txn.signers,
    validUntilBlock: txn.validUntilBlock,
    systemFee: txn.systemFee,
    script: txn.script,
  });
  txClone = new tx.Transaction(txClone);

  // calculatenetworkfee 需要每个 signer 都带上可执行的 witness；空 witness 会被节点当成“未知地址/合约”。
  // calculatenetworkfee requires each signer to carry an executable witness; an empty witness is treated by the node as an "unknown address/contract".
  (txClone as Transaction).witnesses = txn.signers.map(() =>
    buildNetworkFeeWitness(),
  );

  return rpcClient.calculateNetworkFee(txClone);
}

function buildNetworkFeeWitness(contractScript?: string) {
  const verificationScript = decodeContractScript(contractScript);

  if (!verificationScript) {
    const dummyAccount = new wallet3.Account(DUMMY_NETWORK_FEE_WIF);
    return tx.Witness.fromSignature('00'.repeat(64), dummyAccount.publicKey);
  }

  const publicKeys =
    wallet3.getPublicKeysFromVerificationScript(verificationScript);
  const threshold =
    publicKeys.length > 1
      ? wallet3.getSigningThresholdFromVerificationScript(verificationScript) || 1
      : 1;
  const invocationScript = Array.from(
    { length: publicKeys.length > 1 ? threshold : 1 },
    () => `0c40${'00'.repeat(64)}`,
  ).join('');

  return new Witness({
    invocationScript,
    verificationScript,
  });
}

function decodeContractScript(script?: string) {
  if (!script) {
    return '';
  }

  const normalized = script.startsWith('0x') ? script.slice(2) : script;

  if (/^[0-9a-fA-F]+$/.test(normalized) && normalized.length % 2 === 0) {
    return normalized;
  }

  return Buffer.from(script, 'base64').toString('hex');
}

export function handleInvokeArgs(args: any[]) {
  return (args || []).map((item) => {
    if (item && item.type === 'Address') {
      // 把 Address 参数转换成 Hash160，确保合约调用收到的是标准 Neo3 值。
      // Convert Address parameters to Hash160 so contract calls receive the standard Neo3 value.
      return sc.ContractParam.hash160(item.value.toString());
    }
    if (item) {
      return sc.ContractParam.fromJson(item);
    }
    return null;
  });
}

export async function createNeo3Tx(
  params: CreateNeo3TxInput,
): Promise<Transaction> {
  try {
    const rpcClient = new rpc.RPCClient(params.rpcUrl);
    let signerJson;
    let script;
    let currentHeight;
    let attributes;

    try {
      signerJson = toRpcSigners(params.signers);
      script = toInvokeScript(params.invokeArgs);
      attributes = (params.attributes || []).map((attribute) =>
        TransactionAttribute.fromJson(attribute),
      );
    } catch (error) {
      throw asCreateNeo3TxError(error, ERRORS.MALFORMED_INPUT);
    }

    try {
      currentHeight = await rpcClient.getBlockCount();
    } catch (error) {
      throw asCreateNeo3TxError(error, ERRORS.RPC_ERROR);
    }

    const transaction = new tx.Transaction({
      signers: params.signers,
      validUntilBlock: params.validUntilBlock ?? currentHeight + 30,
      script,
    });
    transaction.attributes = attributes;

    if (params.overrideSystemFee) {
      try {
        transaction.systemFee = u.BigInteger.fromDecimal(
          params.overrideSystemFee,
          8,
        );
      } catch (error) {
        throw asCreateNeo3TxError(error, ERRORS.MALFORMED_INPUT);
      }
    } else {
      // 在挂真实签名前先预执行脚本，用于推导 system fee。
      // Pre-execute the script before attaching real signatures to derive the system fee.
      let invokeScriptResponse: any;
      try {
        invokeScriptResponse = await rpcClient.invokeScript(
          u.HexString.fromHex(script).toBase64(),
          signerJson,
        );
      } catch (error) {
        throw asCreateNeo3TxError(error, ERRORS.RPC_ERROR);
      }
      if (invokeScriptResponse.state !== 'HALT') {
        throw asCreateNeo3TxError(invokeScriptResponse, ERRORS.RPC_ERROR);
      }

      try {
        const requiredSystemFee = u.BigInteger.fromNumber(
          new BigNumber(invokeScriptResponse.gasconsumed)
            .times(1.01)
            .toFixed(0),
        );
        transaction.systemFee = requiredSystemFee.add(
          u.BigInteger.fromDecimal(params.systemFee || 0, 8),
        );
      } catch (error) {
        throw asCreateNeo3TxError(error, ERRORS.MALFORMED_INPUT);
      }
    }

    // network fee 依赖 witness 结构，因此要在交易主体确定后再估算。
    // Network fee depends on the witness structure, so estimate it only after the transaction body is finalized.
    let networkFeeEstimate;
    try {
      networkFeeEstimate = await calculateNetworkFee(
        rpcClient,
        transaction,
      );
    } catch (error) {
      throw asCreateNeo3TxError(error, ERRORS.RPC_ERROR);
    }

    try {
      transaction.networkFee = u.BigInteger.fromNumber(networkFeeEstimate).add(
        u.BigInteger.fromDecimal(params.networkFee || 0, 8),
      );
    } catch (error) {
      throw asCreateNeo3TxError(error, ERRORS.MALFORMED_INPUT);
    }

    return transaction;
  } catch (error) {
    throw asCreateNeo3TxError(error, ERRORS.UNKNOWN);
  }
}
