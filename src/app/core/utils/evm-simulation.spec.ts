import {
  buildSimulationParams,
  extractSimulationCall,
  isNativeContract,
  NATIVE_TRANSFER_LOG_ADDRESS,
  parseRevertReason,
  parseSimulatedBalanceChanges,
  SimulationLog,
} from './evm-simulation';

const USER = '0x1111111111111111111111111111111111111111';
const OTHER = '0x2222222222222222222222222222222222222222';
const TOKEN = '0x00000000000000000000000000000000000000a0';
const TRANSFER_TOPIC =
  '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';
const TRANSFER_SINGLE_TOPIC =
  '0xc3d58168c5ae7397731d063d5bbf3d657854427343f4c083240f7aacaa2d0f62';

const pad = (addr: string) =>
  '0x000000000000000000000000' + addr.slice(2).toLowerCase();
const word = (value: bigint) =>
  '0x' + value.toString(16).padStart(64, '0');

describe('EVM transaction simulation', () => {
  describe('buildSimulationParams', () => {
    it('builds an eth_simulateV1 payload with traceTransfers', () => {
      const [params, block] = buildSimulationParams({
        from: USER,
        to: TOKEN,
        value: '1000000000000000000',
        data: '0xabcdef',
      }) as [any, string];

      expect(block).toBe('latest');
      expect(params.traceTransfers).toBe(true);
      expect(params.validation).toBe(false);
      expect(params.blockStateCalls[0].calls[0]).toEqual({
        from: USER,
        to: TOKEN,
        data: '0xabcdef',
        value: '0xde0b6b3a7640000',
      });
      // The sender is funded via state override so an unfunded account can
      // still be simulated.
      expect(params.blockStateCalls[0].stateOverrides[USER].balance).toMatch(
        /^0x[0-9a-fA-F]+$/
      );
    });

    it('omits empty data and defaults value to 0x0', () => {
      const [params] = buildSimulationParams({ from: USER, to: OTHER }) as [
        any,
        string
      ];
      const call = params.blockStateCalls[0].calls[0];
      expect(call.data).toBeUndefined();
      expect(call.value).toBe('0x0');
    });
  });

  describe('parseSimulatedBalanceChanges', () => {
    it('detects an incoming native transfer', () => {
      const logs: SimulationLog[] = [
        {
          address: NATIVE_TRANSFER_LOG_ADDRESS,
          topics: [TRANSFER_TOPIC, pad(OTHER), pad(USER)],
          data: word(BigInt('1000000000000000000')),
        },
      ];
      const changes = parseSimulatedBalanceChanges(logs, USER);
      expect(changes.length).toBe(1);
      expect(changes[0].assetType).toBe('native');
      expect(changes[0].direction).toBe('in');
      expect(changes[0].rawAmount).toBe('1000000000000000000');
      expect(isNativeContract(changes[0].contractAddress)).toBe(true);
    });

    it('nets a swap into one outgoing and one incoming token', () => {
      const tokenB = '0x00000000000000000000000000000000000000b0';
      const logs: SimulationLog[] = [
        // user sends 100 of TOKEN
        {
          address: TOKEN,
          topics: [TRANSFER_TOPIC, pad(USER), pad(OTHER)],
          data: word(BigInt(100)),
        },
        // user receives 42 of tokenB
        {
          address: tokenB,
          topics: [TRANSFER_TOPIC, pad(OTHER), pad(USER)],
          data: word(BigInt(42)),
        },
      ];
      const changes = parseSimulatedBalanceChanges(logs, USER);
      expect(changes.length).toBe(2);
      const out = changes.find((c) => c.direction === 'out');
      const incoming = changes.find((c) => c.direction === 'in');
      expect(out?.contractAddress.toLowerCase()).toBe(TOKEN);
      expect(out?.rawAmount).toBe('100');
      expect(incoming?.contractAddress.toLowerCase()).toBe(tokenB);
      expect(incoming?.rawAmount).toBe('42');
    });

    it('ignores transfers that do not touch the user', () => {
      const logs: SimulationLog[] = [
        {
          address: TOKEN,
          topics: [TRANSFER_TOPIC, pad(OTHER), pad(OTHER)],
          data: word(BigInt(5)),
        },
      ];
      expect(parseSimulatedBalanceChanges(logs, USER)).toEqual([]);
    });

    it('detects ERC-721 transfers by indexed tokenId', () => {
      const logs: SimulationLog[] = [
        {
          address: TOKEN,
          topics: [TRANSFER_TOPIC, pad(OTHER), pad(USER), word(BigInt(7))],
          data: '0x',
        },
      ];
      const changes = parseSimulatedBalanceChanges(logs, USER);
      expect(changes[0].assetType).toBe('ERC-721');
      expect(changes[0].tokenId).toBe('7');
      expect(changes[0].rawAmount).toBe('1');
      expect(changes[0].direction).toBe('in');
    });

    it('decodes ERC-1155 single transfers', () => {
      const data = word(BigInt(3)) + word(BigInt(9)).slice(2);
      const logs: SimulationLog[] = [
        {
          address: TOKEN,
          topics: [
            TRANSFER_SINGLE_TOPIC,
            pad(OTHER),
            pad(USER),
            pad(OTHER),
          ],
          data,
        },
      ];
      const changes = parseSimulatedBalanceChanges(logs, USER);
      expect(changes[0].assetType).toBe('ERC-1155');
      expect(changes[0].tokenId).toBe('3');
      expect(changes[0].rawAmount).toBe('9');
      expect(changes[0].direction).toBe('out');
    });

    it('drops net-zero changes', () => {
      const logs: SimulationLog[] = [
        {
          address: TOKEN,
          topics: [TRANSFER_TOPIC, pad(USER), pad(OTHER)],
          data: word(BigInt(10)),
        },
        {
          address: TOKEN,
          topics: [TRANSFER_TOPIC, pad(OTHER), pad(USER)],
          data: word(BigInt(10)),
        },
      ];
      expect(parseSimulatedBalanceChanges(logs, USER)).toEqual([]);
    });
  });

  describe('extractSimulationCall', () => {
    it('returns null for an unusable response', () => {
      expect(extractSimulationCall(null)).toBeNull();
      expect(extractSimulationCall([])).toBeNull();
      expect(extractSimulationCall([{ calls: [] }])).toBeNull();
    });

    it('reports a successful call and gathers its logs', () => {
      const result = [
        {
          calls: [
            {
              status: '0x1',
              logs: [
                { address: TOKEN, topics: [TRANSFER_TOPIC], data: '0x' },
              ],
            },
          ],
        },
      ];
      const outcome = extractSimulationCall(result);
      expect(outcome?.reverted).toBe(false);
      expect(outcome?.logs.length).toBe(1);
      expect(outcome?.revertReason).toBeUndefined();
    });

    it('reports a reverted call with its decoded reason', () => {
      const result = [
        {
          calls: [
            {
              status: '0x0',
              logs: [],
              error: {
                message: 'execution reverted: 03Aggregator: EXPIRED',
                code: -32000,
              },
            },
          ],
        },
      ];
      const outcome = extractSimulationCall(result);
      expect(outcome?.reverted).toBe(true);
      expect(outcome?.revertReason).toBe('03Aggregator: EXPIRED');
    });
  });

  describe('parseRevertReason', () => {
    it('strips the "execution reverted" prefix', () => {
      expect(
        parseRevertReason({ message: 'execution reverted: TOO_LATE' })
      ).toBe('TOO_LATE');
    });

    it('drops raw return data appended after the reason', () => {
      expect(
        parseRevertReason({
          message:
            'execution reverted: O3Aggregator: EXPIRED: 0x08c379a0000000000000000000000000000000000000000000000000000000000020',
        })
      ).toBe('O3Aggregator: EXPIRED');
    });

    it('decodes Error(string) from error data when no message', () => {
      // abi.encodeWithSignature("Error(string)", "EXPIRED")
      const data =
        '0x08c379a0' +
        '0000000000000000000000000000000000000000000000000000000000000020' +
        '0000000000000000000000000000000000000000000000000000000000000007' +
        '4558504952454400000000000000000000000000000000000000000000000000';
      expect(parseRevertReason({ message: 'execution reverted', data })).toBe(
        'EXPIRED'
      );
    });

    it('returns undefined when there is no reason', () => {
      expect(parseRevertReason({ message: 'execution reverted' })).toBeUndefined();
      expect(parseRevertReason(undefined)).toBeUndefined();
    });
  });
});
