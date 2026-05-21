import { tx } from '@cityofzion/neon-core-neo3';
import {
  toString as witnessScopeToString,
  WitnessScope,
} from '@cityofzion/neon-core-neo3/lib/tx/components/WitnessScope';

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

type SignerDisplayInput = Partial<tx.SignerLike>;

export function convertSignersToObj(signers: SignerDisplayInput[] = []) {
  const signersObj = [];
  signers.forEach((signer) => {
    const normalizedSigner = normalizeSignerForDisplay(signer);
    Object.keys(normalizedSigner).forEach((key) => {
      signersObj.push({
        name: key,
        value: formatSignerValue(normalizedSigner[key]),
      });
    });
  });
  return signersObj;
}

function normalizeSignerForDisplay(signer: SignerDisplayInput) {
  const output: Record<string, unknown> = {};
  const signerRecord = signer as Record<string, unknown>;
  const hasStandardSignerShape =
    hasOwn(signerRecord, 'account') && hasOwn(signerRecord, 'scopes');

  if (hasOwn(signerRecord, 'account')) {
    output.account = hexishToString(signer.account);
  }
  if (hasStandardSignerShape || hasOwn(signerRecord, 'allowedContracts')) {
    output.allowedContracts = normalizeAllowedContracts(
      signer.allowedContracts,
    );
  }
  if (hasStandardSignerShape || hasOwn(signerRecord, 'allowedGroups')) {
    output.allowedGroups = normalizeHexishArray(signer.allowedGroups);
  }
  if (hasOwn(signerRecord, 'scopes')) {
    output.scopes = formatWitnessScopes(signer.scopes);
  }
  if (hasOwn(signerRecord, 'rules')) {
    output.rules = signer.rules;
  }

  Object.keys(signerRecord).forEach((key) => {
    if (!hasOwn(output, key)) {
      output[key] = signerRecord[key];
    }
  });

  return output;
}

function normalizeAllowedContracts(value: unknown): string[] {
  return normalizeHexishArray(value).map(
    (hash) => `0x${hash.replace(/^0x/i, '')}`,
  );
}

function normalizeHexishArray(value: unknown): string[] {
  return Array.isArray(value) ? value.map(hexishToString) : [];
}

function hexishToString(value: unknown): string {
  const maybeHexString = value as { toBigEndian?: unknown };
  if (value && typeof maybeHexString.toBigEndian === 'function') {
    return (value as { toBigEndian: () => string }).toBigEndian();
  }
  return String(value || '');
}

function formatWitnessScopes(scopes: unknown): string {
  if (typeof scopes === 'number') {
    return formatWitnessScopeBits(scopes);
  }
  if (typeof scopes === 'string') {
    const numericScopes = Number(scopes);
    return Number.isNaN(numericScopes)
      ? scopes
      : formatWitnessScopeBits(numericScopes);
  }
  return String(scopes || '');
}

function formatWitnessScopeBits(scopes: number): string {
  return witnessScopeToString(scopes as WitnessScope) || String(scopes);
}

function formatSignerValue(value: unknown): string {
  if (value === null) return 'null';
  if (value === undefined) return '';
  if (
    typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'boolean'
  ) {
    return String(value);
  }
  return JSON.stringify(value);
}

function hasOwn(value: object, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(value, key);
}
