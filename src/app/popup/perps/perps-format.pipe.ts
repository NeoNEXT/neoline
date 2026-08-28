import { Pipe, PipeTransform } from '@angular/core';

import {
  formatCompactUsd,
  formatPrice,
  formatSignedPercent,
  isNegativeExact,
  PerpsExactValue,
} from './perps.util';

/**
 * 以纯管道形式提供的 perps 格式化函数。
 *
 * 直接在模板里调用格式化函数，会在每一轮变更检测中重新执行一遍 —— 无论变的是什么；而
 * 市场详情页光是为了资金费倒计时就每秒自检一次。纯管道按参数缓存，所以没有变动的价格只
 * 格式化一次，之后直接读回来。
 *
 * 这些管道是包裹那些函数，而不是取代它们：组件代码和测试仍然直接调用函数，每条规则只有
 * 一份实现。
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
 * 它不是格式化函数，但放在这里的理由相同：它会构造 BigNumber，而模板直接调用它，
 * 会在每一轮变更检测中重新构造一个。
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
