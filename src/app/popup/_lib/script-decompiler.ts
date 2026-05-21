/**
 * Neo N3 invocation script analyzer.
 *
 * Single pass that produces three views of a Neo N3 VM script:
 *
 *   - `calls`        — semantic `System.Contract.Call` invocations
 *                      (cleared if the parse is not 100% standard)
 *   - `incomplete`   — true iff any opcode outside the canonical
 *                      contract-call whitelist is encountered, the
 *                      script is truncated, or an unknown opcode appears
 *   - `disassembly`  — line-by-line textual disassembly for raw review
 *
 * Consumer rule (strict-variant):
 *
 *   if (calls.length > 0)  →  render the structured calls view
 *   else                   →  render the disassembly; show a warning
 *                             banner when `incomplete` is true
 */

import {
  CallFlags,
  InteropServiceCode,
  OpCode,
} from '@cityofzion/neon-core-neo3/lib/sc';
import { NATIVE_CONTRACT_HASH } from '@cityofzion/neon-core-neo3/lib/consts';
import { OpCodeAnnotations } from '@cityofzion/neon-core-neo3/lib/sc/OpCodeAnnotations';
import { BigInteger, HexString } from '@cityofzion/neon-core-neo3/lib/u';

const SYSCALL_CONTRACT_CALL = InteropServiceCode.SYSTEM_CONTRACT_CALL;

// Map the 4-byte interop hash hex string (as it appears in the script) to the
// method name. Only includes hashes we can verify; less common syscalls fall
// back to `0x<hex>` in the disassembly view.
const SYSCALL_NAMES: Record<string, string> = {
  [InteropServiceCode.SYSTEM_CONTRACT_CALL]: 'System.Contract.Call',
  [InteropServiceCode.SYSTEM_CONTRACT_CALLNATIVE]: 'System.Contract.CallNative',
};

interface OpSpec {
  code: OpCode;
  name: string;
  operandSize: number; // -1 → variable; 0 → no operand; N → fixed N bytes
  prefix: number; //       size of the length prefix when operandSize === -1
}

function getOpSpec(opByte: number): OpSpec | undefined {
  const code = opByte as OpCode;
  const name = OpCode[code];
  if (!name) {
    return undefined;
  }
  const annotation = OpCodeAnnotations[code] || {};
  const prefix = annotation.operandSizePrefix || 0;
  return {
    code,
    name,
    operandSize: prefix ? -1 : annotation.operandSize || 0,
    prefix,
  };
}

// Opcodes that don't need stack modeling for structured-call extraction.
// Opcodes with stack effects are handled explicitly in applyStack().
// SYSCALL is conditionally accepted only when its hash is Contract.Call.
const WHITELIST = new Set<number>([
  // PUSH-family
  OpCode.PUSHINT8, OpCode.PUSHINT16, OpCode.PUSHINT32,
  OpCode.PUSHINT64, OpCode.PUSHINT128, OpCode.PUSHINT256,
  OpCode.PUSHT, OpCode.PUSHF, OpCode.PUSHNULL,
  OpCode.PUSHDATA1, OpCode.PUSHDATA2, OpCode.PUSHDATA4, OpCode.PUSHM1,
  OpCode.PUSH0, OpCode.PUSH1, OpCode.PUSH2, OpCode.PUSH3,
  OpCode.PUSH4, OpCode.PUSH5, OpCode.PUSH6, OpCode.PUSH7,
  OpCode.PUSH8, OpCode.PUSH9, OpCode.PUSH10, OpCode.PUSH11,
  OpCode.PUSH12, OpCode.PUSH13, OpCode.PUSH14, OpCode.PUSH15,
  OpCode.PUSH16,
  // PACK / PACKMAP / PACKSTRUCT and friends
  OpCode.PACKMAP, OpCode.PACKSTRUCT, OpCode.PACK,
  // empty array/struct/map (no-ops on stack we model)
  OpCode.NEWARRAY0, OpCode.NEWSTRUCT0, OpCode.NEWMAP,
  // terminators that don't affect already-extracted calls
  OpCode.NOP,
  OpCode.ABORT,
  OpCode.ASSERT,
  OpCode.THROW,
  OpCode.RET,
  OpCode.ABORTMSG,
  OpCode.ASSERTMSG,
]);

