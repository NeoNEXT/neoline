import { getScriptHashFromAddress } from '../../common/utils';
import { wallet as wallet3 } from '@cityofzion/neon-core-neo3/lib';
import { requestTargetN3 } from '../../common/data_module_neo3';
import { windowCallback } from '../tool';
import { RequestHandlerModule } from './context';

const addressToScriptHash: RequestHandlerModule = {
  targets: [requestTargetN3.AddressToScriptHash],
  handle: ({ request }) => {
    const scriptHash = getScriptHashFromAddress(request.parameter.address);
    windowCallback({
      data: { scriptHash },
      return: requestTargetN3.AddressToScriptHash,
      ID: request.ID,
    });
    return;
  },
};

const scriptHashToAddress: RequestHandlerModule = {
  targets: [requestTargetN3.ScriptHashToAddress],
  handle: ({ request }) => {
    const scriptHash = request.parameter.scriptHash;
    const str = scriptHash.startsWith('0x')
      ? scriptHash.substring(2, 44)
      : scriptHash;
    const address = wallet3.getAddressFromScriptHash(str);
    windowCallback({
      data: { address },
      return: requestTargetN3.ScriptHashToAddress,
      ID: request.ID,
    });
    return;
  },
};

export default [addressToScriptHash, scriptHashToAddress];
