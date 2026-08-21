import { PerpsCandle } from '@popup/_lib/perps';

import { PerpsChartComponent } from './perps-chart.component';
import { ethCandle } from '../perps.test-fixture';

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

    (component as any).setAllData([ethCandle()]);

    expect(setData.calls.mostRecent().args[0][0].value).toBe(200);
  });

  it('renders live volume updates as USD notional', () => {
    const update = jasmine.createSpy('update');
    const component = new PerpsChartComponent(null);
    (component as any).candleSeries = { update: jasmine.createSpy('update') };
    (component as any).volumeSeries = { update };

    (component as any).applyBar(ethCandle({ v: '3', c: '120' }));

    expect(update.calls.mostRecent().args[0].value).toBe(360);
  });

  it('multiplies protocol decimals before projecting chart coordinates', () => {
    const setData = jasmine.createSpy('setData');
    const component = new PerpsChartComponent(null);
    (component as any).candleSeries = { setData: jasmine.createSpy('setData') };
    (component as any).volumeSeries = { setData };

    (component as any).setAllData([ethCandle({ v: '0.1', c: '0.2' })]);

    expect(setData.calls.mostRecent().args[0][0].value).toBe(0.02);
  });
});

const bar = (t: number, close = '100'): PerpsCandle =>
  ethCandle({ t, T: t + 59_999, c: close });

function chartComponent() {
  const component = new PerpsChartComponent({
    runOutsideAngular: (callback: () => void) => callback(),
    run: (callback: () => void) => callback(),
  } as any);
  const setVisibleLogicalRange = jasmine.createSpy('setVisibleLogicalRange');
  (component as any).chart = {
    timeScale: () => ({ setVisibleLogicalRange }),
  };
  (component as any).candleSeries = {
    setData: jasmine.createSpy('candleSetData'),
    update: jasmine.createSpy('candleUpdate'),
  };
  (component as any).volumeSeries = {
    setData: jasmine.createSpy('volumeSetData'),
    update: jasmine.createSpy('volumeUpdate'),
  };
  component.seriesKey = 'ETH:1m';
  const render = () => (component as any).render();
  const series = () => (component as any).candleSeries;
  return { component, render, series, setVisibleLogicalRange };
}