/**
 * One contract invocation extracted from the script. Field names mirror the
 * `InvocationInfo.ToJson()` shape emitted by Neo's RpcServer when
 * `useDiagnostic = true`: `{ hash, method, args, isNative, ... }`, so this
 * struct can be consumed by any code already shaped around diagnostic output.
 * Fields that require runtime VM state (`return`, nested `calls[]`) are not
 * present in the static view.
 */
export interface DecompiledCall {
  /** Contract scriptHash in big-endian, 0x-prefixed (RPC display form). */
  hash: string;
  /** Method name (UTF-8 decoded). */
  method: string;
  /** Decoded arguments, in call order (args[0] is the first parameter). */
  args: DecompiledArg[];
  /** True if `hash` matches a Neo N3 native contract. */
  isNative: boolean;
  /** Native contract name when `isNative` is true (e.g. "GasToken"). */
  nativeName?: string;
  /** Raw CallFlags integer. */
  callFlags: number;
  /** Human label: "None" / "All" / "ReadStates|WriteStates|..." / `String(n)`. */
  callFlagsLabel: string;
}

/**
 * Neo N3 native-contract hashes (stable across networks). Sourced from
 * https://github.com/neo-project/neo/blob/master/src/Neo/SmartContract/Native
 */
const NATIVE_CONTRACTS: Record<string, string> = {
  [`0x${NATIVE_CONTRACT_HASH.ManagementContract}`]: 'ContractManagement',
  [`0x${NATIVE_CONTRACT_HASH.StdLib}`]: 'StdLib',
  [`0x${NATIVE_CONTRACT_HASH.CryptoLib}`]: 'CryptoLib',
  [`0x${NATIVE_CONTRACT_HASH.LedgerContract}`]: 'LedgerContract',
  [`0x${NATIVE_CONTRACT_HASH.NeoToken}`]: 'NeoToken',
  [`0x${NATIVE_CONTRACT_HASH.GasToken}`]: 'GasToken',
  [`0x${NATIVE_CONTRACT_HASH.PolicyContract}`]: 'PolicyContract',
  [`0x${NATIVE_CONTRACT_HASH.RoleManagement}`]: 'RoleManagement',
  [`0x${NATIVE_CONTRACT_HASH.OracleContract}`]: 'OracleContract',
};

export type DecompiledArg =
  | { type: 'Integer'; value: string }
  | { type: 'Boolean'; value: boolean }
  | { type: 'Any'; value: null }
  | { type: 'Hash160'; value: string }
  | { type: 'ByteString'; hex: string }
  | { type: 'Array'; value: DecompiledArg[] }
  | { type: 'Struct'; value: DecompiledArg[] }
  | { type: 'Map'; value: { key: DecompiledArg; value: DecompiledArg }[] };

export interface ScriptAnalysis {
  calls: DecompiledCall[];
  incomplete: boolean;
  disassembly: string;
}

/**
 * Analyze a Neo N3 script.
 * @param script base64 string, hex string (with or without 0x), or raw bytes.
 */
