import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable, Subject } from 'rxjs';

import {
  HYPERLIQUID_API,
  PerpsConnectionState,
  resolvePerpsTestnet,
} from '@popup/_lib/perps';
import { environment } from '@/environments/environment';
import {
  BATCHED_CHANNELS,
  ID_BEARING_CHANNELS,
  keyOfFrame,
  keyOfSubscription,
} from './perps-channel-identity';
import { normalizeIds, parseProtocolJson } from './perps-protocol-json';

/** `WebSocket.OPEN`，在这里起个名字，好让测试替身不必是真的套接字。 */
export const SOCKET_OPEN = 1;

/**
 * websocket 中本模块真正用到的那一部分。
 *
 * 真实的 `WebSocket` 在结构上满足它，一个只有七个成员的对象同样满足 —— 这正是重点：
 * 这里没有任何东西必须依赖全局对象才能被测试。
 */
export interface PerpsSocket {
  readyState: number;
  send(data: string): void;
  close(): void;
  onopen: ((event: any) => void) | null;
  onmessage: ((event: MessageEvent) => void) | null;
  onclose: ((event: any) => void) | null;
  onerror: ((event: any) => void) | null;
}

/** 生产环境适配器。测试适配器是 spec 里的一个假套接字。 */
@Injectable({ providedIn: 'root' })
export class PerpsSocketFactory {
  open(url: string): PerpsSocket {
    return new WebSocket(url);
  }
}

/**
 * 数据通道（Data Channel）—— 与交易场所之间唯一的长连接。
 *
 * 套接字按需只开一条，由所有订阅者共享。频道做引用计数，因此 N 个页面观察同一个市场只
 * 花掉一次订阅；而且频道会在最后一个观察者离开后短暂存活，这样在图表周期之间切换、或者
 * 离开一个市场再回来，都不会重新拨号。
 *
 * ## 本模块的承诺
 *
 * - **帧都是协议精度值。** 每一帧都经由 `parseProtocolJson` 读取，携带 id 的还会经过
 *   `normalizeIds` —— 所以大于 2^53 的 oid 到达订阅者手上时，仍是交易场所发来的那个
 *   十进制字符串（ADR-0001）。
 * - **订阅能挺过重连，快照不能。** 断线后通道会以指数退避重新拨号并重发所有活跃订阅，
 *   同一个 observable 会继续投递 —— 它既不 error 也不 complete。它做不到的是把错过的
 *   内容补播，所以每个数据集都要观察 `watchConnectionState()`，在状态回到 `live` 时
 *   重新读一次自己的快照。这条分工就是约定：通道负责恢复订阅，数据集负责恢复事实。
 * - **订阅时不补播任何内容。** 新订阅者拿到的是下一帧，而不是上一帧。基准值由调用方
 *   自己提供。
 *
 * 存活状态靠计时判断，而不是靠假设。套接字可能在完全没有关闭的情况下停止投递 —— service
 * worker 被挂起、笔记本睡眠、NAT 丢掉了这条流 —— 而整个过程中 `readyState` 一直读作
 * OPEN。只有一次没被回应的 `ping` 能揭穿它，所以这里给回应计时，并在它迟迟不来时从我们
 * 这一侧关闭套接字。
 *
 * Hyperliquid 其实也能用 `method: "post"` 在这同一条套接字上承载 `info` 读取（唯一的
 * 数字 `id`，回复走 `post` 频道），官方前端就是靠它做到零 REST 请求的。这里没有实现；
 * REST 仍留在 `HyperliquidService`。
 */
@Injectable({ providedIn: 'root' })
export class PerpsDataChannel {
  private readonly url = (
    resolvePerpsTestnet(environment.perpsNetwork)
      ? HYPERLIQUID_API.testnet
      : HYPERLIQUID_API.mainnet
  ).ws;

