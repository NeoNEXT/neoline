import { DecompiledArg, DecompiledCall } from '../../_lib/script-decompiler';

export interface DecompiledArgVM {
  name: string;
  type: DecompiledArg['type'];
  value: string;
}

interface ContractParameterLike {
  name?: string;
  type?: string;
}

export function buildDecompiledArgVMs(
  call: Pick<DecompiledCall, 'args'>,
  parameters: ContractParameterLike[] = [],
): DecompiledArgVM[] {
  return call.args.map((arg, index) => {
    return {
      name: parameters[index]?.name ?? `Param #${index + 1}`,
      type: arg.type,
      value: formatDecompiledArg(arg),
    };
  });
}

function formatDecompiledArg(arg: DecompiledArg): string {
  switch (arg.type) {
    case 'Integer':
      return arg.value;
    case 'Boolean':
      return String(arg.value);
    case 'Any':
      return 'null';
    case 'Hash160':
      return arg.value;
    case 'ByteString':
      return '0x' + arg.hex;
    case 'Array':
      return (
        '[' + arg.value.map((item) => formatDecompiledArg(item)).join(', ') + ']'
      );
    case 'Struct':
      return (
        '(' + arg.value.map((item) => formatDecompiledArg(item)).join(', ') + ')'
      );
    case 'Map':
      return (
        '{' +
        arg.value
          .map(
            ({ key, value }) =>
              `${formatDecompiledArg(key)}: ${formatDecompiledArg(value)}`,
          )
          .join(', ') +
        '}'
      );
  }
}
