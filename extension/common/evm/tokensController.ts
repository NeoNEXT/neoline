import { ethers } from 'ethers';
import { is, pattern, string } from 'superstruct';
import BN from 'bn.js';
import {
  keccak224,
  keccak384,
  keccak256 as k256,
  keccak512,
} from 'likloadm-ethereum-cryptography/keccak';
import contractsMap from './contract-map.json';
import { abiERC721 } from './abiERC721';
import { abiERC1155 } from './abiERC1155';

const ERC721_INTERFACE_ID = '0x80ac58cd';
const ERC721_METADATA_INTERFACE_ID = '0x5b5e139f';
const ERC1155_INTERFACE_ID = '0xd9b67a26';

export async function detectIsERC1155(tokenAddress: string, provider) {
  const contract = new ethers.Contract(tokenAddress, abiERC1155, provider);
  try {
    const isERC721 = await contract.supportsInterface(ERC1155_INTERFACE_ID);
    if (isERC721) {
      return true;
    } else {
      return false;
    }
  } catch (error) {
    // currently we see a variety of errors across different networks when
    // token contracts are not ERC721 compatible. We need to figure out a better
    // way of differentiating token interface types but for now if we get an error
    // we have to assume the token is not ERC721 compatible.
    return false;
  }
}

/**
 * Detects whether or not a token is ERC-721 compatible.
 *
 * @param tokenAddress - The token contract address.
 * @param networkClientId - Optional network client ID to fetch contract info with.
 * @returns A boolean indicating whether the token address passed in supports the EIP-721
 * interface.
 */
export async function detectIsERC721(tokenAddress: string, provider) {
  const checksumAddress = toChecksumHexAddress(tokenAddress);
  // if this token is already in our contract metadata map we don't need
  // to check against the contract
  if (contractsMap[checksumAddress]?.erc721 === true) {
    return Promise.resolve(true);
  } else if (contractsMap[checksumAddress]?.erc20 === true) {
    return Promise.resolve(false);
  }

  const contract = new ethers.Contract(tokenAddress, abiERC721, provider);
  try {
    const isERC721 = await contract.supportsInterface(ERC721_INTERFACE_ID);
    if (isERC721) {
      return true;
    } else {
      return false;
    }
  } catch (error) {
    // currently we see a variety of errors across different networks when
    // token contracts are not ERC721 compatible. We need to figure out a better
    // way of differentiating token interface types but for now if we get an error
    // we have to assume the token is not ERC721 compatible.
    return false;
  }
}

/**
 * Convert an address to a checksummed hexadecimal address.
 *
 * @param address - The address to convert.
 * @returns The address in 0x-prefixed hexadecimal checksummed form if it is valid.
 */
export function toChecksumHexAddress(address: string): string;

/**
 * Convert an address to a checksummed hexadecimal address.
 *
 * Note that this particular overload does nothing.
 *
 * @param address - A value that is not a string (e.g. `undefined` or `null`).
 * @returns The `address` untouched.
 * @deprecated This overload is designed to gracefully handle an invalid input
 * and is only present for backward compatibility. It may be removed in a future
 * major version. Please pass a string to `toChecksumHexAddress` instead.
 */
export function toChecksumHexAddress<T>(address: T): T;

// Tools only see JSDocs for overloads and ignore them for the implementation.
export function toChecksumHexAddress(address: unknown) {
  if (typeof address !== 'string') {
    // Mimic behavior of `addHexPrefix` from `ethereumjs-util` (which this
    // function was previously using) for backward compatibility.
    return address;
  }

  const hexPrefixed = add0x(address);

  if (!isHexString(hexPrefixed)) {
    // Version 5.1 of ethereumjs-util would have returned '0xY' for input 'y'
    // but we shouldn't waste effort trying to change case on a clearly invalid
    // string. Instead just return the hex prefixed original string which most
    // closely mimics the original behavior.
    return hexPrefixed;
  }

  return toChecksumAddress(hexPrefixed);
}
export type Hex = `0x${string}`;
/**
 * Add the `0x`-prefix to a hexadecimal string. If the string already has the
 * prefix, it is returned as-is.
 *
 * @param hexadecimal - The hexadecimal string to add the prefix to.
 * @returns The prefixed hexadecimal string.
 */
