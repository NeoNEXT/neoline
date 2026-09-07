import { Pipe, PipeTransform } from '@angular/core';

import { PerpsMarket } from '@popup/_lib/perps';
import {
  findMarketByCoin,
  findMarketByKey,
  formatCompactUsd,
  formatFillTime,
  formatFundingPercent,
  formatPositionSize,
  formatPrice,
  formatReturnOnEquity,
  formatSignedPercent,
  formatSignedUsd,
  formatSize,
  formatUsd,
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

/**
 * 资金费率。
 *
 * 这一页每秒都会被检查一遍（倒计时就住在它旁边），而这条规则要构造 BigNumber ——
 * 模板直接调用它，等于每秒重算一次一个每几小时才变一次的数字。
 */
@Pipe({ name: 'perpsFundingPercent' })
export class PerpsFundingPercentPipe implements PipeTransform {
  transform(value: PerpsExactValue): string {
    return formatFundingPercent(value);
  }
}

@Pipe({ name: 'perpsCompactUsd' })
export class PerpsCompactUsdPipe implements PipeTransform {
  transform(value: PerpsExactValue): string {
    return formatCompactUsd(value);
  }
}

@Pipe({ name: 'perpsUsd' })
export class PerpsUsdPipe implements PipeTransform {
  transform(value: PerpsExactValue, decimals = 2): string {
    return formatUsd(value, decimals);
  }
}

@Pipe({ name: 'perpsSignedUsd' })
export class PerpsSignedUsdPipe implements PipeTransform {
  transform(value: PerpsExactValue, decimals = 2): string {
    return formatSignedUsd(value, decimals);
  }
}

@Pipe({ name: 'perpsPositionSize' })
export class PerpsPositionSizePipe implements PipeTransform {
  transform(value: PerpsExactValue, szDecimals?: number): string {
    return formatPositionSize(value, szDecimals);
  }
}

@Pipe({ name: 'perpsReturnOnEquity' })
export class PerpsReturnOnEquityPipe implements PipeTransform {
  transform(value: PerpsExactValue, decimals = 2): string {
    return formatReturnOnEquity(value, decimals);
  }
}

/**
 * 订单或成交的数量。与 `perpsPositionSize` 的区别只有一处：这里不取绝对值 ——
 * 订单和成交的数量本来就不带方向，方向由它旁边的标签表达。
 */
@Pipe({ name: 'perpsSize' })
export class PerpsSizePipe implements PipeTransform {
  transform(value: PerpsExactValue, szDecimals?: number): string {
    return formatSize(value, szDecimals);
  }
}

/** 活动流里的时间戳。 */
@Pipe({ name: 'perpsFillTime' })
export class PerpsFillTimePipe implements PipeTransform {
  transform(time: number): string {
    return formatFillTime(time);
  }
}

/**
 * 一个仓位所属市场的精度，供它旁边的价格和数量管道当参数用。
 *
 * 它同样不是格式化函数，但放在这里的理由相同：模板直接调用它，会在每一轮变更检测中把
 * 市场数组重新扫一遍 —— 而市场数组只在快照到达时才换。
 */
@Pipe({ name: 'perpsSzDecimals' })
export class PerpsSzDecimalsPipe implements PipeTransform {
  transform(markets: PerpsMarket[], key: string): number {
    return findMarketByKey(markets, key)?.szDecimals;
  }
}

/**
 * 同一件事，但按协议币种查 —— 订单和成交带回来的是币种，不是主键。
 *
 * 活动页最多能列 200 行，每行都要问一次精度；直接在模板里查，等于每一轮变更检测把整个
 * 市场数组扫两百遍，而市场数组只在快照到达时才换。
 */
@Pipe({ name: 'perpsCoinSzDecimals' })
export class PerpsCoinSzDecimalsPipe implements PipeTransform {
  transform(markets: PerpsMarket[], coin: string): number {
    return findMarketByCoin(markets, coin)?.szDecimals;
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
  PerpsFundingPercentPipe,
  PerpsCompactUsdPipe,
  PerpsUsdPipe,
  PerpsSignedUsdPipe,
  PerpsPositionSizePipe,
  PerpsSizePipe,
  PerpsFillTimePipe,
  PerpsReturnOnEquityPipe,
  PerpsSzDecimalsPipe,
  PerpsCoinSzDecimalsPipe,
  PerpsNegativePipe,
];