export function analyzeScript(script: string | Uint8Array): ScriptAnalysis {
  if (!script || (typeof script === 'string' && script.length === 0)) {
    return { calls: [], incomplete: false, disassembly: '' };
  }

  let bytes: Uint8Array;
  try {
    bytes = toBytes(script);
  } catch (_) {
    return { calls: [], incomplete: true, disassembly: '' };
  }

  const state: StackState = {
    stack: [],
    staticSlots: [],
    localSlots: [],
    argSlots: [],
  };
  const calls: DecompiledCall[] = [];
  const lines: string[] = [];
  let incomplete = false;
  let ip = 0;

  while (ip < bytes.length) {
    const opByte = bytes[ip];
    const spec = getOpSpec(opByte);

    if (!spec) {
      lines.push(
        formatLine(ip, `0x${hex1(opByte)}`, '', '// unknown opcode — halting'),
      );
      incomplete = true;
      break;
    }

    const opStart = ip;
    ip++;

    let operand: Uint8Array = EMPTY;
    if (spec.operandSize === -1) {
      if (ip + spec.prefix > bytes.length) {
        lines.push(
          formatLine(opStart, spec.name, '', '// truncated length prefix'),
        );
        incomplete = true;
        break;
      }
      const len = readU(bytes, ip, spec.prefix);
      ip += spec.prefix;
      if (ip + len > bytes.length) {
        lines.push(
          formatLine(opStart, spec.name, '', '// truncated data payload'),
        );
        incomplete = true;
        break;
      }
      operand = bytes.subarray(ip, ip + len);
      ip += len;
    } else if (spec.operandSize > 0) {
      if (ip + spec.operandSize > bytes.length) {
        lines.push(formatLine(opStart, spec.name, '', '// truncated operand'));
        incomplete = true;
        break;
      }
      operand = bytes.subarray(ip, ip + spec.operandSize);
      ip += spec.operandSize;
    }

    lines.push(formatLine(opStart, spec.name, formatOperand(spec, operand)));

    // ----- structured semantic pass (only while the parser still trusts it)
    if (incomplete) continue; // disassembly only from here on
    const ok = applyStack(opByte, spec, operand, state, calls);
    if (!ok) incomplete = true;
  }

  return {
    // Strict variant: any incompleteness clears the structured view so the
    // consumer must show the raw disassembly instead.
    calls: incomplete ? [] : calls,
    incomplete,
    disassembly: lines.join('\n'),
  };
}

// =================== internals ===================

type StackItem =
  | { kind: 'int'; value: bigint }
  | { kind: 'bool'; value: boolean }
  | { kind: 'null' }
  | { kind: 'bytes'; value: Uint8Array }
  | { kind: 'array'; value: StackItem[] }
  | { kind: 'struct'; value: StackItem[] }
  | { kind: 'map'; value: { key: StackItem; value: StackItem }[] };

interface StackState {
  stack: StackItem[];
  staticSlots: StackItem[];
  localSlots: StackItem[];
  argSlots: StackItem[];
}

const EMPTY = new Uint8Array(0);

