import { discardPeriodicTasks, fakeAsync, tick } from '@angular/core/testing';

import { PerpsConnectionState } from '@popup/_lib/perps';
import {
  PerpsDataChannel,
  PerpsSocket,
  SOCKET_OPEN,
} from './perps-data-channel.service';

const SOCKET_CLOSED = 3;

/**
 * 电线另一端的交易场所。
 *
 * 七个成员就是全部约定，所以下面的测试是按交易场所的方式来驱动通道的 —— 打开套接字、
 * 投递一帧、断开连接 —— 而不是去调它的内部实现。
 */
class FakeSocket implements PerpsSocket {
  readyState = SOCKET_OPEN;
  onopen: ((event: any) => void) | null = null;
  onmessage: ((event: MessageEvent) => void) | null = null;
  onclose: ((event: any) => void) | null = null;
  onerror: ((event: any) => void) | null = null;
  /** 通道对交易场所说过的每一句话，按顺序记录。 */
  readonly sent: any[] = [];

  send(data: string) {
    this.sent.push(JSON.parse(data));
  }

  close() {
    this.readyState = SOCKET_CLOSED;
    if (this.onclose) {
      this.onclose(null);
    }
  }

  /** 连接被接受。 */
  accept() {
    if (this.onopen) {
      this.onopen(null);
    }
  }

  /** 交易场所不打招呼就挂断。 */
  drop() {
    this.readyState = SOCKET_CLOSED;
    if (this.onclose) {
      this.onclose(null);
    }
  }

  /** 一帧以 JSON 文本的形式到达 —— 通道实际解析的就是这种形式。 */
  deliver(message: any) {
    if (this.onmessage) {
      this.onmessage({ data: JSON.stringify(message) } as MessageEvent);
    }
  }

  /** 一帧以原始文本到达，用于 JSON.stringify 表达不了的负载。 */
  deliverRaw(text: string) {
    if (this.onmessage) {
      this.onmessage({ data: text } as MessageEvent);
    }
  }
}

function build() {
  const sockets: FakeSocket[] = [];
  const channel = new PerpsDataChannel({
    open: () => {
      const socket = new FakeSocket();
      sockets.push(socket);
      return socket;
    },
  } as any);
  return { channel, sockets };
}

/** 通道请交易场所做过的事，不含负载。 */
const methods = (socket: FakeSocket) => socket.sent.map((m) => m.method);

const subscriptions = (socket: FakeSocket) =>
  socket.sent.filter((m) => m.method === 'subscribe').map((m) => m.subscription);

