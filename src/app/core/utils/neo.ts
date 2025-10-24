import { sc, u } from '@cityofzion/neon-core-neo3';
import { wallet as wallet2, tx as tx2, rpc as rpc2 } from '@cityofzion/neon-js';
import { TxHashAttribute } from '@/models/dapi';
import { str2hexstring } from '@cityofzion/neon-core-neo3/lib/u';

import { base642hex, hexstring2str } from '@cityofzion/neon-core-neo3/lib/u';
import BigNumber from 'bignumber.js';
import { RpcNetwork } from '@/app/popup/_lib/type';

export function parseNeo2TxHashAttr(
  { type, value, txAttrUsage }: TxHashAttribute,
  isAddressToHex = false
): TxHashAttribute {
  let parsedValue = zeroPad(value, 64, true);
  switch (type) {
    case 'Boolean':
      parsedValue = zeroPad(
        !!value ? sc.OpCode.PUSHT : sc.OpCode.PUSHF,
        64,
        true
      );
      break;
    case 'Address':
      parsedValue = zeroPad(
        u.reverseHex(wallet2.getScriptHashFromAddress(value)),
        64,
        true
      );
      break;
    case 'Integer':
      const h = Number(value).toString(16);
      parsedValue = zeroPad(u.reverseHex(h.length % 2 ? '0' + h : h), 64, true);
      break;
    case 'String':
      parsedValue = zeroPad(u.ab2hexstring(u.str2ab(value)), 64, true);
      break;
  }

  if (isAddressToHex && (txAttrUsage as any) === 'Remark14') {
    parsedValue = str2hexstring(value);
  }

  return {
    type,
    value: parsedValue,
    txAttrUsage,
  };
}

export function isAsset(assetId: string): boolean {
  return assetId.startsWith('0x')
    ? assetId.length === 66
    : assetId.length === 64;
}
export function getNeo2VerificationSignatureForSmartContract(
  ScriptHash: string,
  network: RpcNetwork
): Promise<any> {
  return rpc2.Query.getContractState(ScriptHash)
    .execute(network.rpcUrl)
    .then(({ result }) => {
      const { parameters } = result;
      return new tx2.Witness({
        invocationScript: '00'.repeat(parameters.length),
        verificationScript: '',
      });
    });
}

export function handleNeo3StackNumberValue(result): number {
  let res = 0;
  if (result.state === 'HALT' && result.stack?.[0]?.value) {
    res = result.stack[0].value;
    if (result.stack[0].type === 'Integer') {
      res = Number(result.stack[0].value || 0);
    }
    if (result.stack[0].type === 'ByteArray') {
      const hexStr = u.reverseHex(result.stack[0].value);
      res = new BigNumber(hexStr || 0, 16).toNumber();
    }
  }
  return res;
}

export function handleNeo3StackNumber(result): string {
  let res;
  if (result.type === 'Integer') {
    res = result.value;
  }
  if (result.type === 'ByteArray') {
    const hexStr = u.reverseHex(result.value);
    res = new BigNumber(hexStr || 0, 16).toFixed();
  }
  return res;
}

export function handleNeo3StackStringValue(result): string {
  let res = '';
  if (result.state === 'HALT' && result.stack?.[0]?.value) {
    res = result.stack[0].value;
    if (result.stack[0].type === 'ByteArray') {
      res = hexstring2str(result.stack[0].value);
    }
    if (result.stack[0].type === 'ByteString') {
      res = hexstring2str(base642hex(result.stack[0].value));
    }
  }
  return res;
}

function zeroPad(
  input: string | any[] | sc.OpCode,
  length: number,
  padEnd?: boolean
) {
  const zero = '0';
  input = String(input);

  if (length - input.length <= 0) {
    return input;
  }

  if (padEnd) {
    return input + zero.repeat(length - input.length);
  }

  return zero.repeat(length - input.length) + input;
}
