import {
  base642hex,
  hex2base64,
  num2VarInt,
  reverseHex,
} from '@cityofzion/neon-core-neo3/lib/u';
import { getScriptHashFromAddress } from '@cityofzion/neon-core-neo3/lib/wallet';

/**
 * NEP-20 / NEP-21 sign data encoding.
 *
 * The injected dAPI (extension/) and the confirmation windows (src/) have to
 * agree byte for byte on what gets signed, so the encoding lives here instead
 * of in either runtime.
 */

/** The only action NEP-20 currently defines for an authentication challenge. */
export const NEP20_AUTHENTICATION_ACTION = 'Authentication';

/** How far a challenge timestamp may drift from our clock before we refuse it. */
export const NEP20_CHALLENGE_MAX_SKEW_SECONDS = 5 * 60;

export interface Nep20AuthenticationSignDataArgs {
  /** uint64 as a decimal string; never narrow it to a JS number. */
  nonce: string;
  /** uint32 seconds, the timestamp returned in the response. */
  timestamp: number;
  /** uint32 network magic. */
  network: number;
  /** Neo3 address of the signing account. */
  address: string;
  action: string;
  domain: string;
}

/**
 * NEP-20 authentication sign data:
 *
 *   uint64_le(nonce) || uint32_le(timestamp) || uint32_le(network)
 *     || UInt160(scriptHash) || VarString(action) || VarString(domain)
 *
 * `action` and `domain` are signed too, so the server can tell which action on
 * which site the user actually approved.
 */
export function buildNep20AuthenticationSignData({
  nonce,
  timestamp,
  network,
  address,
  action,
  domain,
}: Nep20AuthenticationSignDataArgs): string {
  return (
    toLittleEndianHex(nonce, 8) +
    toLittleEndianHex(timestamp, 4) +
    toLittleEndianHex(network, 4) +
    toUInt160Hex(address) +
    toVarStringHex(action) +
    toVarStringHex(domain)
  );
}

/**
 * UInt160 serialises little endian, while `getScriptHashFromAddress` returns
 * the display order used in explorers and dAPI arguments.
 */
export function toUInt160Hex(address: string): string {
  return reverseHex(getScriptHashFromAddress(address).replace(/^0x/i, ''));
}

/** Neo `VarString`: VarInt byte length followed by the UTF-8 bytes. */
export function toVarStringHex(value: string): string {
  const hex = utf8ToHex(value ?? '');
  return num2VarInt(hex.length / 2) + hex;
}

export function utf8ToHex(value: string): string {
  return Buffer.from(value, 'utf8').toString('hex');
}

export function hexToUtf8(hex: string): string {
  return Buffer.from(hex, 'hex').toString('utf8');
}

export function toLittleEndianHex(
  value: number | string,
  bytes: number,
): string {
  let parsed: bigint;
  try {
    parsed = BigInt(value);
  } catch {
    throw new Error(`Invalid integer value: ${value}`);
  }

  // BigInt literals need a newer target than the extension bundle compiles to.
  if (parsed < BigInt(0) || parsed >= BigInt(1) << BigInt(bytes * 8)) {
    throw new Error(`Value out of range for ${bytes} bytes: ${value}`);
  }

  return parsed
    .toString(16)
    .padStart(bytes * 2, '0')
    .match(/.{2}/g)
    .reverse()
    .join('');
}

/**
 * NEP-20 requires the signed network to be one both the challenge and the
 * wallet support. Prefer the network the user is currently on so the signature
 * matches what the wallet shows; otherwise take the first shared one. Returns
 * `undefined` when there is no intersection, which callers must reject.
 */
export function selectNep20Network(
  challengeNetworks: number[],
  walletNetworks: number[],
  currentNetwork?: number,
): number | undefined {
  const shared = (challengeNetworks ?? []).filter((magic) =>
    (walletNetworks ?? []).includes(magic),
  );
  if (shared.length === 0) {
    return undefined;
  }
  return currentNetwork !== undefined && shared.includes(currentNetwork)
    ? currentNetwork
    : shared[0];
}

