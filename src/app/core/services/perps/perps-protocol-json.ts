import {
  isInteger,
  isSafeNumber,
  parse as parseLosslessJson,
} from 'lossless-json';

/**
 * Reading Hyperliquid's JSON without spending the precision it sends.
 *
 * Order and trade ids are uint64. `JSON.parse` turns them into doubles, and
 * anything above 2^53 comes back a different number than the exchange sent —
 * silently, and only for the accounts that have traded enough to reach there.
 * So the parse keeps unsafe integers as strings, and every id is normalized to
 * a decimal string before it reaches models, UI or storage.
 *
 * Both the info/exchange endpoints and the 数据通道（Data Channel） read frames
 * through here, which is the point: the invariant recorded in ADR-0001 —
 * protocol-precision values never pass through a JavaScript `number` — has one
 * implementation and two callers rather than one per transport.
 */

/** Preserve unsafe JSON integers until endpoint adapters stringify IDs. */
export function parseProtocolJson(text: unknown): any {
  if (typeof text !== 'string') {
    return text;
  }
  // HttpClient test doubles and a few browser adapters may already unwrap a
  // top-level JSON string. Nested payloads still always arrive as JSON text.
  if (!/^\s*(?:[\[{\"]|-?\d|true\b|false\b|null\b)/.test(text)) {
    return text;
  }
  return parseLosslessJson(text, null, (value) =>
    isInteger(value) && !isSafeNumber(value) ? value : Number(value)
  );
}

function normalizeProtocolId(value: unknown): string | undefined {
  if (typeof value === 'string' && /^\d+$/u.test(value)) {
    return value;
  }
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0
    ? String(value)
    : undefined;
}

/** Normalize every nested oid/tid before data reaches models, UI or storage. */
export function normalizeIds<T>(value: T): T {
  if (Array.isArray(value)) {
    value.forEach((item) => normalizeIds(item));
    return value;
  }
  if (!value || typeof value !== 'object') {
    return value;
  }
  const record = value as any;
  ['oid', 'tid'].forEach((key) => {
    if (record[key] !== undefined) {
      const id = normalizeProtocolId(record[key]);
      if (!id) {
        throw new Error(`Invalid Hyperliquid ${key}`);
      }
      record[key] = id;
    }
  });
  Object.keys(record).forEach((key) => normalizeIds(record[key]));
  return value;
}
