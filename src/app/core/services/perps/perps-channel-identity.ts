/**
 * One table, read in both directions.
 *
 * A frame does not echo the subscription that asked for it, so the 数据通道
 * (Data Channel) has to recognise which channel a frame belongs to from its
 * payload — and that answer must be the same string the subscription produced,
 * or the frame is delivered to nobody and the screen simply stops updating.
 *
 * Keeping the two directions apart is what made that a live hazard: adding a
 * channel meant editing a key-builder in one place and a routing branch in
 * another, and getting it wrong compiles, passes, and fails silently at
 * runtime. Both directions build the key through `identityKey` below, so they
 * cannot drift, and a new channel is one row in `CHANNELS`.
 */

/**
 * Everything that distinguishes one channel from another, in key order.
 *
 * `dex` is present for DEX-scoped channels even when it is the canonical empty
 * value: market contexts, clearinghouse state and open orders are subscribed
 * once per DEX, and sharing one channel across DEXes lets the last frame
 * overwrite every other pool.
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
   * Reads a frame's own identity out of its payload, or returns null when the
   * frame does not identify itself well enough to be addressed.
   */
  identify: (data: any) => Omit<ChannelIdentity, 'type' | 'dex'> | null;
}

const lower = (value: unknown): string | undefined =>
  typeof value === 'string' ? value.toLowerCase() : undefined;

/** Frames addressed by the user they belong to. */
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
  // One frame per DEX, each carrying that DEX's whole context array.
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

/** Channels whose frames carry ids that must survive as decimal strings. */
export const ID_BEARING_CHANNELS = new Set([
  'openOrders',
  'userFills',
  'orderUpdates',
  'userNonFundingLedgerUpdates',
]);

/** Channels the exchange may send as an array of independently-addressed frames. */
export const BATCHED_CHANNELS = new Set(['candle']);

/** The one place a key is spelled, so both directions spell it the same way. */
function identityKey({ type, user, dex, coin, interval }: ChannelIdentity) {
  return [type, user, dex, coin, interval].filter(Boolean).join(':');
}

const dexPart = (dex: unknown) => `dex=${dex ?? ''}`;

/** The key a subscription request registers under. */
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
 * The key a frame is delivered to, or `undefined` when the frame cannot be
 * addressed.
 *
 * A channel with no row is addressed by name alone, which is how a subscription
 * this build does not model still reaches whoever asked for it.
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