  private ws: PerpsSocket;
  private wsReady = false;
  /** 按频道 id 索引的活跃订阅，好让重连时能把它们恢复出来。 */
  private activeSubs = new Map<string, any>();
  private channels = new Map<string, Subject<any>>();
  private channelObservers = new Map<string, number>();
  private reconnectAttempts = 0;
  private reconnectTimer: any;
  /** Hyperliquid 会在 60 秒后关掉安静的套接字；要远早于此发送 ping。 */
  private heartbeatTimer: any;
  private readonly heartbeatMs = 30000;
  /** 一次 `ping` 可以多久无人应答，超过就认定套接字已死。 */
  private readonly pongTimeoutMs = 10000;
  private pongTimer: any;
  /**
   * 当前是否相信数据流还在投递。它问的不是「最近有没有消息到达」：上下文帧是周期性的，
   * 冷清的市场照样会产生它们，但仅凭沉默永远不能给一条健康的套接字定罪。
   */
  private connectionState$ = new BehaviorSubject<PerpsConnectionState>(
    'connecting'
  );
  /**
   * 一个频道在最后一个观察者离开后还能活多久。
   *
   * 在图表周期之间切换，或者离开一个市场再回来，每次都会经历几百毫秒的「零观察者」。
   * 告诉交易场所停止、紧接着又重新请求，会为一份其实从未中断的数据白白花掉两帧和一次
   * 重新取快照，所以频道会被短暂保留，有人回来时直接接着用。
   */
  private readonly channelTeardownMs = 500;
  private channelTeardowns = new Map<string, any>();

  constructor(private sockets: PerpsSocketFactory) {}

  watchConnectionState(): Observable<PerpsConnectionState> {
    return this.connectionState$.asObservable();
  }

  /**
   * 订阅一个 websocket 频道。返回的 observable 不补播任何内容；调用方必须自己提供
   * REST/缓存基准，并妥善处理与并发快照刷新赛跑的那些帧。
   */
  subscribe(subscription: any): Observable<any> {
    return new Observable<any>((observer) => {
      const key = keyOfSubscription(subscription);
      // 拆除动作还挂着，说明我们从没告诉交易场所停止：
      // 这个频道还活着，直接接着用就行。
      this.cancelChannelTeardown(key);
      let channel = this.channels.get(key);
      if (!channel) {
        channel = new Subject<any>();
        this.channels.set(key, channel);
        this.activeSubs.set(key, subscription);
        this.send({ method: 'subscribe', subscription });
      }
      this.channelObservers.set(
        key,
        (this.channelObservers.get(key) || 0) + 1
      );
      const channelSub = channel.subscribe(observer);
      return () => {
        channelSub.unsubscribe();
        const observers = (this.channelObservers.get(key) || 1) - 1;
        if (observers > 0) {
          this.channelObservers.set(key, observers);
          return;
        }
        this.channelObservers.delete(key);
        this.scheduleChannelTeardown(key, subscription);
      };
    });
  }

  /**
   * 关闭一个被弃用的频道 —— 前提是它确实一直没人要。
   *
   * 套接字活得比频道更久，理由相同：在这里把它关掉，会让一次市场切换重新拨一条下个页面
   * 反正也要用的连接。
   */
  private scheduleChannelTeardown(key: string, subscription: any) {
    this.cancelChannelTeardown(key);
    this.channelTeardowns.set(
      key,
      setTimeout(() => {
        this.channelTeardowns.delete(key);
        // 在这个窗口内来了又走的订阅者会安排它自己的拆除；
        // 这里只关闭真正被弃用的频道。
        if (this.channelObservers.get(key)) {
          return;
        }
        this.channels.delete(key);
        this.activeSubs.delete(key);
        if (this.wsReady) {
          this.send({ method: 'unsubscribe', subscription });
        }
        if (this.channels.size === 0) {
          this.closeSocket();
        }
      }, this.channelTeardownMs)
    );
  }

  private cancelChannelTeardown(key: string) {
    const timer = this.channelTeardowns.get(key);
    if (timer !== undefined) {
      clearTimeout(timer);
      this.channelTeardowns.delete(key);
    }
  }

  private send(payload: any) {
    if (this.wsReady && this.ws?.readyState === SOCKET_OPEN) {
      this.ws.send(JSON.stringify(payload));
    } else {
      this.openSocket();
    }
  }

