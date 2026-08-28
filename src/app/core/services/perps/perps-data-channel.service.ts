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

/** `WebSocket.OPEN`, named here so a test double need not be a real socket. */
export const SOCKET_OPEN = 1;

/**
 * The part of a websocket this module actually uses.
 *
 * A real `WebSocket` satisfies it structurally, and so does an object with
 * seven members — which is the whole point: nothing here has to reach for the
 * global to be exercised.
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

/** Production adapter. The test adapter is a fake socket in the spec. */
@Injectable({ providedIn: 'root' })
export class PerpsSocketFactory {
  open(url: string): PerpsSocket {
    return new WebSocket(url);
  }
}

/**
 * 数据通道（Data Channel）— the single live connection to the exchange.
 *
 * One socket is opened lazily and shared by every subscriber. Channels are
 * reference-counted, so N pages watching the same market cost one subscription,
 * and a channel outlives its last observer briefly so that stepping through
 * intervals or leaving a market and coming back does not redial it.
 *
 * ## What this module promises
 *
 * - **Frames are protocol-precision values.** Every frame is read through
 *   `parseProtocolJson` and, where it carries ids, `normalizeIds` — so an
 *   oid above 2^53 reaches subscribers as the decimal string the exchange sent
 *   (ADR-0001).
 * - **Subscriptions survive a reconnect; snapshots do not.** After a drop the
 *   channel redials with exponential backoff and re-sends every active
 *   subscription, and the same observable resumes delivering — it does not
 *   error or complete. What it cannot do is replay what was missed, so each
 *   dataset watches `watchConnectionState()` and re-reads its own snapshot when
 *   the state returns to `live`. That division is the contract: the channel
 *   restores the subscription, the dataset restores the truth.
 * - **Nothing is replayed on subscribe.** A new subscriber gets the next frame,
 *   not the last one. Callers provide their own baseline.
 *
 * Liveness is timed rather than assumed. A socket can stop delivering without
 * ever closing — the service worker suspends, a laptop sleeps, a NAT drops the
 * flow — and `readyState` still reads OPEN throughout. Only an unanswered
 * `ping` reveals it, which is why the answer is timed and the socket is closed
 * from this side when it does not come.
 *
 * Hyperliquid can also carry `info` reads over this same socket with
 * `method: "post"` (unique numeric `id`, replies on channel `post`), which is
 * how the official frontend makes zero REST requests. That is not implemented
 * here; REST stays in `HyperliquidService`.
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
  /** Active subscriptions keyed by channel id, so a reconnect can restore them. */
  private activeSubs = new Map<string, any>();
  private channels = new Map<string, Subject<any>>();
  private channelObservers = new Map<string, number>();
  private reconnectAttempts = 0;
  private reconnectTimer: any;
  /** Hyperliquid closes quiet sockets after 60s; ping well before that. */
  private heartbeatTimer: any;
  private readonly heartbeatMs = 30000;
  /** How long a `ping` may go unanswered before the socket is treated as dead. */
  private readonly pongTimeoutMs = 10000;
  private pongTimer: any;
  /**
   * Whether the feed is currently believed to be delivering. It is not "did a
   * message arrive recently": context frames are periodic and a quiet market
   * still produces them, but silence alone never condemns a healthy socket.
   */
  private connectionState$ = new BehaviorSubject<PerpsConnectionState>(
    'connecting'
  );
  /**
   * How long a channel outlives its last observer.
   *
   * Stepping through chart intervals, or leaving a market and coming back,
   * passes through zero observers for a few hundred milliseconds at a time.
   * Telling the exchange to stop and asking again immediately spends two
   * frames and a re-snapshot on data that never actually stopped arriving, so
   * a channel is held briefly and picked back up if someone returns.
   */
  private readonly channelTeardownMs = 500;
  private channelTeardowns = new Map<string, any>();

  constructor(private sockets: PerpsSocketFactory) {}

  watchConnectionState(): Observable<PerpsConnectionState> {
    return this.connectionState$.asObservable();
  }

  /**
   * Subscribe to a websocket channel. The returned observable replays nothing;
   * callers must provide a REST/cache baseline and preserve frames that race a
   * concurrent snapshot refresh.
   */
  subscribe(subscription: any): Observable<any> {
    return new Observable<any>((observer) => {
      const key = keyOfSubscription(subscription);
      // A teardown still pending means the exchange was never told to stop:
      // the channel is alive and is simply picked up again.
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
   * Close an abandoned channel, once it has stayed abandoned.
   *
   * The socket outlives the channel for the same reason: closing it here would
   * make a market switch redial a connection the next page needs anyway.
   */
  private scheduleChannelTeardown(key: string, subscription: any) {
    this.cancelChannelTeardown(key);
    this.channelTeardowns.set(
      key,
      setTimeout(() => {
        this.channelTeardowns.delete(key);
        // A subscriber that came and went inside the window scheduled its own
        // teardown; only an abandoned channel is closed here.
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
      // `onclose` always follows, which is where reconnection is handled.
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
    // A batched channel carries several independently-addressed frames.
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
    // Back off to at most 30s so a long outage does not hammer the endpoint.
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
      // Closing the socket ourselves is what makes the failure visible: it
      // triggers `onclose`, which marks the feed stale and schedules a
      // reconnect. Waiting for the OS to time the connection out can take
      // minutes, and the whole time the screen shows prices as if they were live.
      clearTimeout(this.pongTimer);
      this.pongTimer = setTimeout(() => {
        if (this.ws === socket) {
          this.markStale();
          try {
            socket.close();
          } catch (e) {
            // Already gone; `onclose` still runs.
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
    // Deliberate teardown, not a failure: the next subscriber starts over.
    this.connectionState$.next('connecting');
    const socket = this.ws;
    this.ws = undefined;
    if (socket) {
      try {
        socket.close();
      } catch (e) {
        // Already closing; nothing to clean up.
      }
    }
  }
}