function applyStack(
  opByte: number,
  spec: OpSpec,
  operand: Uint8Array,
  state: StackState,
  calls: DecompiledCall[],
): boolean {
  const { stack } = state;
  if (spec.code >= OpCode.PUSH0 && spec.code <= OpCode.PUSH16) {
    stack.push({ kind: 'int', value: BigInt(spec.code - OpCode.PUSH0) });
    return true;
  }
  if (spec.code === OpCode.PUSHM1) {
    stack.push({ kind: 'int', value: -1n });
    return true;
  }
  if (spec.code === OpCode.PUSHT) {
    stack.push({ kind: 'bool', value: true });
    return true;
  }
  if (spec.code === OpCode.PUSHF) {
    stack.push({ kind: 'bool', value: false });
    return true;
  }
  if (spec.code === OpCode.PUSHNULL) {
    stack.push({ kind: 'null' });
    return true;
  }
  if (spec.code >= OpCode.PUSHINT8 && spec.code <= OpCode.PUSHINT256) {
    stack.push({ kind: 'int', value: readSignedLE(operand) });
    return true;
  }
  if (
    spec.code === OpCode.PUSHDATA1 ||
    spec.code === OpCode.PUSHDATA2 ||
    spec.code === OpCode.PUSHDATA4
  ) {
    stack.push({ kind: 'bytes', value: new Uint8Array(operand) });
    return true;
  }
  if (spec.code === OpCode.NEWARRAY0) {
    stack.push({ kind: 'array', value: [] });
    return true;
  }
  if (spec.code === OpCode.NEWSTRUCT0) {
    stack.push({ kind: 'struct', value: [] });
    return true;
  }
  if (spec.code === OpCode.NEWMAP) {
    stack.push({ kind: 'map', value: [] });
    return true;
  }
  if (spec.code === OpCode.NEWARRAY || spec.code === OpCode.NEWSTRUCT) {
    const n = toNumber(stack.pop());
    if (!isSafeCollectionSize(n)) return false;
    stack.push({
      kind: spec.code === OpCode.NEWARRAY ? 'array' : 'struct',
      value: buildNullArray(n),
    });
    return true;
  }
  if (spec.code === OpCode.PACK) {
    const n = toNumber(stack.pop());
    if (!isSafeCollectionSize(n)) return false;
    const arr: StackItem[] = [];
    for (let i = 0; i < n; i++) arr.push(stack.pop() ?? { kind: 'null' });
    stack.push({ kind: 'array', value: arr });
    return true;
  }
  if (spec.code === OpCode.PACKSTRUCT) {
    const n = toNumber(stack.pop());
    if (!isSafeCollectionSize(n)) return false;
    const arr: StackItem[] = [];
    for (let i = 0; i < n; i++) arr.push(stack.pop() ?? { kind: 'null' });
    stack.push({ kind: 'struct', value: arr });
    return true;
  }
  if (spec.code === OpCode.PACKMAP) {
    const n = toNumber(stack.pop());
    if (!isSafeCollectionSize(n)) return false;
    const entries: { key: StackItem; value: StackItem }[] = [];
    for (let i = 0; i < n; i++) {
      const key = stack.pop() ?? { kind: 'null' };
      const value = stack.pop() ?? { kind: 'null' };
      entries.push({ key, value });
    }
    stack.push({ kind: 'map', value: entries });
    return true;
  }
  if (spec.code === OpCode.APPEND) {
    const item = stack.pop() ?? { kind: 'null' };
    const collection = stack.pop();
    if (collection?.kind !== 'array' && collection?.kind !== 'struct') {
      return false;
    }
    collection.value.push(item);
    return true;
  }
  if (spec.code === OpCode.SETITEM) {
    const value = stack.pop() ?? { kind: 'null' };
    const key = stack.pop() ?? { kind: 'null' };
    const collection = stack.pop();
    if (collection?.kind === 'array' || collection?.kind === 'struct') {
      const idx = toNumber(key);
      if (!Number.isInteger(idx) || idx < 0) return false;
      collection.value[idx] = value;
      return true;
    }
    if (collection?.kind === 'map') {
      collection.value.push({ key, value });
      return true;
    }
    return false;
  }
  if (spec.code === OpCode.PICKITEM) {
    const key = stack.pop() ?? { kind: 'null' };
    const collection = stack.pop();
    if (collection?.kind === 'array' || collection?.kind === 'struct') {
      stack.push(collection.value[toNumber(key)] ?? { kind: 'null' });
      return true;
    }
    if (collection?.kind === 'map') {
      const found = collection.value.find((entry) =>
        stackItemsEqual(entry.key, key),
      );
      stack.push(found?.value ?? { kind: 'null' });
      return true;
    }
    return false;
  }
  if (spec.code === OpCode.SIZE) {
    const item = stack.pop();
    if (!item) return false;
    if (
      item.kind === 'bytes' ||
      item.kind === 'array' ||
      item.kind === 'struct'
    ) {
      stack.push({ kind: 'int', value: BigInt(item.value.length) });
      return true;
    }
    if (item.kind === 'map') {
      stack.push({ kind: 'int', value: BigInt(item.value.length) });
      return true;
    }
    return false;
  }
  if (spec.code === OpCode.DROP) {
    stack.pop();
    return true;
  }
  if (spec.code === OpCode.DUP) {
    const item = stack[stack.length - 1];
    if (!item) return false;
    stack.push(item);
    return true;
  }
  if (spec.code === OpCode.NIP) {
    if (stack.length < 2) return false;
    stack.splice(stack.length - 2, 1);
    return true;
  }
  if (spec.code === OpCode.CLEAR) {
    stack.length = 0;
    return true;
  }
  if (spec.code === OpCode.OVER) {
    if (stack.length < 2) return false;
    stack.push(stack[stack.length - 2]);
    return true;
  }
  if (spec.code === OpCode.PICK) {
    const n = toNumber(stack.pop());
    if (!Number.isInteger(n) || n < 0 || n >= stack.length) return false;
    stack.push(stack[stack.length - 1 - n]);
    return true;
  }
  if (spec.code === OpCode.SWAP) {
    if (stack.length < 2) return false;
    const last = stack.length - 1;
    [stack[last], stack[last - 1]] = [stack[last - 1], stack[last]];
    return true;
  }
  if (spec.code === OpCode.DEPTH) {
    stack.push({ kind: 'int', value: BigInt(stack.length) });
    return true;
  }
  if (spec.code === OpCode.INITSSLOT) {
    state.staticSlots = buildNullArray(operand[0] || 0);
    return true;
  }
  if (spec.code === OpCode.INITSLOT) {
    state.localSlots = buildNullArray(operand[0] || 0);
    state.argSlots = buildNullArray(operand[1] || 0);
    return true;
  }
  if (isSlotLoad(spec.code, OpCode.LDSFLD0, OpCode.LDSFLD6, OpCode.LDSFLD)) {
    const idx = getSlotIndex(spec.code, operand, OpCode.LDSFLD0, OpCode.LDSFLD);
    const item = readSlot(state.staticSlots, idx);
    if (!item) return false;
    stack.push(item);
    return true;
  }
  if (isSlotStore(spec.code, OpCode.STSFLD0, OpCode.STSFLD6, OpCode.STSFLD)) {
    const idx = getSlotIndex(spec.code, operand, OpCode.STSFLD0, OpCode.STSFLD);
    writeSlot(state.staticSlots, idx, stack.pop());
    return true;
  }
  if (isSlotLoad(spec.code, OpCode.LDLOC0, OpCode.LDLOC6, OpCode.LDLOC)) {
    const idx = getSlotIndex(spec.code, operand, OpCode.LDLOC0, OpCode.LDLOC);
    const item = readSlot(state.localSlots, idx);
    if (!item) return false;
    stack.push(item);
    return true;
  }
  if (isSlotStore(spec.code, OpCode.STLOC0, OpCode.STLOC6, OpCode.STLOC)) {
    const idx = getSlotIndex(spec.code, operand, OpCode.STLOC0, OpCode.STLOC);
    writeSlot(state.localSlots, idx, stack.pop());
    return true;
  }
  if (isSlotLoad(spec.code, OpCode.LDARG0, OpCode.LDARG6, OpCode.LDARG)) {
    const idx = getSlotIndex(spec.code, operand, OpCode.LDARG0, OpCode.LDARG);
    const item = readSlot(state.argSlots, idx);
    if (!item) return false;
    stack.push(item);
    return true;
  }
  if (isSlotStore(spec.code, OpCode.STARG0, OpCode.STARG6, OpCode.STARG)) {
    const idx = getSlotIndex(spec.code, operand, OpCode.STARG0, OpCode.STARG);
    writeSlot(state.argSlots, idx, stack.pop());
    return true;
  }
  if (spec.code === OpCode.SYSCALL) {
    const sysHash = bytesToHex(operand).toLowerCase();
    if (sysHash !== SYSCALL_CONTRACT_CALL) return false;
    if (stack.length < 4) return false;
    const hashItem = stack.pop()!;
    const methodItem = stack.pop()!;
    const flagsItem = stack.pop()!;
    const argsItem = stack.pop()!;
    const callFlags = toNumber(flagsItem);
    const hash = scriptHashFromItem(hashItem);
    const nativeName = NATIVE_CONTRACTS[hash.toLowerCase()];
    calls.push({
      hash,
      method: operationFromItem(methodItem),
      args: (argsItem.kind === 'array' || argsItem.kind === 'struct'
        ? argsItem.value
        : []
      ).map(toDecompiledArg),
      isNative: !!nativeName,
      nativeName,
      callFlags,
      callFlagsLabel: formatCallFlags(callFlags),
    });
    // Push a placeholder for the return value so subsequent ops don't desync
    // any whitelisted terminators that consume it (e.g. ASSERT pops a bool).
    stack.push({ kind: 'null' });
    return true;
  }
  if (spec.code === OpCode.ASSERT) {
    stack.pop();
    return true;
  }
  if (spec.code === OpCode.ABORTMSG || spec.code === OpCode.THROW) {
    stack.pop();
    return true;
  }
  if (spec.code === OpCode.ASSERTMSG) {
    stack.pop();
    stack.pop();
    return true;
  }
  // Terminator-class ops we whitelisted purely for "doesn't ruin already-
  // extracted calls" reasons: NOP / ABORT / ASSERT / THROW / RET / ABORTMSG /
  // ASSERTMSG. They MAY consume stack items but never produce new calls.
  if (WHITELIST.has(opByte)) return true;
  return false;
}

