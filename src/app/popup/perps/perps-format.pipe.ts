import { Pipe, PipeTransform } from '@angular/core';

import {
  formatCompactUsd,
  formatPrice,
  formatSignedPercent,
  isNegativeExact,
  PerpsExactValue,
} from './perps.util';

/**
 * The perps formatters as pure pipes.
 *
 * Calling a formatter straight from a template re-runs it on every change
 * detection pass, whatever changed — and the market detail page checks itself
 * once a second for the funding countdown alone. A pure pipe caches on its
 * arguments, so a price that did not move is formatted once and then simply
 * read back.
 *
 * These wrap the functions rather than replacing them: component code and
 * tests still call the functions directly, and there is one implementation of
 * each rule.
 */

@Pipe({ name: 'perpsPrice' })
export class PerpsPricePipe implements PipeTransform {
  transform(
    value: PerpsExactValue,
    szDecimals?: number,
    isMid = false
  ): string {
    return formatPrice(value, szDecimals, isMid);
  }
}

@Pipe({ name: 'perpsSignedPercent' })
export class PerpsSignedPercentPipe implements PipeTransform {
  transform(value: PerpsExactValue, decimals = 2): string {
    return formatSignedPercent(value, decimals);
  }
}

@Pipe({ name: 'perpsCompactUsd' })
export class PerpsCompactUsdPipe implements PipeTransform {
  transform(value: PerpsExactValue): string {
    return formatCompactUsd(value);
  }
}

/**
 * Not a formatter, but here for the same reason: it builds a BigNumber, and a
 * template calling it directly rebuilds one on every change detection pass.
 */
@Pipe({ name: 'perpsNegative' })
export class PerpsNegativePipe implements PipeTransform {
  transform(value: PerpsExactValue): boolean {
    return isNegativeExact(value);
  }
}

export const PERPS_FORMAT_PIPES = [
  PerpsPricePipe,
  PerpsSignedPercentPipe,
  PerpsCompactUsdPipe,
  PerpsNegativePipe,
];