describe('PerpsChartComponent dataset updates', () => {
  it('refreshes the trailing bar in place and leaves the viewport alone', () => {
    const { component, render, series, setVisibleLogicalRange } =
      chartComponent();
    component.candles = [bar(1000), bar(61_000)];
    render();
    series().update.calls.reset();
    setVisibleLogicalRange.calls.reset();

    component.candles = [bar(1000), bar(61_000, '111')];
    render();

    expect(series().update).toHaveBeenCalledTimes(1);
    expect(series().update.calls.mostRecent().args[0].close).toBe(111);
    expect(setVisibleLogicalRange).not.toHaveBeenCalled();
  });

  it('replays the previous bar when a new one is appended', () => {
    const { component, render, series, setVisibleLogicalRange } =
      chartComponent();
    component.candles = [bar(1000), bar(61_000)];
    render();
    series().update.calls.reset();
    setVisibleLogicalRange.calls.reset();

    component.candles = [bar(1000), bar(61_000, '99'), bar(121_000)];
    render();

    // A bar's final OHLCV can differ from its last streamed value, so the bar
    // that just closed is sent again alongside the one that opened.
    expect(series().update).toHaveBeenCalledTimes(2);
    expect(series().update.calls.first().args[0].close).toBe(99);
    expect(setVisibleLogicalRange).not.toHaveBeenCalled();
  });

  it('appends a recovered tail of multiple bars without moving the viewport', () => {
    const { component, render, series, setVisibleLogicalRange } =
      chartComponent();
    component.candles = [bar(1000), bar(61_000)];
    render();
    series().update.calls.reset();
    series().setData.calls.reset();
    setVisibleLogicalRange.calls.reset();

    component.candles = [
      bar(1000),
      bar(61_000, '99'),
      bar(121_000),
      bar(181_000),
    ];
    render();

    expect(series().update).toHaveBeenCalledTimes(3);
    expect(series().setData).not.toHaveBeenCalled();
    expect(setVisibleLogicalRange).not.toHaveBeenCalled();
  });

  it('restores the exact viewport when a large recovered tail is set at once', () => {
    const { component, render, series, setVisibleLogicalRange } =
      chartComponent();
    component.candles = [bar(1000), bar(61_000)];
    render();
    series().setData.calls.reset();
    setVisibleLogicalRange.calls.reset();
    (component as any).chart.timeScale = () => ({
      setVisibleLogicalRange,
      getVisibleLogicalRange: () => ({ from: 0.25, to: 1.75 }),
    });

    component.candles = [
      bar(1000),
      bar(61_000),
      ...Array.from({ length: 101 }, (_, index) =>
        bar(121_000 + index * 60_000)
      ),
    ];
    render();

    expect(series().setData).toHaveBeenCalledTimes(1);
    expect(setVisibleLogicalRange).toHaveBeenCalledOnceWith({
      from: 0.25,
      to: 1.75,
    });
  });

  it('reloads once the dataset start moves, which a trimmed window does', () => {
    const { component, render, series, setVisibleLogicalRange } =
      chartComponent();
    component.candles = [bar(1000), bar(61_000)];
    render();
    series().setData.calls.reset();
    setVisibleLogicalRange.calls.reset();

    // Exactly what dropping the oldest bar to hold a fixed window produces —
    // same length, different first bar — and the cost is the user's viewport.
    component.candles = [bar(61_000), bar(121_000)];
    render();

    expect(series().setData).toHaveBeenCalledTimes(1);
    expect(setVisibleLogicalRange).toHaveBeenCalledTimes(1);
  });

  it('reloads when the series identity changes even if the bars line up', () => {
    const { component, render, series, setVisibleLogicalRange } =
      chartComponent();
    const candles = [bar(1000), bar(61_000)];
    component.candles = candles;
    render();
    series().setData.calls.reset();
    setVisibleLogicalRange.calls.reset();

    component.seriesKey = 'ETH:5m';
    component.candles = [...candles];
    render();

    expect(series().setData).toHaveBeenCalledTimes(1);
    expect(setVisibleLogicalRange).toHaveBeenCalledTimes(1);
  });

  it('keeps the viewport when older bars are prepended', () => {
    const { component, render, series, setVisibleLogicalRange } =
      chartComponent();
    component.candles = [bar(61_000), bar(121_000)];
    render();
    series().setData.calls.reset();
    setVisibleLogicalRange.calls.reset();
    (component as any).chart.timeScale = () => ({
      setVisibleLogicalRange,
      getVisibleLogicalRange: () => ({ from: 0, to: 2 }),
    });

    // Same series, earlier first bar, more rows: history, not a new market.
    // Snapping back to the latest bars is exactly how scrolling left went
    // blank — the user was looking at the left edge and the reload threw
    // them to the right.
    component.candles = [bar(1000), bar(61_000), bar(121_000)];
    render();

    expect(series().setData).toHaveBeenCalledTimes(1);
    expect(setVisibleLogicalRange).toHaveBeenCalledWith({ from: 1, to: 3 });
  });

  it('asks for earlier bars once the left edge is in view', () => {
    const { component, render } = chartComponent();
    spyOn(component.needEarlier, 'emit');
    component.candles = [bar(1000), bar(61_000)];
    render();

    (component as any).onVisibleRange({ from: 0.2, to: 30 });

    expect(component.needEarlier.emit).toHaveBeenCalledTimes(1);
  });

  it('does not keep asking for the same left edge', () => {
    const { component, render } = chartComponent();
    spyOn(component.needEarlier, 'emit');
    component.candles = [bar(1000), bar(61_000)];
    render();

    (component as any).onVisibleRange({ from: 0, to: 30 });
    (component as any).onVisibleRange({ from: 0, to: 30 });

    expect(component.needEarlier.emit).toHaveBeenCalledTimes(1);
  });

  it('clears the chart when the dataset becomes empty', () => {
    const { component, render, series } = chartComponent();
    component.candles = [bar(1000), bar(61_000)];
    render();
    series().setData.calls.reset();

    component.candles = [];
    render();

    expect(series().setData).toHaveBeenCalledWith([]);
    expect((component as any).rendered).toBeNull();
  });
});