function buildNullArray(length: number): StackItem[] {
  return Array.from({ length }, () => ({ kind: 'null' }) as StackItem);
}

function readSlot(slots: StackItem[], index: number): StackItem | undefined {
  return index in slots ? slots[index] : undefined;
}

function writeSlot(slots: StackItem[], index: number, item?: StackItem) {
  slots[index] = item ?? { kind: 'null' };
}

function isSafeCollectionSize(length: number): boolean {
  return Number.isInteger(length) && length >= 0 && length <= 1024;
}

function isSlotLoad(
  code: OpCode,
  firstFixed: OpCode,
  lastFixed: OpCode,
  variable: OpCode,
): boolean {
  return (code >= firstFixed && code <= lastFixed) || code === variable;
}

function isSlotStore(
  code: OpCode,
  firstFixed: OpCode,
  lastFixed: OpCode,
  variable: OpCode,
): boolean {
  return (code >= firstFixed && code <= lastFixed) || code === variable;
}

function getSlotIndex(
  code: OpCode,
  operand: Uint8Array,
  firstFixed: OpCode,
  variable: OpCode,
): number {
  return code === variable ? operand[0] || 0 : code - firstFixed;
}

function stackItemsEqual(a: StackItem, b: StackItem): boolean {
  if (a.kind !== b.kind) return false;
  if (a.kind === 'int' && b.kind === 'int') return a.value === b.value;
  if (a.kind === 'bool' && b.kind === 'bool') return a.value === b.value;
  if (a.kind === 'null' && b.kind === 'null') return true;
  if (a.kind === 'bytes' && b.kind === 'bytes') {
    return bytesToHex(a.value) === bytesToHex(b.value);
  }
  return a === b;
}

