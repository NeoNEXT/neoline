import { discardPeriodicTasks, fakeAsync, tick } from '@angular/core/testing';

import { PerpsConnectionState } from '@popup/_lib/perps';
import {
  PerpsDataChannel,
  PerpsSocket,
  SOCKET_OPEN,
} from './perps-data-channel.service';

const SOCKET_CLOSED = 3;

/**
 * The exchange's end of the wire.
 *
 * Seven members is the whole contract, so the tests below drive the channel the
 * way the exchange does — open the socket, deliver a frame, drop the
 * connection — rather than calling into its internals.
 */
class FakeSocket implements PerpsSocket {
  readyState = SOCKET_OPEN;
  onopen: ((event: any) => void) | null = null;
  onmessage: ((event: MessageEvent) => void) | null = null;
  onclose: ((event: any) => void) | null = null;
  onerror: ((event: any) => void) | null = null;
  /** Everything the channel has said to the exchange, in order. */
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

  /** The connection is accepted. */
  accept() {
    if (this.onopen) {
      this.onopen(null);
    }
  }

  /** The exchange hangs up without warning. */
  drop() {
    this.readyState = SOCKET_CLOSED;
    if (this.onclose) {
      this.onclose(null);
    }
  }

  /** A frame arrives, as JSON text — the form the channel actually parses. */
  deliver(message: any) {
    if (this.onmessage) {
      this.onmessage({ data: JSON.stringify(message) } as MessageEvent);
    }
  }

  /** A frame arrives as raw text, for payloads JSON.stringify cannot express. */
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

/** What the channel has asked the exchange to do, without the payloads. */
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

    // Without the dex in the key both DEXes share one channel, and the last
    // frame overwrites every other pool.
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
    // An abandoned channel is held a moment longer, in case whoever left is
    // on their way back.
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

    // Stepping off an interval and back is one subscription to the exchange,
    // never an unsubscribe and a re-subscribe for data that never stopped.
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

    // The same observable keeps delivering: it neither errored nor completed.
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

    // A socket can stop delivering while `readyState` still reads OPEN, so an
    // unanswered ping is the only thing that reveals it.
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
