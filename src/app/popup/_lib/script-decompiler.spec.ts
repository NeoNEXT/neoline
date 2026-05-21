import { analyzeScript } from './script-decompiler';

describe('analyzeScript', () => {
  it('returns diagnostic-shaped contract calls', () => {
    const script = [
      'c2',
      '1f',
      '0c08',
      '7472616e73666572',
      '0c14',
      'cf76e28bd0062c4a478ee35561011319f3cfa4d2',
      '41',
      '627d5b52',
    ].join('');

    const result = analyzeScript(script);

    expect(result.incomplete).toBeFalse();
    expect(result.disassembly).toContain('SYSCALL      System.Contract.Call');
    expect(result.calls.length).toBe(1);
    expect(result.calls[0]).toEqual({
      hash: '0xd2a4cff31913016155e38e474a2c06d08be276cf',
      method: 'transfer',
      args: [],
      isNative: true,
      nativeName: 'GasToken',
      callFlags: 15,
      callFlagsLabel: 'All',
    });
  });

  it('parses a packed transfer call with arguments', () => {
    const script = [
      '0b',
      '02',
      '400d0300',
      '0c14',
      '0102030405060708090a0b0c0d0e0f1011121314',
      '0c14',
      '15161718191a1b1c1d1e1f202122232425262728',
      '14',
      'c0',
      '1f',
      '0c08',
      '7472616e73666572',
      '0c14',
      'cf76e28bd0062c4a478ee35561011319f3cfa4d2',
      '41',
      '627d5b52',
    ].join('');

    const result = analyzeScript(script);

    expect(result.incomplete).toBeFalse();
    expect(result.calls.length).toBe(1);
    expect(result.calls[0].hash).toBe(
      '0xd2a4cff31913016155e38e474a2c06d08be276cf',
    );
    expect(result.calls[0].method).toBe('transfer');
    expect(result.calls[0].args).toEqual([
      {
        type: 'Hash160',
        value: '2827262524232221201f1e1d1c1b1a1918171615',
      },
      {
        type: 'Hash160',
        value: '14131211100f0e0d0c0b0a090807060504030201',
      },
      {
        type: 'Integer',
        value: '200000',
      },
      {
        type: 'Any',
        value: null,
      },
    ]);
  });
});