function scriptHashFromItem(item: StackItem): string {
  if (item.kind === 'bytes' && item.value.length === 20) {
    const be = new Uint8Array(item.value).reverse();
    return '0x' + bytesToHex(be);
  }
  if (item.kind === 'int') {
    let v = item.value;
    if (v < 0n) v += 1n << 160n;
    const le = new Uint8Array(20);
    for (let i = 0; i < 20; i++) {
      le[i] = Number(v & 0xffn);
      v >>= 8n;
    }
    return '0x' + bytesToHex(le.reverse());
  }
  return '';
}

function operationFromItem(item: StackItem): string {
  if (item.kind === 'bytes') {
    try {
      return new TextDecoder('utf-8').decode(item.value);
    } catch (_) {
      return '0x' + bytesToHex(item.value);
    }
  }
  if (item.kind === 'int') return item.value.toString();
  return '';
}

function toDecompiledArg(item: StackItem): DecompiledArg {
  switch (item.kind) {
    case 'int':
      return { type: 'Integer', value: item.value.toString() };
    case 'bool':
      return { type: 'Boolean', value: item.value };
    case 'null':
      return { type: 'Any', value: null };
    case 'bytes':
      if (item.value.length === 20) {
        return { type: 'Hash160', value: hash160FromBytes(item.value) };
      }
      return { type: 'ByteString', hex: bytesToHex(item.value) };
    case 'array':
      return { type: 'Array', value: item.value.map(toDecompiledArg) };
    case 'struct':
      return { type: 'Struct', value: item.value.map(toDecompiledArg) };
    case 'map':
      return {
        type: 'Map',
        value: item.value.map(({ key, value }) => ({
          key: toDecompiledArg(key),
          value: toDecompiledArg(value),
        })),
      };
  }
}

