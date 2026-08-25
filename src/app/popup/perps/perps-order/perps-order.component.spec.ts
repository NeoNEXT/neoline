import { of } from 'rxjs';

import { PerpsOrderComponent } from './perps-order.component';
import { PerpsOrderFacts } from './perps-order-composition';
import { ethMarket } from '../perps.test-fixture';

/**
 * The page over a composition it did not have to build.
 *
 * What is left here is what the page itself decides: how a reading is worded,
 * and what it does with the answer the exchange gives back. The rules the
 * readings follow are stated in perps-order-composition.spec.
 */
function component(builderAddress = ''): PerpsOrderComponent {
  return new PerpsOrderComponent(
    null,
    null,
    null,
    null,
    { builderAddress } as any,
    null,
    null,
    null,
    null,
    null
  );
}

const facts = (overrides: Partial<PerpsOrderFacts> = {}): PerpsOrderFacts => ({
  coin: 'ETH',
  market: {
    status: 'ready',
    market: ethMarket({
      szDecimals: 4,
      markPxExact: '2000',
      midPxExact: '2000',
      oraclePxExact: '2000',
      prevDayPxExact: '2000',
    }),
  },
  account: {
    availability: 'live',
    account: null,
    missingDexes: [],
    updatedAt: 1,
  },
  activeAssetData: {
    user: '0xabc',
    coin: 'ETH',
    leverage: { type: 'isolated', value: 10 },
    maxTradeSzs: ['10', '10'],
    availableToTrade: ['1000', '1000'],
    markPxExact: '2000',
    markPx: 2000,
  },
  feeRates: { takerRate: 0.00045, makerRate: 0.00015, builderRate: 0 },
  ...overrides,
});

describe('PerpsOrderComponent summary rows', () => {
  /**
   * The summary is on screen from the moment the form is, so an empty amount
   * box has to read as "no order yet" rather than as a zero-value order.
   */
  it('reads N/A on every summary row before an amount is typed', () => {
    const value = component();
    value.facts = facts();
    value.leverage = 10;

    expect(value.preview).toBeNull();
    expect(value.liquidationPriceText).toBe('N/A');
    expect(value.marginText).toBe('N/A');
    // The rate is known without an order; only its cost is not.
    expect(value.feeText).toBe('0.045%');
  });

  it('quotes the order once an amount is typed', () => {
    const value = component();
    value.facts = facts();
    value.leverage = 10;
    value.amount = '200';

    expect(value.marginText).toBe('$20');
    // The fee's cash amount, not the `--` an absent field used to render.
    expect(value.feeText).toBe('0.045% ($0.09)');
    expect(value.liquidationPriceText).toContain('$');
  });

  it('quotes the maker side too, for a limit order', () => {
    const value = component();
    value.facts = facts();
    value.leverage = 10;
    value.amount = '200';
    value.orderType = 'limit';
    value.limitPrice = '2000';

    expect(value.quotesBothFeeSides).toBeTrue();
    expect(value.makerFeeText).toBe('0.015% ($0.03)');
    expect(value.feeText).toBe('0.045% ($0.09)');
  });

  // A rebate pays the account. Showing it as "$0.00" would delete money the
  // fill actually returns, so the sign is carried all the way to the row.
  it('shows a negative maker rate as a rebate rather than zero', () => {
    const value = component();
    value.facts = facts({
      feeRates: { takerRate: 0.00045, makerRate: -0.00002, builderRate: 0 },
    });
    value.leverage = 10;
    value.amount = '200';
    value.orderType = 'limit';
    value.limitPrice = '2000';

    expect(value.makerFeeIsRebate).toBeTrue();
    expect(value.makerFeeText).toBe('-0.002% (-$<0.01)');
  });

  // Both rows quote what leaves the account, so NeoLine's cut is in each.
  it('includes the builder fee on both sides', () => {
    const value = component('0xbuilder');
    value.facts = facts({
      feeRates: { takerRate: 0.00045, makerRate: 0.00015, builderRate: 0.00045 },
    });
    value.leverage = 10;
    value.amount = '200';
    value.orderType = 'limit';
    value.limitPrice = '2000';

    expect(value.makerFeeText).toBe('0.06% ($0.12)');
    expect(value.feeText).toBe('0.09% ($0.18)');
  });

  /** The module states a condition; the page is the only thing that words it. */
  it('words the one condition blocking submission', () => {
    const value = component();
    value.facts = facts({
      account: {
        availability: 'unavailable',
        account: null,
        missingDexes: [],
        updatedAt: null,
      },
    });
    value.amount = '200';

    expect(value.orderUnavailableReason).toBe('perpsLoadFailed');

    value.facts = facts();

    expect(value.orderUnavailableReason).toBeNull();
  });
});

