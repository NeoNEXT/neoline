/**
 * 一张表，双向读取。
 *
 * 帧不会回显是哪次订阅要的它，所以数据通道（Data Channel）必须从负载里认出一帧属于
 * 哪个频道 —— 而这个答案必须和订阅时产生的字符串完全一致，否则这一帧谁也收不到，
 * 界面就这样悄无声息地停止更新。
 *
 * 把两个方向分开写，正是这个隐患的来源：新增一个频道要在一处改键的构造、在另一处改
 * 路由分支，写错了照样能编译、能通过测试，只在运行时静默失败。现在两个方向都通过下面
 * 的 `identityKey` 构造键，因此不可能漂移，新增频道就是 `CHANNELS` 里的一行。
 */

/**
 * 区分频道所需的全部信息，按键的顺序排列。
 *
 * DEX 维度的频道即便 `dex` 取规范空值也要带上它：市场上下文、清算所状态和挂单都是
 * 按 DEX 各订阅一次的，若让多个 DEX 共用一个频道，最后到的那一帧会覆盖掉其他所有池子。
 */
interface ChannelIdentity {
  type: string;
  user?: string;
  dex?: string;
  coin?: string;
  interval?: string;
}

interface ChannelSpec {
  dexScoped?: boolean;
  /**
   * 从帧自身的负载里读出它的身份；当这一帧不足以自我标识、因而无法寻址时返回 null。
   */
  identify: (data: any) => Omit<ChannelIdentity, 'type' | 'dex'> | null;
}

const lower = (value: unknown): string | undefined =>
  typeof value === 'string' ? value.toLowerCase() : undefined;

/** 按所属用户寻址的帧。 */
const byUser = (data: any) =>
  typeof data?.user === 'string' ? { user: lower(data.user) } : null;

const CHANNELS: Record<string, ChannelSpec> = {
  candle: {
    identify: (data) =>
      typeof data?.s === 'string' && typeof data?.i === 'string'
        ? { coin: data.s, interval: data.i }
        : null,
  },
  activeAssetCtx: {
    identify: (data) =>
      typeof data?.coin === 'string' ? { coin: data.coin } : null,
  },
  // 每个 DEX 一帧，各自携带该 DEX 完整的上下文数组。
  assetCtxs: { dexScoped: true, identify: () => ({}) },
  activeAssetData: {
    identify: (data) =>
      typeof data?.user === 'string' && typeof data?.coin === 'string'
        ? { user: lower(data.user), coin: data.coin }
        : null,
  },
  spotState: { identify: byUser },
  clearinghouseState: { dexScoped: true, identify: byUser },
  openOrders: { dexScoped: true, identify: byUser },
  userFills: { identify: byUser },
  orderUpdates: { identify: byUser },
  userNonFundingLedgerUpdates: { identify: byUser },
};

/** 帧中携带的 id 必须以十进制字符串形式保全的频道。 */
export const ID_BEARING_CHANNELS = new Set([
  'openOrders',
  'userFills',
  'orderUpdates',
  'userNonFundingLedgerUpdates',
]);

/** 交易场所可能以「一组各自寻址的帧」形式下发的频道。 */
export const BATCHED_CHANNELS = new Set(['candle']);

/** 键只在这一处拼写，因此两个方向拼出来必然一致。 */
function identityKey({ type, user, dex, coin, interval }: ChannelIdentity) {
  return [type, user, dex, coin, interval].filter(Boolean).join(':');
}

const dexPart = (dex: unknown) => `dex=${dex ?? ''}`;

/** 一次订阅请求登记时所用的键。 */
export function keyOfSubscription(subscription: any): string {
  const spec = CHANNELS[subscription.type];
  return identityKey({
    type: subscription.type,
    user: lower(subscription.user),
    dex: spec?.dexScoped ? dexPart(subscription.dex) : undefined,
    coin: subscription.coin,
    interval: subscription.interval,
  });
}

/**
 * 一帧被投递到的键；当这一帧无法寻址时返回 `undefined`。
 *
 * 表里没有对应行的频道只按名字寻址 —— 本版本尚未建模的订阅，就是这样仍能送达到
 * 请求它的人手里。
 */
export function keyOfFrame(channel: string, data: any): string | undefined {
  const spec = CHANNELS[channel];
  if (!spec) {
    return channel;
  }
  const identity = spec.identify(data);
  if (!identity) {
    return undefined;
  }
  return identityKey({
    type: channel,
    ...identity,
    dex: spec.dexScoped ? dexPart(data?.dex) : undefined,
  });
}
