import { wallet } from '@cityofzion/neon-core-neo3/lib';
import { BRIDGE_FEE_PROBE_ADDRESS } from './bridge';

describe('BRIDGE_FEE_PROBE_ADDRESS', () => {
  it('is a burn address on both chains, not a real wallet', () => {
    // The N3 form is base58 and unreadable by eye, so pin what it decodes to.
    expect(
      `0x${wallet.getScriptHashFromAddress(BRIDGE_FEE_PROBE_ADDRESS.Neo3)}`
    ).toBe(BRIDGE_FEE_PROBE_ADDRESS.NeoX);
    expect(BRIDGE_FEE_PROBE_ADDRESS.NeoX).toBe(
      '0x0000000000000000000000000000000000000001'
    );
  });
});