function hash160FromBytes(value: Uint8Array): string {
  return bytesToHex(new Uint8Array(value).reverse());
}

// CallFlags decoding (per Neo.SmartContract.CallFlags)
const CALL_FLAG_BITS: [string, number][] = [
  [CallFlags[CallFlags.ReadStates], CallFlags.ReadStates],
  [CallFlags[CallFlags.WriteStates], CallFlags.WriteStates],
  [CallFlags[CallFlags.AllowCall], CallFlags.AllowCall],
  [CallFlags[CallFlags.AllowNotify], CallFlags.AllowNotify],
];

function formatCallFlags(value: number): string {
  if (!Number.isInteger(value) || value < 0) return String(value);
  if (value === CallFlags.None) return CallFlags[CallFlags.None];
  if (value === CallFlags.All) return CallFlags[CallFlags.All];
  const names = CALL_FLAG_BITS
    .filter(([, bit]) => (value & bit) === bit)
    .map(([n]) => n);
  return names.length ? names.join('|') : String(value);
}

// =================== disassembly formatting ===================

function formatLine(
  offset: number,
  opcode: string,
  operand: string,
  trailer = '',
): string {
  const base = `${offset.toString().padStart(5, ' ')}  ${opcode.padEnd(12, ' ')}${operand ? ' ' + operand : ''}`;
  return trailer ? `${base}  ${trailer}` : base;
}

function formatOperand(spec: OpSpec, operand: Uint8Array): string {
  if (operand.length === 0) return '';
  const hex = bytesToHex(operand);

  if (spec.code >= OpCode.PUSHINT8 && spec.code <= OpCode.PUSHINT256) {
    return readSignedLE(operand).toString();
  }
  if (spec.code === OpCode.SYSCALL) {
    const key = hex.toLowerCase();
    return SYSCALL_NAMES[key] || `0x${hex}`;
  }
  if (spec.code === OpCode.CALLT) {
    return `token#${readU(operand, 0, 2)}`;
  }
  if (
    (spec.code >= OpCode.JMP && spec.code <= OpCode.CALL_L) ||
    spec.code === OpCode.TRY ||
    spec.code === OpCode.TRY_L ||
    spec.code === OpCode.ENDTRY ||
    spec.code === OpCode.ENDTRY_L
  ) {
    const v = Number(readSignedLE(operand));
    return v >= 0 ? `+${v}` : String(v);
  }
  if (
    spec.code === OpCode.PUSHDATA1 ||
    spec.code === OpCode.PUSHDATA2 ||
    spec.code === OpCode.PUSHDATA4
  ) {
    if (operand.length === 20) {
      const be = new Uint8Array(operand).reverse();
      return '0x' + bytesToHex(be);
    }
    return '0x' + hex;
  }
  return '0x' + hex;
}

// =================== byte / hex helpers ===================

function toBytes(input: string | Uint8Array): Uint8Array {
  if (input instanceof Uint8Array) return input;
  const s = input.startsWith('0x') ? input.slice(2) : input;
  if (/^[0-9a-fA-F]*$/.test(s) && s.length % 2 === 0 && s.length > 0) {
    return HexString.fromHex(s).toArrayBuffer();
  }
  return HexString.fromBase64(input).toArrayBuffer();
}

function bytesToHex(b: Uint8Array): string {
  return HexString.fromArrayBuffer(b).toString();
}

function hex1(n: number): string {
  return HexString.fromNumber(n).toString().padStart(2, '0');
}

function readU(b: Uint8Array, off: number, size: number): number {
  return HexString.fromArrayBuffer(b.subarray(off, off + size), true).toNumber();
}

function readSignedLE(b: Uint8Array): bigint {
  if (b.length === 0) return 0n;
  return BigInt(BigInteger.fromTwos(bytesToHex(b), true).toString());
}

function toNumber(item: StackItem | undefined): number {
  if (!item) return 0;
  if (item.kind === 'int') return Number(item.value);
  if (item.kind === 'bool') return item.value ? 1 : 0;
  return 0;
}
