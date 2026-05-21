import { analyzeScript } from '../../_lib/script-decompiler';
import { convertSignersToObj } from '@/app/core/utils/dapp';
import { buildDecompiledArgVMs } from './neo3-sign-transaction.arg-hints';
import {
  ContractParametersContextLike,
  deserializeContextTransaction,
} from './neo3-sign-transaction.util';

describe('deserializeContextTransaction', () => {
  it('parses transfer calls from contract parameters context data', () => {
    const context: ContractParametersContextLike = {
      data: 'AMyuSmHkUwMAAAAAAHCTAAAAAAAAE+b2AAFndptuR9Sbz3DlupoEK6q1xJXdjQEAWgsCQA0DAAwUXTdNhO+ACmFdFb1KBjooHwOUd9MMFGd2m25H1JvPcOW6mgQrqrXEld2NFMAfDAh0cmFuc2ZlcgwUz3bii9AGLEpHjuNVYQETGfPPpNJBYn1bUg==',
      hash: 'a08ca4c4671c6c8a3d9bbe68021a1ceca78fdb3aba757e8c00419c05b025d68d',
      items: {
        '8ddd95c4b5aa2b049abae570cf9bd4476e9b7667': {
          parameters: [],
          script: '',
          signatures: {},
        },
      },
      network: 894710606,
      type: 'Neo.Network.P2P.Payloads.Transaction',
    };

    const transaction = deserializeContextTransaction(context);
    const result = analyzeScript(transaction.script.toString());

    expect(result.incomplete)
      .withContext(transaction.script.toString() + '\n' + result.disassembly)
      .toBeFalse();
    expect(result.calls).toEqual([
      {
        hash: '0xd2a4cff31913016155e38e474a2c06d08be276cf',
        method: 'transfer',
        args: [
          {
            type: 'Hash160',
            value: '8ddd95c4b5aa2b049abae570cf9bd4476e9b7667',
          },
          {
            type: 'Hash160',
            value: 'd37794031f283a064abd155d610a80ef844d375d',
          },
          {
            type: 'Integer',
            value: '200000',
          },
          {
            type: 'Any',
            value: null,
          },
        ],
        isNative: true,
        nativeName: 'GasToken',
        callFlags: 15,
        callFlagsLabel: 'All',
      },
    ]);
    expect(buildDecompiledArgVMs(result.calls[0])).toEqual([
      {
        name: 'Param #1',
        type: 'Hash160',
        value: '8ddd95c4b5aa2b049abae570cf9bd4476e9b7667',
      },
      {
        name: 'Param #2',
        type: 'Hash160',
        value: 'd37794031f283a064abd155d610a80ef844d375d',
      },
      {
        name: 'Param #3',
        type: 'Integer',
        value: '200000',
      },
      {
        name: 'Param #4',
        type: 'Any',
        value: 'null',
      },
    ]);
  });

  it('keeps bridge depositNative Hash160 arguments as script hashes', () => {
    const context: ContractParametersContextLike = {
      type: 'Neo.Network.P2P.Payloads.Transaction',
      hash: '1fee32a82bf6e5ae67d47d96ba9cb5f10e20e1e2afbdded0dcd3e289a0b9f206',
      data: 'AJ1DzIAkYRkAAAAAAFiXAAAAAAAAWvz2AAFndptuR9Sbz3DlupoEK6q1xJXdjRACLkIHP/SVnyqYYFZKCJo81EREqSvPduKL0AYsSkeO41VhARMZ88+k0gBjAkBCDwACAOH1BQwUbACL08PwJxXMGG9qngXkxQQzdu0MFGd2m25H1JvPcOW6mgQrqrXEld2NFMAfDA1kZXBvc2l0TmF0aXZlDBQuQgc/9JWfKphgVkoImjzURESpK0FifVtS',
      items: {
        '8ddd95c4b5aa2b049abae570cf9bd4476e9b7667': {
          script: '',
          parameters: [],
          signatures: {},
        },
      },
      network: 894710606,
    };

    const transaction = deserializeContextTransaction(context);
    const result = analyzeScript(transaction.script.toString());

    expect(result.incomplete)
      .withContext(transaction.script.toString() + '\n' + result.disassembly)
      .toBeFalse();
    expect(result.calls).toEqual([
      {
        hash: '0x2ba94444d43c9a084a5660982a9f95f43f07422e',
        method: 'depositNative',
        args: [
          {
            type: 'Hash160',
            value: '8ddd95c4b5aa2b049abae570cf9bd4476e9b7667',
          },
          {
            type: 'Hash160',
            value: 'ed763304c5e4059e6a6f18cc1527f0c3d38b006c',
          },
          {
            type: 'Integer',
            value: '100000000',
          },
          {
            type: 'Integer',
            value: '1000000',
          },
        ],
        isNative: false,
        nativeName: undefined,
        callFlags: 15,
        callFlagsLabel: 'All',
      },
    ]);
    expect(
      buildDecompiledArgVMs(result.calls[0], [
        { name: 'from' },
        { name: 'to' },
        { name: 'amount' },
        { name: 'maxFee' },
      ]),
    ).toEqual([
      {
        name: 'from',
        type: 'Hash160',
        value: '8ddd95c4b5aa2b049abae570cf9bd4476e9b7667',
      },
      {
        name: 'to',
        type: 'Hash160',
        value: 'ed763304c5e4059e6a6f18cc1527f0c3d38b006c',
      },
      {
        name: 'amount',
        type: 'Integer',
        value: '100000000',
      },
      {
        name: 'maxFee',
        type: 'Integer',
        value: '1000000',
      },
    ]);
    expect(
      convertSignersToObj(
        transaction.signers.map((signer) => signer.export()),
      ),
    ).toEqual([
      {
        name: 'account',
        value: '8ddd95c4b5aa2b049abae570cf9bd4476e9b7667',
      },
      {
        name: 'allowedContracts',
        value:
          '["0x2ba94444d43c9a084a5660982a9f95f43f07422e","0xd2a4cff31913016155e38e474a2c06d08be276cf"]',
      },
      {
        name: 'allowedGroups',
        value: '[]',
      },
      {
        name: 'scopes',
        value: 'CustomContracts',
      },
    ]);
  });
});