/**
 * NEP-20's anti-phishing guarantee: the domain the user signs must exactly
 * match the hostname of the site that requested the signature.
 */
export function isNep20DomainTrusted(
  domain: string,
  hostname: string,
): boolean {
  const claimed = normalizeHostname(domain);
  const actual = normalizeHostname(hostname);
  if (!claimed || !actual) {
    return false;
  }
  return actual === claimed;
}

/**
 * Reject challenges too old to be fresh or too far ahead to be honest, while
 * tolerating ordinary clock skew between the dApp's server and the browser.
 */
export function isNep20ChallengeFresh(
  timestamp: number,
  nowSeconds: number,
  maxSkewSeconds = NEP20_CHALLENGE_MAX_SKEW_SECONDS,
): boolean {
  if (
    !Number.isSafeInteger(timestamp) ||
    timestamp < 0 ||
    timestamp > 0xffffffff
  ) {
    return false;
  }
  return Math.abs(nowSeconds - timestamp) <= maxSkewSeconds;
}

const MAX_UINT64 = (BigInt(1) << BigInt(64)) - BigInt(1);

/**
 * NEP-20 nonces are uint64. A JavaScript number above 2^53 has already lost
 * precision by the time it reaches the wallet, so only accept values that are
 * still exact and hand the rest of the flow a decimal string. Returns
 * `undefined` for anything that cannot be represented faithfully.
 */
export function normalizeNep20Nonce(nonce: unknown): string | undefined {
  if (typeof nonce === 'bigint') {
    return nonce >= BigInt(0) && nonce <= MAX_UINT64
      ? nonce.toString()
      : undefined;
  }
  if (typeof nonce === 'number') {
    return Number.isSafeInteger(nonce) && nonce >= 0 ? String(nonce) : undefined;
  }
  if (typeof nonce === 'string' && /^\d+$/.test(nonce.trim())) {
    const parsed = BigInt(nonce.trim());
    return parsed <= MAX_UINT64 ? parsed.toString() : undefined;
  }
  return undefined;
}

export interface Nep21MessagePayload {
  /** The exact bytes that get signed, hex encoded. */
  hex: string;
  /** The same bytes in base64, which is what NEP-21 returns as `payload`. */
  base64: string;
}

/**
 * NEP-21 signs raw bytes: the UTF-8 encoding of the message, or the decoded
 * base64 when the caller says the message is already encoded. Neon's
 * `str2hexstring` is deliberately not used, because it keeps only the low byte
 * of each character and would produce a different signature than other wallets
 * for any non-ASCII message.
 */
export function encodeNep21MessagePayload(
  message: string,
  isBase64Encoded = false,
): Nep21MessagePayload {
  const hex = isBase64Encoded ? strictBase64ToHex(message) : utf8ToHex(message);
  return { hex, base64: hex2base64(hex) };
}

function strictBase64ToHex(value: string): string {
  if (
    typeof value !== 'string' ||
    value.length === 0 ||
    value.length % 4 !== 0 ||
    !/^[A-Za-z0-9+/]*={0,2}$/.test(value)
  ) {
    throw new Error('Invalid base64 message');
  }
  const hex = base642hex(value);
  if (hex2base64(hex) !== value) {
    throw new Error('Invalid base64 message');
  }
  return hex;
}

function normalizeHostname(value: string): string {
  if (typeof value !== 'string') {
    return '';
  }
  const trimmed = value.trim().toLowerCase().replace(/\.$/, '');
  if (!trimmed) {
    return '';
  }
  // The NEP-20 challenge contains a hostname, not a URL, origin, or path.
  if (
    trimmed.includes('://') ||
    /[/%?#@]/.test(trimmed) ||
    (trimmed.includes(':') && !/^\[[0-9a-f:]+\]$/i.test(trimmed))
  ) {
    return '';
  }
  try {
    const url = new URL(`https://${trimmed}`);
    return url.hostname.replace(/\.$/, '');
  } catch {
    return '';
  }
}