/**
 * The composition is read from sixteen places in one change detection pass, so
 * the page memoises it. The failure mode worth guarding is the quiet one: a
 * reading that keeps answering with what was true before the user typed.
 */
describe('PerpsOrderComponent composition memo', () => {
  it('answers the same reading while nothing has changed', () => {
    const value = component();
    value.facts = facts();
    value.amount = '200';

    expect(value.composition).toBe(value.composition);
  });

  it('re-reads when the user changes the form', () => {
    const value = component();
    value.facts = facts();
    value.amount = '200';
    const before = value.composition;

    value.amount = '400';

    expect(value.composition).not.toBe(before);
    expect(value.composition.preview.marginExact).not.toBe(
      before.preview.marginExact
    );
  });

  it('re-reads when a frame brings new facts', () => {
    const value = component();
    value.facts = facts();
    value.amount = '200';
    const before = value.composition;

    value.facts = facts({
      market: {
        status: 'ready',
        market: ethMarket({ szDecimals: 4, midPxExact: '4000' }),
      },
    });

    expect(value.composition.orderPriceExact).toBe('4000');
    expect(value.composition.preview.sizeExact).not.toBe(
      before.preview.sizeExact
    );
  });
});

describe('PerpsOrderComponent submission seam', () => {
  it('passes the composed intent to the trade-order module', async () => {
    const router = jasmine.createSpyObj('Router', ['navigateByUrl']);
    const global = jasmine.createSpyObj('GlobalService', ['snackBarTip']);
    const accountStates = jasmine.createSpyObj('PerpsAccountStateService', [
      'refreshAccount',
    ]);
    const tradeOrders = jasmine.createSpyObj('PerpsTradeOrderService', [
      'submit',
    ]);
    const chrome = jasmine.createSpyObj('ChromeService', ['getPassword']);
    const evmWallet = jasmine.createSpyObj('EvmWalletService', [
      'getPrivateKey',
    ]);
    chrome.getPassword.and.returnValue(Promise.resolve('password'));
    evmWallet.getPrivateKey.and.returnValue(Promise.resolve('private-key'));
    tradeOrders.submit.and.returnValue(
      of({
        kind: 'order-submitted',
        result: {
          status: 'filled',
          cloid: '0x00000000000000000000000000000001',
          submittedSizeExact: '1',
          filledSizeExact: '1',
          remainingSizeExact: '0',
        },
      })
    );
    const value = new PerpsOrderComponent(
      null,
      router,
      null,
      global,
      { builderAddress: '' } as any,
      accountStates,
      tradeOrders,
      chrome,
      evmWallet,
      null
    );
    value.facts = facts({
      market: {
        status: 'ready',
        market: ethMarket({
          key: 'hl:ETH',
          coin: 'ETH',
          symbol: 'ETH',
          assetId: 3,
          szDecimals: 2,
          maxLeverage: 20,
          midPxExact: '100',
        }),
      },
      activeAssetData: {
        user: '0xabc',
        coin: 'ETH',
        leverage: { type: 'isolated', value: 5 },
        maxTradeSzs: ['10', '10'],
        availableToTrade: ['100', '100'],
        markPxExact: '100',
        markPx: 100,
      },
    });
    value.leverage = 5;
    value.amount = '100';
    (value as any).wallet = { accounts: [{ extra: {} }] };

    value.review();
    await value.submit();

    const submitted = tradeOrders.submit.calls.mostRecent().args[1];
    expect(submitted).toEqual({
      market: {
        key: 'hl:ETH',
        coin: 'ETH',
        dex: '',
        assetId: 3,
        szDecimals: 2,
        maxLeverage: 20,
      },
      operation: 'open',
      side: 'long',
      referencePriceExact: '100',
      requestedSizeExact: '1',
      leverage: 5,
      orderType: 'market',
      maxSlippagePercent: value.slippagePercent,
    });
    // The page never decides these: they belong to the trade order module.
    expect((submitted as any).reduceOnly).toBeUndefined();
    expect((submitted as any).timeInForce).toBeUndefined();
    expect((submitted as any).cloid).toBeUndefined();
    expect((submitted as any).currentLeverage).toBeUndefined();
    expect(router.navigateByUrl).toHaveBeenCalled();
  });
});
