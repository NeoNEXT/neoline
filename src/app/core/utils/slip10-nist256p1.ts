import { hmac } from '@noble/hashes/hmac';
import { sha512 } from '@noble/hashes/sha512';
import { concatBytes, utf8ToBytes } from '@noble/hashes/utils';
import { p256 } from '@noble/curves/p256';

export interface ExtKey {
  key: bigint;
  chainCode: Uint8Array;
}

const MASTER_KEY = utf8ToBytes('Nist256p1 seed');
const CURVE_ORDER =
  0xffffffff00000000ffffffffffffffffbce6faada7179e84f3b9cac2fc632551n;

function hmacSha512(key: Uint8Array, data: Uint8Array): Uint8Array {
  return hmac(sha512, key, data);
}

function ser32(i: number): Uint8Array {
  const b = new Uint8Array(4);
  b[0] = (i >>> 24) & 0xff;
  b[1] = (i >>> 16) & 0xff;
  b[2] = (i >>> 8) & 0xff;
  b[3] = i & 0xff;
  return b;
}

function parse256(bytes: Uint8Array): bigint {
  let value = 0n;
  for (const byte of bytes) {
    value = (value << 8n) + BigInt(byte);
  }
  return value;
}

function ser256(key: bigint): Uint8Array {
  const out = new Uint8Array(32);
  let value = key;
  for (let i = 31; i >= 0; i--) {
    out[i] = Number(value & 0xffn);
    value >>= 8n;
  }
  return out;
}

export function slip10MasterKey(seed: Uint8Array): ExtKey {
  const i = hmacSha512(MASTER_KEY, seed);
  const key = parse256(i.slice(0, 32)) % CURVE_ORDER;
  if (key === 0n) {
    throw new Error('Invalid master key');
  }
  return { key, chainCode: i.slice(32) };
}

export function ckdPriv(
  parent: ExtKey,
  index: number,
  hardened: boolean,
): ExtKey {
  const childIndex = hardened ? (index | 0x80000000) >>> 0 : index >>> 0;
  const data = hardened
    ? concatBytes(new Uint8Array([0]), ser256(parent.key), ser32(childIndex))
    : concatBytes(p256.getPublicKey(ser256(parent.key), true), ser32(childIndex));
  const i = hmacSha512(parent.chainCode, data);
  const il = parse256(i.slice(0, 32));
  if (il >= CURVE_ORDER) {
    throw new Error('Invalid child key');
  }
  const key = (il + parent.key) % CURVE_ORDER;
  if (key === 0n) {
    throw new Error('Invalid child key');
  }
  return { key, chainCode: i.slice(32) };
}

export function derivePathNist256p1(
  seed: Uint8Array,
  path: string,
): Uint8Array {
  const parts = path.split('/');
  if (parts[0] !== 'm') {
    throw new Error('Path must start with m');
  }

  let key = slip10MasterKey(seed);
  for (let i = 1; i < parts.length; i++) {
    const segment = parts[i];
    const hardened = segment.endsWith("'");
    const indexText = hardened ? segment.slice(0, -1) : segment;
    if (!/^\d+$/.test(indexText)) {
      throw new Error(`Bad path segment: ${segment}`);
    }
    const index = Number(indexText);
    if (!Number.isSafeInteger(index) || index < 0) {
      throw new Error(`Bad index: ${segment}`);
    }
    key = ckdPriv(key, index, hardened);
  }

  return ser256(key.key);
}
