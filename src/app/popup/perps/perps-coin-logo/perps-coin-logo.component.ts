import { Component, Input, OnChanges, SimpleChanges } from '@angular/core';

import { coinColor, coinLogo } from '../perps.util';

/**
 * A market's mark, resolved in one place so every Perps surface degrades the
 * same way: bundled asset, then Hyperliquid's icon CDN, then a letter chip.
 *
 * The CDN reports a missing mark as the Hyperliquid app's HTML shell under a
 * `200`, so the fallback hangs off the image's `error` event; there is no
 * status code to branch on. HIP-3 markets and freshly listed coins land here.
 *
 * Size and letter size come from the host element, leaving each surface in
 * charge of its own layout: `perps-coin-logo { width: 36px; font-size: 15px; }`.
 */
@Component({
  selector: 'perps-coin-logo',
  templateUrl: 'perps-coin-logo.component.html',
  styleUrls: ['perps-coin-logo.component.scss'],
})
export class PerpsCoinLogoComponent implements OnChanges {
  /**
   * Display symbol. Drives the letter chip and its colour, so a HIP-3 market
   * falls back to `S` for SNDK rather than to the `x` of its `xyz:` prefix.
   */
  @Input() symbol: string;
  /**
   * Protocol coin, which is what the CDN keys marks by. Defaults to the symbol,
   * which is the same string on the canonical DEX; HIP-3 callers must pass it,
   * or their markets resolve to a bare symbol the CDN does not carry.
   */
  @Input() coin: string;

  src = '';
  color = '';
  letter = '';

  ngOnChanges(changes: SimpleChanges): void {
    if (changes.symbol || changes.coin) {
      this.src = coinLogo(this.coin || this.symbol);
      this.color = coinColor(this.symbol);
      this.letter = (this.symbol || '').charAt(0).toUpperCase();
    }
  }

  /** The CDN has no mark for this coin; show the letter chip instead. */
  onLoadError(): void {
    this.src = '';
  }
}