export function add0x(hexadecimal: string): Hex {
  if (hexadecimal.startsWith('0x')) {
    return hexadecimal as Hex;
  }

  if (hexadecimal.startsWith('0X')) {
    return `0x${hexadecimal.substring(2)}`;
  }

  return `0x${hexadecimal}`;
}

export const HexStruct = pattern(string(), /^(?:0x)?[0-9a-f]+$/iu);
/**
 * Check if a string is a valid hex string.
 *
 * @param value - The value to check.
 * @returns Whether the value is a valid hex string.
 */
export function isHexString(value: unknown): value is string {
  return is(value, HexStruct);
}

/*
 * A type that represents a BNLike input that can be converted to a BN.
 */
export type BNLike = BN | PrefixedHexString | number | Buffer;
/*
 * A type that represents a `0x`-prefixed hex string.
 */
export type PrefixedHexString = string;

/**
 * Throws if a string is not hex prefixed
 * @param {string} input string to check hex prefix of
 */
export const assertIsHexString = function (input: string): void {
  if (!isHexString(input)) {
    const msg = `This method only supports 0x-prefixed hex strings but input was: ${input}`;
    throw new Error(msg);
  }
};
/**
 * Returns a checksummed address.
 *
 * If a eip1191ChainId is provided, the chainId will be included in the checksum calculation. This
 * has the effect of checksummed addresses for one chain having invalid checksums for others.
 * For more details see [EIP-1191](https://eips.ethereum.org/EIPS/eip-1191).
 *
 * WARNING: Checksums with and without the chainId will differ. As of 2019-06-26, the most commonly
 * used variation in Ethereum was without the chainId. This may change in the future.
 */
export const toChecksumAddress = function (
  hexAddress: string,
  eip1191ChainId?: BNLike
): string {
  assertIsHexString(hexAddress);
  const address = stripHexPrefix(hexAddress).toLowerCase();

  let prefix = '';
  if (eip1191ChainId) {
    const chainId = toType(eip1191ChainId, TypeOutput.BN);
    prefix = chainId.toString() + '0x';
  }

  const hash = keccakFromString(prefix + address).toString('hex');
  let ret = '0x';

  for (let i = 0; i < address.length; i++) {
    if (parseInt(hash[i], 16) >= 8) {
      ret += address[i].toUpperCase();
    } else {
      ret += address[i];
    }
  }

  return ret;
};

const keccakFromString = function (a: string, bits: number = 256) {
  assertIsString(a);
  const buf = Buffer.from(a, 'utf8');
  return keccak(buf, bits);
};

/**
 * Throws if input is not a string
 * @param {string} input value to check
 */
export const assertIsString = function (input: string): void {
  if (typeof input !== 'string') {
    const msg = `This method only supports strings but input was: ${input}`;
    throw new Error(msg);
  }
};

/**
 * Creates Keccak hash of a Buffer input
 * @param a The input data (Buffer)
 * @param bits (number = 256) The Keccak width
 */
export const keccak = function (a: Buffer, bits: number = 256): Buffer {
  assertIsBuffer(a);
  switch (bits) {
    case 224: {
      return keccak224(a);
    }
    case 256: {
      return k256(a);
    }
    case 384: {
      return keccak384(a);
    }
    case 512: {
      return keccak512(a);
    }
    default: {
      throw new Error(`Invald algorithm: keccak${bits}`);
    }
  }
};

/**
 * Throws if input is not a buffer
 * @param {Buffer} input value to check
 */
export const assertIsBuffer = function (input: Buffer): void {
  if (!Buffer.isBuffer(input)) {
    const msg = `This method only supports Buffer but input was: ${input}`;
    throw new Error(msg);
  }
};

function stripHexPrefix(str) {
  if (typeof str !== 'string') {
    return str;
  }

  return isHexPrefixed(str) ? str.slice(2) : str;
}

function isHexPrefixed(str) {
  if (typeof str !== 'string') {
    throw new Error(
      "[is-hex-prefixed] value must be type 'string', is currently type " +
        typeof str +
        ', while checking isHexPrefixed.'
    );
  }

  return str.slice(0, 2) === '0x';
}

/**
 * Type output options
 */
export enum TypeOutput {
  Number,
  BN,
  Buffer,
  PrefixedHexString,
}
/*
 * A type that represents an object that has a `toArray()` method.
 */