describe('PerpsDataChannel routing', () => {
  it('routes spotState updates to the matching user only', () => {
    const { channel, sockets } = build();
    const first = jasmine.createSpy('first');
    const second = jasmine.createSpy('second');

    channel.subscribe({ type: 'spotState', user: '0xaaa' }).subscribe(first);
    channel.subscribe({ type: 'spotState', user: '0xbbb' }).subscribe(second);
    sockets[0].accept();

    sockets[0].deliver({
      channel: 'spotState',
      data: { user: '0xaaa', spotState: { balances: [] } },
    });

    expect(first).toHaveBeenCalled();
    expect(second).not.toHaveBeenCalled();
  });

  it('routes clearinghouseState updates to the matching user only', () => {
    const { channel, sockets } = build();
    const first = jasmine.createSpy('first');
    const second = jasmine.createSpy('second');

    channel
      .subscribe({ type: 'clearinghouseState', user: '0xaaa' })
      .subscribe(first);
    channel
      .subscribe({ type: 'clearinghouseState', user: '0xbbb' })
      .subscribe(second);
    sockets[0].accept();

    sockets[0].deliver({
      channel: 'clearinghouseState',
      data: { user: '0xaaa', clearinghouseState: { marginSummary: {} } },
    });

    expect(first).toHaveBeenCalled();
    expect(second).not.toHaveBeenCalled();
  });

  it('routes activeAssetData updates by user and coin', () => {
    const { channel, sockets } = build();
    const eth = jasmine.createSpy('eth');
    const btc = jasmine.createSpy('btc');

    channel
      .subscribe({ type: 'activeAssetData', user: '0xaaa', coin: 'ETH' })
      .subscribe(eth);
    channel
      .subscribe({ type: 'activeAssetData', user: '0xaaa', coin: 'BTC' })
      .subscribe(btc);
    sockets[0].accept();

    sockets[0].deliver({
      channel: 'activeAssetData',
      data: { user: '0xAaA', coin: 'ETH', availableToTrade: ['100', '80'] },
    });

    expect(eth).toHaveBeenCalled();
    expect(btc).not.toHaveBeenCalled();
  });

  it('keeps one DEX-scoped channel per DEX', () => {
    const { channel, sockets } = build();
    const canonical = jasmine.createSpy('canonical');
    const hip3 = jasmine.createSpy('hip3');

    channel
      .subscribe({ type: 'openOrders', user: '0xaaa', dex: '' })
      .subscribe(canonical);
    channel
      .subscribe({ type: 'openOrders', user: '0xaaa', dex: 'xyz' })
      .subscribe(hip3);
    sockets[0].accept();

    sockets[0].deliver({
      channel: 'openOrders',
      data: { user: '0xaaa', dex: 'xyz', orders: [] },
    });

    // 键里没有 dex 的话，两个 DEX 会共用一个频道，最后到的那一帧会覆盖掉其他所有池子。
    expect(hip3).toHaveBeenCalled();
    expect(canonical).not.toHaveBeenCalled();
  });

  it('routes every candle when the protocol sends an array', () => {
    const { channel, sockets } = build();
    const seen: any[] = [];
    channel
      .subscribe({ type: 'candle', coin: 'ETH', interval: '1m' })
      .subscribe((candle) => seen.push(candle));
    sockets[0].accept();

    const first = { t: 1_000, s: 'ETH', i: '1m', c: '100' };
    const second = { t: 61_000, s: 'ETH', i: '1m', c: '101' };
    sockets[0].deliver({ channel: 'candle', data: [first, second] });

    expect(seen).toEqual([first, second]);
  });

  it('delivers a channel it does not model by name alone', () => {
    const { channel, sockets } = build();
    const listener = jasmine.createSpy('listener');

    channel.subscribe({ type: 'allDexsAssetCtxs' }).subscribe(listener);
    sockets[0].accept();

    sockets[0].deliver({
      channel: 'allDexsAssetCtxs',
      data: { ctxs: [['', []]] },
    });

    expect(listener).toHaveBeenCalledWith({ ctxs: [['', []]] });
  });

  it('drops a frame that cannot say which channel it belongs to', () => {
    const { channel, sockets } = build();
    const listener = jasmine.createSpy('listener');

    channel.subscribe({ type: 'spotState', user: '0xaaa' }).subscribe(listener);
    sockets[0].accept();

    sockets[0].deliver({ channel: 'spotState', data: { balances: [] } });

    expect(listener).not.toHaveBeenCalled();
  });

  it('preserves uint64 order and trade ids through websocket decoding', () => {
    const { channel, sockets } = build();
    const updates = jasmine.createSpy('updates');
    channel.subscribe({ type: 'userFills', user: '0xABC' }).subscribe(updates);
    sockets[0].accept();

    sockets[0].deliverRaw(
      '{"channel":"userFills","data":{"user":"0xabc","fills":' +
        '[{"oid":18446744073709551615,"tid":1125899906842623}]}}'
    );

    expect(updates).toHaveBeenCalledWith({
      user: '0xabc',
      fills: [{ oid: '18446744073709551615', tid: '1125899906842623' }],
    });
  });

  it('survives a frame that is not JSON', () => {
    const { channel, sockets } = build();
    const listener = jasmine.createSpy('listener');
    channel.subscribe({ type: 'spotState', user: '0xaaa' }).subscribe(listener);
    sockets[0].accept();

    expect(() => sockets[0].deliverRaw('{"channel":')).not.toThrow();
    sockets[0].deliver({
      channel: 'spotState',
      data: { user: '0xaaa', spotState: {} },
    });
    expect(listener).toHaveBeenCalled();
  });
});

