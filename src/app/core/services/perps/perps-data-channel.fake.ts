import { Observable, Subject } from 'rxjs';

import { PerpsConnectionState } from '@popup/_lib/perps';
import { keyOfSubscription } from './perps-channel-identity';

export interface FakePerpsDataChannel {
  subscribe(subscription: any): Observable<any>;
  watchConnectionState(): Observable<PerpsConnectionState>;
  /** Deliver one frame to whoever subscribed to that channel. */
  push(subscription: any, data: any): void;
  /** Move the feed between connecting, live and stale. */
  setConnectionState(state: PerpsConnectionState): void;
}

/**
 * The 数据通道（Data Channel） as its callers use it.
 *
 * Frames are delivered exactly as the channel would deliver them — already
 * addressed by `keyOfSubscription`, already protocol-precision — so a test
 * states the frame the caller actually sees rather than the JSON text that
 * produced it. Everything else stays quiet: a channel nobody pushes to simply
 * never speaks.
 */
export function fakePerpsDataChannel(): FakePerpsDataChannel & any {
  const channels = new Map<string, Subject<any>>();
  const connection = new Subject<PerpsConnectionState>();
  const open = (subscription: any) => {
    const key = keyOfSubscription(subscription);
    let channel = channels.get(key);
    if (!channel) {
      channel = new Subject<any>();
      channels.set(key, channel);
    }
    return channel;
  };
  return {
    subscribe: (subscription: any) => open(subscription).asObservable(),
    watchConnectionState: () => connection.asObservable(),
    push: (subscription: any, data: any) => open(subscription).next(data),
    setConnectionState: (state: PerpsConnectionState) => connection.next(state),
  } as any;
}