export interface TransformableToArray {
  toArray(): Uint8Array;
  toBuffer?(): Buffer;
}

/*
 * A type that represents an object that has a `toBuffer()` method.
 */
export interface TransformableToBuffer {
  toBuffer(): Buffer;
  toArray?(): Uint8Array;
}
export type ToBufferInputTypes =
  | PrefixedHexString
  | number
  | BN
  | Buffer
  | Uint8Array
  | number[]
  | TransformableToArray
  | TransformableToBuffer
  | null
  | undefined;
export type TypeOutputReturnType = {
  [TypeOutput.Number]: number;
  [TypeOutput.BN]: BN;
  [TypeOutput.Buffer]: Buffer;
  [TypeOutput.PrefixedHexString]: PrefixedHexString;
};

/**
 * Attempts to turn a value into a `Buffer`.
 * Inputs supported: `Buffer`, `String`, `Number`, null/undefined, `BN` and other objects with a `toArray()` or `toBuffer()` method.
 * @param v the value
 */
export const toBuffer = function (v: ToBufferInputTypes): Buffer {
  if (v === null || v === undefined) {
    return Buffer.allocUnsafe(0);
  }

  if (Buffer.isBuffer(v)) {
    return Buffer.from(v);
  }

  if (Array.isArray(v) || v instanceof Uint8Array) {
    return Buffer.from(v as Uint8Array);
  }

  if (typeof v === 'string') {
    if (!isHexString(v)) {
      throw new Error(
        `Cannot convert string to buffer. toBuffer only supports 0x-prefixed hex strings and this string was given: ${v}`
      );
    }
    return Buffer.from(padToEven(stripHexPrefix(v)), 'hex');
  }

  if (typeof v === 'number') {
    return intToBuffer(v);
  }

  if (BN.isBN(v)) {
    return v.toArrayLike(Buffer);
  }

  if (v.toArray) {
    // converts a BN to a Buffer
    return Buffer.from(v.toArray());
  }

  if (v.toBuffer) {
    return Buffer.from(v.toBuffer());
  }

  throw new Error('invalid type');
};
/**
 * Pads a `String` to have an even length
 * @param {String} value
 * @return {String} output
 */
function padToEven(value) {
  var a = value; // eslint-disable-line

  if (typeof a !== 'string') {
    throw new Error(
      '[ethjs-util] while padding to even, value must be string, is currently ' +
        typeof a +
        ', while padToEven.'
    );
  }

  if (a.length % 2) {
    a = '0' + a;
  }

  return a;
}
/**
 * Converts a `Number` into a hex `String`
 * @param {Number} i
 * @return {String}
 */
function intToHex(i) {
  var hex = i.toString(16); // eslint-disable-line

  return '0x' + hex;
}
/**
 * Converts an `Number` to a `Buffer`
 * @param {Number} i
 * @return {Buffer}
 */
function intToBuffer(i) {
  var hex = intToHex(i);

  return new Buffer(padToEven(hex.slice(2)), 'hex');
}
/**
 * Convert an input to a specified type
 * @param input value to convert
 * @param outputType type to output
 */
export function toType<T extends TypeOutput>(
  input: ToBufferInputTypes,
  outputType: T
): TypeOutputReturnType[T] {
  if (typeof input === 'string' && !isHexString(input)) {
    throw new Error(
      `A string must be provided with a 0x-prefix, given: ${input}`
    );
  } else if (typeof input === 'number' && !Number.isSafeInteger(input)) {
    throw new Error(
      'The provided number is greater than MAX_SAFE_INTEGER (please use an alternative input type)'
    );
  }

  input = toBuffer(input);

  if (outputType === TypeOutput.Buffer) {
    return input as any;
  } else if (outputType === TypeOutput.BN) {
    return new BN(input) as any;
  } else if (outputType === TypeOutput.Number) {
    const bn = new BN(input);
    const max = new BN(Number.MAX_SAFE_INTEGER.toString());
    if (bn.gt(max)) {
      throw new Error(
        'The provided number is greater than MAX_SAFE_INTEGER (please use an alternative output type)'
      );
    }
    return bn.toNumber() as any;
  } else {
    // outputType === TypeOutput.PrefixedHexString
    return `0x${input.toString('hex')}` as any;
  }
}
