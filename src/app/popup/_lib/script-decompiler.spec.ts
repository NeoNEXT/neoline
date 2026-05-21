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

  it('keeps calls when a previous contract-call return value is dropped', () => {
    const script = [
      '0240420f00',
      '0200e1f505',
      '0c146c008bd3c3f02715cc186f6a9e05e4c5043376ed',
      '0c1467769b6e47d49bcf70e5ba9a042baab5c495dd8d',
      '14',
      'c0',
      '1f',
      '0c0d6465706f7369744e6174697665',
      '0c142e42073ff4959f2a9860564a089a3cd44444a92b',
      '41627d5b52',
      '45',
      '0b',
      '02400d0300',
      '0c145d374d84ef800a615d15bd4a063a281f039477d3',
      '0c1467769b6e47d49bcf70e5ba9a042baab5c495dd8d',
      '14',
      'c0',
      '1f',
      '0c087472616e73666572',
      '0c14cf76e28bd0062c4a478ee35561011319f3cfa4d2',
      '41627d5b52',
    ].join('');

    const result = analyzeScript(script);

    expect(result.incomplete)
      .withContext(result.disassembly)
      .toBeFalse();
    expect(result.calls.map(({ hash, method }) => ({ hash, method }))).toEqual([
      {
        hash: '0x2ba94444d43c9a084a5660982a9f95f43f07422e',
        method: 'depositNative',
      },
      {
        hash: '0xd2a4cff31913016155e38e474a2c06d08be276cf',
        method: 'transfer',
      },
    ]);
    expect(result.calls[0].args).toEqual([
      {
        type: 'Hash160',
        value: '8ddd95c4b5aa2b049abae570cf9bd4476e9b7667',
      },
      {
        type: 'Hash160',
        value: 'ed763304c5e4059e6a6f18cc1527f0c3d38b006c',
      },
      {
        type: 'Integer',
        value: '100000000',
      },
      {
        type: 'Integer',
        value: '1000000',
      },
    ]);
  });

  it('parses call arguments assembled with duplicated arrays', () => {
    const script = [
      'c2',
      '4a',
      '0c1467769b6e47d49bcf70e5ba9a042baab5c495dd8d',
      'cf',
      '4a',
      '0c145d374d84ef800a615d15bd4a063a281f039477d3',
      'cf',
      '4a',
      '02400d0300',
      'cf',
      '4a',
      '0b',
      'cf',
      '1f',
      '0c087472616e73666572',
      '0c14cf76e28bd0062c4a478ee35561011319f3cfa4d2',
      '41627d5b52',
    ].join('');

    const result = analyzeScript(script);

    expect(result.incomplete)
      .withContext(result.disassembly)
      .toBeFalse();
    expect(result.calls[0].args).toEqual([
      {
        type: 'Hash160',
        value: '8ddd95c4b5aa2b049abae570cf9bd4476e9b7667',
      },
      {
        type: 'Hash160',
        value: 'd37794031f283a064abd155d610a80ef844d375d',
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

  it('parses call arguments loaded from local slots', () => {
    const script = [
      '570200',
      '0c1467769b6e47d49bcf70e5ba9a042baab5c495dd8d',
      '70',
      '0c145d374d84ef800a615d15bd4a063a281f039477d3',
      '71',
      '0b',
      '02400d0300',
      '69',
      '68',
      '14',
      'c0',
      '1f',
      '0c087472616e73666572',
      '0c14cf76e28bd0062c4a478ee35561011319f3cfa4d2',
      '41627d5b52',
    ].join('');

    const result = analyzeScript(script);

    expect(result.incomplete)
      .withContext(result.disassembly)
      .toBeFalse();
    expect(result.calls[0].args).toEqual([
      {
        type: 'Hash160',
        value: '8ddd95c4b5aa2b049abae570cf9bd4476e9b7667',
      },
      {
        type: 'Hash160',
        value: 'd37794031f283a064abd155d610a80ef844d375d',
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
