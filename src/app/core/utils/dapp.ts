import { tx } from '@cityofzion/neon-core-neo3';

export function convertValueToString(item): string {
  if (item.value === null) return 'null';
  if (item.value === undefined) return '';

  if (
    item.type === 'String' ||
    item.type === 'Number' ||
    item.type === 'Boolean'
  )
    return String(item.value);

  // Array: recursive processing
  if (item.type === 'Array')
    return `[${item.value
      .map((v) => convertValueToString(v))
      .join(', ')}]`;

  // Map: NEO's map is a {key, value}[] structure
  if (
    item.type === 'Map' &&
    item.value.length &&
    item.value[0].key !== undefined
  ) {
    return JSON.stringify(
      item.value.map((entry) => ({
        key: convertValueToString(entry.key),
        value: convertValueToString(entry.value),
      }))
    );
  }

  // Other (HexString, object) unified JSONization
  try {
    return String(item.value);
  } catch {
    return JSON.stringify(item.value);
  }
}

export function convertSignersToObj(signers: tx.SignerLike[]) {
  const signersObj = [];
  signers.forEach((signer) => {
    Object.keys(signer).forEach((key) => {
      signersObj.push({
        name: key,
        value: JSON.stringify(signer[key]),
      });
    });
  });
  return signersObj;
}
