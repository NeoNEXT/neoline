import { PerpsFundingComponent } from './perps-funding.component';

describe('PerpsFundingComponent amount boundaries', () => {
  let component: PerpsFundingComponent;

  beforeEach(() => {
    component = new PerpsFundingComponent(
      { snapshot: { queryParams: {} } } as any,
      null,
      null,
      { depositConfig: { decimals: 6 } } as any,
      null,
      null
    );
  });

  it('uses the exact token balance for deposit MAX', () => {
    component.account = { abstractionMode: 'default' } as any;
    component.accountLoading = false;
    component.walletBalance = 1.234567;
    (component as any).walletBalanceExact = '1.234567';
    component.setMax();

    expect(component.amount).toBe('1.234567');
    expect(component.exceedsBalance).toBeFalse();
  });

  it('does not lose one USDC base unit from an exact MAX balance', () => {
    component.account = { abstractionMode: 'default' } as any;
    component.accountLoading = false;
    component.walletBalance = 2.000005;
    (component as any).walletBalanceExact = '2.000005';
    component.setMax();

    expect(component.amount).toBe('2.000005');
    expect((component as any).submissionAmount).toBe('2.000005');
    expect(component.exceedsBalance).toBeFalse();
  });

  it('blocks amounts with more decimals than the funding token supports', () => {
    component.account = { abstractionMode: 'default' } as any;
    component.accountLoading = false;
    component.walletBalance = 10;
    component.amount = '5.0000001';

    expect(component.amountExceedsPrecision).toBeTrue();
    expect(component.canSubmit).toBeFalse();
  });

  it('uses the Hyperliquid wire precision for withdrawals and transfers', () => {
    component.tab = 'withdraw';
    component.amount = '2.00000001';

    expect(component.amountDecimals).toBe(8);
    expect(component.amountExceedsPrecision).toBeFalse();

    component.amount = '2.000000001';
    expect(component.amountExceedsPrecision).toBeTrue();
  });

  it('preserves exact withdraw MAX without converting through Number', () => {
    component.tab = 'withdraw';
    component.account = {
      abstractionMode: 'default',
      availableBalance: 9007199254740994,
      availableBalanceExact: '9007199254740993.000001',
    } as any;
    component.accountLoading = false;

    component.setMax();

    expect(component.amount).toBe('9007199254740993.000001');
    expect((component as any).submissionAmount).toBe(
      '9007199254740993.000001'
    );
    expect(component.exceedsBalance).toBeFalse();
  });

  it('preserves exact spot MAX for a signed class transfer', () => {
    component.tab = 'transfer';
    component.account = {
      abstractionMode: 'default',
      spotUsdc: 9007199254740994,
      spotUsdcExact: '9007199254740993.000001',
    } as any;
    component.accountLoading = false;

    component.setMax();

    expect(component.amount).toBe('9007199254740993.000001');
    expect((component as any).submissionAmount).toBe(
      '9007199254740993.000001'
    );
    expect(component.exceedsBalance).toBeFalse();
  });

  it('blocks every funding action for portfolio-margin accounts', () => {
    component.account = { abstractionMode: 'portfolioMargin' } as any;
    component.accountLoading = false;

    expect(component.unsupportedAccountMode).toBeTrue();
    expect(component.canSubmit).toBeFalse();
  });
});