  private openSocket() {
    if (this.ws && this.ws.readyState <= SOCKET_OPEN) {
      return;
    }
    let socket: PerpsSocket;
    try {
      socket = this.sockets.open(this.url);
    } catch (e) {
      return;
    }
    this.ws = socket;
    socket.onopen = () => {
      if (this.ws !== socket) {
        socket.close();
        return;
      }
      this.wsReady = true;
      this.reconnectAttempts = 0;
      this.connectionState$.next('live');
      this.startHeartbeat(socket);
      this.activeSubs.forEach((subscription) =>
        socket.send(JSON.stringify({ method: 'subscribe', subscription }))
      );
    };
    socket.onmessage = (event) => {
      if (this.ws === socket) {
        this.handleMessage(event);
      }
    };
    socket.onclose = () => {
      if (this.ws !== socket) {
        return;
      }
      this.wsReady = false;
      this.stopHeartbeat();
      this.ws = undefined;
      if (this.channels.size > 0) {
        this.markStale();
        this.scheduleReconnect();
      }
    };
    socket.onerror = () => {
      // `onclose` 总会随后触发，重连逻辑在那里处理。
    };
  }

  private handleMessage(event: MessageEvent) {
    let msg: any;
    try {
      msg = parseProtocolJson(event.data);
    } catch (e) {
      return;
    }
    if (!msg || !msg.channel) {
      return;
    }
    if (msg.channel === 'pong') {
      clearTimeout(this.pongTimer);
      this.pongTimer = undefined;
      return;
    }
    if (ID_BEARING_CHANNELS.has(msg.channel)) {
      normalizeIds(msg.data);
    }
    // 批量频道一次携带多帧，每帧各自寻址。
    const frames =
      BATCHED_CHANNELS.has(msg.channel) && Array.isArray(msg.data)
        ? msg.data
        : [msg.data];
    frames.forEach((data) => {
      const key = keyOfFrame(msg.channel, data);
      if (key) {
        this.emit(key, data);
      }
    });
  }

  private emit(key: string, data: any) {
    const channel = this.channels.get(key);
    if (channel) {
      channel.next(data);
    }
  }

  private scheduleReconnect() {
    clearTimeout(this.reconnectTimer);
    // 退避上限 30 秒，免得长时间故障时反复捶打端点。
    const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts), 30000);
    this.reconnectAttempts += 1;
    this.reconnectTimer = setTimeout(() => {
      this.openSocket();
    }, delay);
  }

  private startHeartbeat(socket: PerpsSocket) {
    this.stopHeartbeat();
    this.heartbeatTimer = setInterval(() => {
      if (this.ws !== socket || socket.readyState !== SOCKET_OPEN) {
        return;
      }
      socket.send(JSON.stringify({ method: 'ping' }));
      // 由我们自己关闭套接字，才能让这次故障显形：它会触发 `onclose`，从而把数据流标记
      // 为过期并安排重连。等操作系统把连接超时掉可能要好几分钟，而这段时间里界面一直
      // 在把价格显示得像是实时的一样。
      clearTimeout(this.pongTimer);
      this.pongTimer = setTimeout(() => {
        if (this.ws === socket) {
          this.markStale();
          try {
            socket.close();
          } catch (e) {
            // 已经没了；`onclose` 照样会跑。
          }
        }
      }, this.pongTimeoutMs);
    }, this.heartbeatMs);
  }

  private stopHeartbeat() {
    clearInterval(this.heartbeatTimer);
    this.heartbeatTimer = undefined;
    clearTimeout(this.pongTimer);
    this.pongTimer = undefined;
  }

  private markStale() {
    if (this.connectionState$.value !== 'stale') {
      this.connectionState$.next('stale');
    }
  }

  private closeSocket() {
    clearTimeout(this.reconnectTimer);
    this.stopHeartbeat();
    this.wsReady = false;
    // 这是刻意的拆除，不是故障：下一个订阅者会从头开始。
    this.connectionState$.next('connecting');
    const socket = this.ws;
    this.ws = undefined;
    if (socket) {
      try {
        socket.close();
      } catch (e) {
        // 已经在关闭了；没什么要清理的。
      }
    }
  }
}
