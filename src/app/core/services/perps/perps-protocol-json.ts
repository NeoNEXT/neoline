import {
  isInteger,
  isSafeNumber,
  parse as parseLosslessJson,
} from 'lossless-json';

/**
 * 读取 Hyperliquid 的 JSON，同时不浪费它发来的精度。
 *
 * 订单和成交 id 是 uint64。`JSON.parse` 会把它们变成双精度浮点数，超过 2^53 的值
 * 取回来就和交易场所发出的不是同一个数 —— 而且是静默发生的，只有交易次数多到那个
 * 量级的账户才会遇到。所以解析时把不安全整数保留为字符串，并在数据到达模型、界面
 * 或存储之前，把每个 id 归一化成十进制字符串。
 *
 * info/exchange 端点和数据通道（Data Channel）都经由这里读取帧，这正是重点：
 * ADR-0001 记录的不变式 —— 协议精度值绝不经过 JavaScript 的 `number` —— 只有一份
 * 实现和两个调用方，而不是每种传输各写一份。
 */

/** 在端点适配器把 ID 字符串化之前，先保住 JSON 里的不安全整数。 */
export function parseProtocolJson(text: unknown): any {
  if (typeof text !== 'string') {
    return text;
  }
  // HttpClient 的测试替身和少数浏览器适配器可能已经把顶层 JSON 字符串解开了。
  // 嵌套负载则始终以 JSON 文本的形式到达。
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

/** 在数据到达模型、界面或存储之前，归一化所有嵌套的 oid/tid。 */
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