describe('PerpsChartComponent rendering coordinates', () => {
  it("hands over the exchange's own UTC seconds, unshifted", () => {
    const { component, render, series } = chartComponent();
    component.candles = [bar(1_700_000_000_000)];

    render();

    // No local-offset nudge: shifting the axis would move every bar boundary,
    // so a daily candle would stop closing when Hyperliquid closes it.
    expect(series().setData.calls.mostRecent().args[0][0].time).toBe(
      1_700_000_000
    );
  });

  it('drops a candle it cannot render rather than drawing it at zero', () => {
    spyOn(console, 'warn');
    const { component, render, series } = chartComponent();
    component.candles = [
      bar(1000),
      { ...bar(61_000), l: '0' },
      { ...bar(121_000), c: 'not-a-number' },
      bar(181_000),
    ];

    render();

    // A candle printed at zero is a price claim the market never made.
    const drawn = series().setData.calls.mostRecent().args[0];
    expect(drawn.length).toBe(2);
    expect(drawn.map((point) => point.time)).toEqual([1, 181]);
    expect(console.warn).toHaveBeenCalledTimes(2);
  });

  it('drops only the column when the volume alone cannot be rendered', () => {
    spyOn(console, 'warn');
    const { component, render, series } = chartComponent();
    component.candles = [bar(1000), { ...bar(61_000), v: 'not-a-number' }];

    render();

    // The price converted, so it is still a fact the market printed. What must
    // not happen is a zero-height column, which would say this interval traded
    // nothing — a claim about the market rather than about our data.
    const bars = series().setData.calls.mostRecent().args[0];
    const volumes = (component as any).volumeSeries.setData.calls.mostRecent()
      .args[0];
    expect(bars.length).toBe(2);
    expect(volumes.length).toBe(1);
    expect(volumes[0].time).toBe(1);
    expect(console.warn).toHaveBeenCalledTimes(1);
  });

  it('draws an interval that genuinely traded nothing as the empty column it is', () => {
    const { component, render } = chartComponent();
    component.candles = [{ ...bar(1000), v: '0' }];

    render();

    const volumes = (component as any).volumeSeries.setData.calls.mostRecent()
      .args[0];
    expect(volumes.length).toBe(1);
    expect(volumes[0].value).toBe(0);
  });

  it('drops a value too large to survive becoming a number', () => {
    spyOn(console, 'warn');
    const { component, render, series } = chartComponent();
    // Finite as far as BigNumber is concerned, and `Infinity` the instant it
    // is IEEE-754 — so the magnitude has to be checked after the conversion.
    component.candles = [bar(1000), { ...bar(61_000), h: '1e400' }];

    render();

    expect(series().setData.calls.mostRecent().args[0].length).toBe(1);
    expect(console.warn).toHaveBeenCalledTimes(1);
  });

  it('hands the library whole seconds', () => {
    const { component, render, series } = chartComponent();
    component.candles = [bar(1_700_000_000_500)];

    render();

    // The library keys bars by this value, so a fractional one would make two
    // views of the same bar into two different bars.
    expect(series().setData.calls.mostRecent().args[0][0].time).toBe(
      1_700_000_000
    );
  });

  it('shifts the viewport by bars drawn, not by candles handed in', () => {
    spyOn(console, 'warn');
    const { component, render, series, setVisibleLogicalRange } =
      chartComponent();
    component.candles = [bar(121_000)];
    render();
    series().setData.calls.reset();
    setVisibleLogicalRange.calls.reset();
    (component as any).chart.timeScale = () => ({
      setVisibleLogicalRange,
      getVisibleLogicalRange: () => ({ from: 0, to: 1 }),
    });

    // Two older candles arrive but one cannot be drawn, so the chart grew by
    // a single bar. Shifting by two would push the bar the user is looking at
    // off to the right — the reverse of what the shift is for.
    component.candles = [bar(1000), { ...bar(61_000), o: '0' }, bar(121_000)];
    render();

    expect(setVisibleLogicalRange).toHaveBeenCalledWith({ from: 1, to: 2 });
  });
});

describe('PerpsChartComponent axis labels', () => {
  it('reserves the tick but does not pad labels out to it', () => {
    const { component } = chartComponent();
    component.priceDecimals = 4;

    // The scale has to reserve four decimals so a round price cannot collapse
    // it, but "$4.0000" on a weekly chart is four digits of nothing.
    expect((component as any).axisPrice(4)).toBe('4');
    expect((component as any).axisPrice(3.5)).toBe('3.5');
    expect((component as any).axisPrice(1.6943)).toBe('1.6943');
  });

  it('never eats zeros out of a whole number', () => {
    const { component } = chartComponent();
    component.priceDecimals = 0;

    expect((component as any).axisPrice(63000)).toBe('63000');
  });

  it('labels the axis in local time, by tick type', () => {
    const { component } = chartComponent();
    const noon = new Date(2026, 7, 19, 14, 30).getTime() / 1000;

    expect((component as any).axisLabel(noon, 3)).toBe('14:30');
    expect((component as any).axisLabel(noon, 2)).toBe('8/19');
    expect((component as any).axisLabel(noon, 0)).toBe('2026');
  });
});
