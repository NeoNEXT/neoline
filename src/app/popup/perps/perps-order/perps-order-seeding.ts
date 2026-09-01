import BigNumber from 'bignumber.js';

import { PerpsPosition } from '@popup/_lib/perps';
import {
  normalizeLimitPrice,
  PerpsOrderFacts,
  PerpsOrderInput,
} from './perps-order-composition';

/** 美元金额按分输入、也按分提交。 */
const AMOUNT_DECIMALS = 2;

/**
 * 在交易场所的值到达之前，开仓表单先用的杠杆。
 *
 * 这是**缺省**，不是播种：缺省在「没有事实回答」时生效，播种在「事实回答了」时生效。
 * 过去它被写成一条播种规则，于是就需要「占位值可以被覆盖、用户值不能」这第二个概念，
 * 而那需要 `leverageSelected` 和 `initialLoad` 两个闩锁去表达 —— 其中 `initialLoad` 那条
 * 漏了平仓守卫，帧顺序一变就把持仓杠杆盖掉。分成缺省与播种之后，那个概念不再需要存在。
 */
const DEFAULT_LEVERAGE = 2;

/**
 * 用户亲手给过值的字段。
 *
 * 只有这四个有播种规则，所以也只有这四个需要被记住。启动参数不算 —— 路由里的 `side` 和
 * 存储里的 `slippagePercent` 只读一次、没有帧、没有顺序问题，页面在装配时直接写进输入即可
 * （`slippagePercent` 因此根本不出现在这里：它没有播种规则，标记它会留下一个没人读的位）。
 */
export type PerpsOrderUserSetField =
  | 'side'
  | 'leverage'
  | 'limitPrice'
  | 'amount';

/**
 * 表单在用户还没动手时该显示什么。
 *
 * 这是从当前事实出发的纯映射，每帧重算、幂等、**与帧到达顺序无关** —— 这正是要点。
 * 过去这些规则散在三个订阅回调里，各带各的守卫，于是「行情先到」和「账户先到」会得出
 * 不同的结果。
 *
 * 播种规则分两类，区别写在每一条自己身上，而不是靠第二套闩锁：
 *
 * - **跟随型**：只要用户没动过，就一直跟着事实走（杠杆、平仓的方向与金额）。
 * - **一次性**：只在字段还空着时给一个起始建议（限价）。它必须是一次性的 ——
 *   一个跟着中间价跳动的限价输入框，会在用户的光标底下改写他正在输入的价格。
 *
 * `frozen` 是审核态：用户批准的就是屏幕上这些值，此时任何播种都是背着他改他批准过的东西。
 */
export function seedForm(
  facts: PerpsOrderFacts,
  input: PerpsOrderInput,
  touched: ReadonlySet<PerpsOrderUserSetField>,
  frozen: boolean
): Partial<PerpsOrderInput> {
  if (frozen) {
    return {};
  }
  const market = facts.market.status === 'ready' ? facts.market.market : null;
  if (!market) {
    return {};
  }
  const seed: Partial<PerpsOrderInput> = {};
  const closeMode = input.mode === 'close';
  const position = positionFor(facts);

  // 一次性：市价单所用的同一个参考价，已按这个市场能报出的价位量化过。
  if (!touched.has('limitPrice') && !input.limitPrice) {
    seed.limitPrice = normalizeLimitPrice(market.midPxExact, market.szDecimals);
  }

  if (!touched.has('leverage')) {
    const seeded = seededLeverage(facts, closeMode, position);
    if (seeded !== null) {
      seed.leverage = seeded;
    }
  }

  if (!closeMode || !position) {
    return seed;
  }

  // 平仓意味着站到所持仓位的反方向。
  if (!touched.has('side')) {
    seed.side = position.isLong ? 'short' : 'long';
  }

  // 跟随型：仓位价值随标记价格在动，而平仓表单默认就是全平 —— 一个停在两分钟前仓位价值上
  // 的金额，是个会让用户签下部分平仓的数字。用户一动金额就接管，此后这里不再插手。
  //
  // 这里按 ROUND_HALF_UP 取分，而百分比按钮那条路（`amountForPercent`）按 ROUND_FLOOR。
  // 两个方向各有理由，不要合并：改成 floor 会让用户手输屏幕上那个金额时
  // `amountExact >= positionValue.toFixed(2)` 变成 false，于是全平掉成留一分钱零头的部分平仓。
  if (!touched.has('amount')) {
    seed.amount = new BigNumber(position.positionValueExact).toFixed(
      AMOUNT_DECIMALS
    );
    seed.activePercent = 100;
  }
  return seed;
}

/**
 * 这张表单所作用的仓位。
 *
 * 和编排模块各自推导同一个事实 —— 它是账户针对这个市场给出的答案，两边读的是同一份账户
 * 状态，所以不会分叉；把它从外面传进来只会让本模块多一个入参，却不会多一分正确性。
 */
function positionFor(facts: PerpsOrderFacts): PerpsPosition | null {
  return (
    facts.account.account?.positions.find((item) => item.coin === facts.coin) ??
    null
  );
}

/**
 * 这一单该用的杠杆。
 *
 * 平仓不提供杠杆控件，它的值恒等于持仓杠杆（见本页 CONTEXT 的「杠杆即订单参数」），所以
 * 平仓分支必须先于开仓分支 —— 过去 `loadMarket` 那条播种没有这个守卫，行情帧只要晚于账户
 * 帧到达，就会把持仓杠杆换成开仓的缺省值。
 */
function seededLeverage(
  facts: PerpsOrderFacts,
  closeMode: boolean,
  position: PerpsPosition | null
): number | null {
  const market = facts.market.status === 'ready' ? facts.market.market : null;
  if (!market) {
    return null;
  }
  if (closeMode) {
    return position ? position.leverage : null;
  }
  const exchange = facts.activeAssetData?.leverage.value;
  if (exchange && exchange >= 1 && exchange <= market.maxLeverage) {
    return exchange;
  }
  return Math.min(DEFAULT_LEVERAGE, market.maxLeverage);
}
