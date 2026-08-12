import { PerpsCandle } from '@popup/_lib/perps';

import { PerpsChartComponent } from './perps-chart.component';

const candle = (volume = '2', close = '100'): PerpsCandle => ({
  t: 1_700_000_000_000,
  T: 1_700_000_059_999,
  s: 'ETH',
  i: '1m',
  o: '90',
  c: close,
  h: '105',
  l: '85',
  v: volume,
  n: 10,
});

describe('PerpsChartComponent initial viewport', () => {
  it('shows a readable recent window instead of fitting the whole snapshot', () => {
    const setVisibleLogicalRange = jasmine.createSpy('setVisibleLogicalRange');
    const component = new PerpsChartComponent({
      runOutsideAngular: (callback: () => void) => callback(),
    } as any);
    (component as any).chart = {
      timeScale: () => ({ setVisibleLogicalRange }),
    };

    (component as any).showRecentBars(100);

    expect(setVisibleLogicalRange).toHaveBeenCalledWith({
      from: 70,
      to: 101,
    });
  });

  it('keeps the full range when fewer than 30 candles are available', () => {
    const setVisibleLogicalRange = jasmine.createSpy('setVisibleLogicalRange');
    const component = new PerpsChartComponent(null);
    (component as any).chart = {
      timeScale: () => ({ setVisibleLogicalRange }),
    };

    (component as any).showRecentBars(20);

    expect(setVisibleLogicalRange).toHaveBeenCalledWith({
      from: 0,
      to: 21,
    });
  });

  it('renders snapshot volume as USD notional', () => {
    const setData = jasmine.createSpy('setData');
    const component = new PerpsChartComponent(null);
    (component as any).candleSeries = { setData: jasmine.createSpy('setData') };
    (component as any).volumeSeries = { setData };

    (component as any).setAllData([candle()]);

    expect(setData.calls.mostRecent().args[0][0].value).toBe(200);
  });

  it('renders live volume updates as USD notional', () => {
    const update = jasmine.createSpy('update');
    const component = new PerpsChartComponent(null);
    (component as any).candleSeries = { update: jasmine.createSpy('update') };
    (component as any).volumeSeries = { update };

    (component as any).applyBar(candle('3', '120'));

    expect(update.calls.mostRecent().args[0].value).toBe(360);
  });
});
