import { Observable, Subject } from 'rxjs';

import { PerpsConnectionState } from '@popup/_lib/perps';
import { keyOfSubscription } from './perps-channel-identity';

export interface FakePerpsDataChannel {
  subscribe(subscription: any): Observable<any>;
  watchConnectionState(): Observable<PerpsConnectionState>;
  /** 把一帧投递给订阅了该频道的人。 */
  push(subscription: any, data: any): void;
  /** 在连接中、实时、过期之间切换数据流状态。 */
  setConnectionState(state: PerpsConnectionState): void;
}

/**
 * 调用方视角下的数据通道（Data Channel）。
 *
 * 帧的投递方式与真实通道完全一致 —— 已经由 `keyOfSubscription` 寻址、已经是协议精度值
 * —— 所以测试描述的是调用方真正看到的那一帧，而不是产生它的那段 JSON 文本。
 * 其余一切保持安静：没人向某个频道推送，它就永远不出声。
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