describe('PerpsDataChannel connection', () => {
  it('keeps one exchange subscription while any observer remains', fakeAsync(() => {
    const { channel, sockets } = build();
    const first = channel.subscribe({ type: 'allMids' }).subscribe();
    const second = channel.subscribe({ type: 'allMids' }).subscribe();
    sockets[0].accept();

    expect(methods(sockets[0])).toEqual(['subscribe']);

    first.unsubscribe();
    tick(500);
    expect(methods(sockets[0])).toEqual(['subscribe']);

    second.unsubscribe();
    // 被弃用的频道会多留一会儿，以防离开的人马上又回来。
    expect(methods(sockets[0])).toEqual(['subscribe']);
    tick(500);
    expect(methods(sockets[0])).toEqual(['subscribe', 'unsubscribe']);

    discardPeriodicTasks();
  }));

  it('picks an abandoned channel back up instead of redialing it', fakeAsync(() => {
    const { channel, sockets } = build();
    const candles = { type: 'candle', coin: 'ETH', interval: '15m' };

    const first = channel.subscribe(candles).subscribe();
    sockets[0].accept();
    first.unsubscribe();
    tick(200);
    const second = channel.subscribe(candles).subscribe();
    tick(1000);

    // 切走一个周期再切回来，对交易场所而言只是一次订阅，
    // 绝不能对一份从未中断的数据先退订再重新订阅。
    expect(methods(sockets[0])).toEqual(['subscribe']);
    expect(sockets.length).toBe(1);

    second.unsubscribe();
    tick(500);
    discardPeriodicTasks();
  }));

  it('restores every active subscription after a reconnect', fakeAsync(() => {
    const { channel, sockets } = build();
    const candles = { type: 'candle', coin: 'ETH', interval: '1m' };
    const spot = { type: 'spotState', user: '0xaaa' };
    const seen: any[] = [];
    const a = channel.subscribe(candles).subscribe((f) => seen.push(f));
    const b = channel.subscribe(spot).subscribe();
    sockets[0].accept();

    sockets[0].drop();
    tick(1000);

    expect(sockets.length).toBe(2);
    sockets[1].accept();
    expect(subscriptions(sockets[1])).toEqual([candles, spot]);

    // 同一个 observable 继续投递：它既没有 error 也没有 complete。
    sockets[1].deliver({
      channel: 'candle',
      data: { s: 'ETH', i: '1m', c: '100' },
    });
    expect(seen.length).toBe(1);

    a.unsubscribe();
    b.unsubscribe();
    tick(500);
    discardPeriodicTasks();
  }));

  it('reports the feed stale while it is reconnecting, live once it is back', fakeAsync(() => {
    const { channel, sockets } = build();
    const states: PerpsConnectionState[] = [];
    channel.watchConnectionState().subscribe((s) => states.push(s));
    const sub = channel.subscribe({ type: 'allMids' }).subscribe();

    sockets[0].accept();
    sockets[0].drop();
    tick(1000);
    sockets[1].accept();

    expect(states).toEqual(['connecting', 'live', 'stale', 'live']);

    sub.unsubscribe();
    tick(500);
    discardPeriodicTasks();
  }));

  it('closes a socket that stops answering the heartbeat', fakeAsync(() => {
    const { channel, sockets } = build();
    const states: PerpsConnectionState[] = [];
    channel.watchConnectionState().subscribe((s) => states.push(s));
    const sub = channel.subscribe({ type: 'allMids' }).subscribe();
    sockets[0].accept();

    tick(30000);
    expect(methods(sockets[0])).toEqual(['subscribe', 'ping']);
    expect(states).toEqual(['connecting', 'live']);

    // 套接字可能在 `readyState` 仍读作 OPEN 时就已经不再投递数据，
    // 只有一次没被回应的 ping 能暴露这一点。
    tick(10000);
    expect(states).toEqual(['connecting', 'live', 'stale']);
    expect(sockets[0].readyState).toBe(SOCKET_CLOSED);

    sub.unsubscribe();
    tick(60000);
    discardPeriodicTasks();
  }));

  it('keeps the socket alive when the exchange answers the heartbeat', fakeAsync(() => {
    const { channel, sockets } = build();
    const states: PerpsConnectionState[] = [];
    channel.watchConnectionState().subscribe((s) => states.push(s));
    const sub = channel.subscribe({ type: 'allMids' }).subscribe();
    sockets[0].accept();

    tick(30000);
    sockets[0].deliver({ channel: 'pong' });
    tick(10000);

    expect(states).toEqual(['connecting', 'live']);
    expect(sockets[0].readyState).toBe(SOCKET_OPEN);

    sub.unsubscribe();
    tick(500);
    discardPeriodicTasks();
  }));
});
