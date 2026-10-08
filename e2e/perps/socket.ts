import { Page } from '@playwright/test';

/** Adapted from the referenced perps-tab fake: compatible with Playwright 1.44.1. */
export async function installSocket(page: Page) {
  await page.addInitScript(() => {
    const w = window as any;
    const NativeSocket = w.WebSocket;
    const control = {
      sent: [] as any[],
      unexpected: [] as string[],
      sockets: [] as any[],
      pong: true,
      autoOpen: true,
      push(frame: unknown) {
        control.sockets.filter((socket) => socket.readyState === 1)
          .forEach((socket) => socket.deliver(frame));
      },
    };
    class VenueSocket {
      readyState = 0;
      onopen: ((event: any) => void) | null = null;
      onmessage: ((event: any) => void) | null = null;
      onclose: ((event: any) => void) | null = null;
      onerror: ((event: any) => void) | null = null;
      private zone = w.Zone?.current;
      constructor(public url: string) {
        control.sockets.push(this);
        setTimeout(() => {
          if (control.autoOpen) { this.open(); }
        });
      }
      open() {
        if (this.readyState !== 0) { return; }
        const notify = () => { this.readyState = 1; this.onopen?.({}); };
        this.zone ? this.zone.run(notify) : notify();
      }
      send(raw: string) {
        const message = JSON.parse(raw);
        control.sent.push(message);
        if (message.method === 'ping' && control.pong) {
          setTimeout(() => this.deliver({ channel: 'pong' }));
        }
      }
      close() {
        if (this.readyState === 3) { return; }
        this.readyState = 3;
        setTimeout(() => {
          const notify = () => this.onclose?.({ code: 1000 });
          this.zone ? this.zone.run(notify) : notify();
        });
      }
      deliver(frame: unknown) {
        if (this.readyState !== 1) { return; }
        const notify = () => this.onmessage?.({ data: JSON.stringify(frame) });
        this.zone ? this.zone.run(notify) : notify();
      }
    }
    function Socket(url: string, protocols?: string | string[]) {
      if (String(url) === 'wss://api.hyperliquid-testnet.xyz/ws') {
        return new VenueSocket(String(url));
      }
      // Angular's dev-server websocket stays real; other remote sockets are blocked.
      if (new URL(String(url)).host === location.host) {
        return new NativeSocket(url, protocols);
      }
      control.unexpected.push(String(url));
      throw new Error(`Unmocked WebSocket: ${url}`);
    }
    Socket.prototype = NativeSocket.prototype;
    Object.assign(Socket, { CONNECTING: 0, OPEN: 1, CLOSING: 2, CLOSED: 3 });
    w.WebSocket = Socket;
    w.__perpsSocket = control;
  });
}

export async function pushFrame(page: Page, frame: unknown) {
  await page.evaluate((value) => (window as any).__perpsSocket.push(value), frame);
}
