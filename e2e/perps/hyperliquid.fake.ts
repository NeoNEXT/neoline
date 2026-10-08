import { encode } from '@msgpack/msgpack';
import { concat, keccak256, verifyTypedData, ZeroAddress } from 'ethers';
import { Page, Route } from '@playwright/test';
import BigNumber from 'bignumber.js';
import { FakeFunding } from './funding.fake';
import { installSocket, pushFrame } from './socket';

type Payload = Record<string, any>;
const api = 'https://api.hyperliquid-testnet.xyz';
const cors = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': 'POST, OPTIONS' };
const assetCtx = (price = '100') => ({
  markPx: price, midPx: price, oraclePx: price, prevDayPx: '95',
  dayNtlVlm: '1000000', openInterest: '1000', funding: '0.0001',
});

/** Raw protocol fixtures: the application still parses, composes and signs. */
export class FakeHyperliquid {
  readonly infoRequests: Payload[] = [];
  readonly writes: Payload[] = [];
  readonly unexpected: string[] = [];
  readonly funding: FakeFunding;
  readonly events: Array<{
    at: string; endpoint: string; request: Payload; response?: unknown; clientFailure?: string;
  }> = [];
  coin = 'ETH';
  price = '100';
  mark = '100';
  szDecimals = 4;
  marketMetadata: Payload = {};
  marketSnapshots: Record<string, { universe: Payload[]; ctxs: Payload[] }> | null = null;
  marketSnapshotFailureDex: string | null = null;
  fees = { userCrossRate: '0.00045', userAddRate: '0.00015', activeReferralDiscount: '0' };
  availableToTrade = ['1000', '1000'];
  maxTradeSzs = ['20', '20'];
  capacityOverride: Payload | null | undefined;
  capacityOverrideAfterLeverage: Payload | null | undefined;
  orderFailure: 'disconnect' | '503' | 'malformed' | null = null;
  orderFoundAfterQueries = Infinity;
  orderResponseGate: Promise<void> = Promise.resolve();
  capacityAfterLeverageGate: Promise<void> = Promise.resolve();
  leverageResponseLost = false;
  protectionWaitingForFill = false;
  lostResponse = false;
  withdrawLostResponse = false;
  withdrawFailures: Array<'nonce' | 'balance' | '503' | 'malformed'> = [];
  withdrawResponseGate: Promise<void> = Promise.resolve();
  protectionRejected = false;
  partialFillSize: string | null = null;
  rejectLeverage = false;
  capacityAfterLeverage: string | null = null;
  accountValue = '1000';
  accountMode = 'default';
  accountReadFailureStatus: number | null = null;
  accountReadFailureDex: string | null = null;
  spotTotal = '300';
  spotHold = '50';
  spotBalances: Payload[] | null = null;
  historyFills: Payload[] = [];
  historicalOrders: Payload[] = [];
  fundingHistory: Payload[] = [];
  ledgerHistory: Payload[] = [];
  positionSize = '0';
  leverage = { type: 'cross', value: 2 };

  constructor(private page: Page, readonly user: string) {
    this.funding = new FakeFunding(user);
  }

  get orders() { return this.writes.filter((request) => request.action.type === 'order'); }
  get statusQueries() { return this.infoRequests.filter((request) => request.type === 'orderStatus'); }
  get withdrawals() { return this.writes.filter((request) => request.action.type === 'sendToEvmWithData'); }
  get dex() { return this.coin.includes(':') ? this.coin.split(':')[0] : ''; }

  seedPosition(size: string) {
    this.positionSize = size;
    this.leverage = { type: 'isolated', value: 2 };
  }

  async install() {
    await installSocket(this.page);
    await this.page.route(/^https?:\/\//, (route) => this.serve(route));
  }

  async pushPrice(price: string) {
    await this.page.waitForFunction(() => (window as any).__perpsSocket.sent.some(
      (message: any) => message.subscription?.type === 'activeAssetCtx'
    ));
    this.price = price;
    await pushFrame(this.page, { channel: 'activeAssetCtx', data: { coin: this.coin, ctx: this.context() } });
  }

  async pushCapacity() {
    await pushFrame(this.page, { channel: 'activeAssetData', data: this.activeAssetData() });
  }

  private context() { return { ...assetCtx(this.price), markPx: this.mark }; }

  private account(dex = '') {
    const positioned = dex === this.dex && !new BigNumber(this.positionSize).isZero();
    const notional = new BigNumber(this.positionSize).abs().times(this.mark);
    const margin = positioned ? notional.div(this.leverage.value).toFixed() : '0';
    const free = new BigNumber(this.accountValue).minus(margin).toFixed();
    const summary = {
      accountValue: dex !== this.dex ? '0' : this.accountValue, totalRawUsd: dex !== this.dex ? '0' : this.accountValue,
      totalNtlPos: positioned ? notional.toFixed() : '0', totalMarginUsed: margin,
    };
    return {
      marginSummary: summary,
      crossMarginSummary: positioned && this.leverage.type === 'isolated'
        ? { accountValue: free, totalRawUsd: free, totalNtlPos: '0', totalMarginUsed: '0' }
        : summary,
      crossMaintenanceMarginUsed: positioned && this.leverage.type === 'cross' ? '2' : '0',
      withdrawable: dex !== this.dex || this.accountMode === 'unifiedAccount' ? '0' : free, time: Date.now(),
      assetPositions: positioned ? [{ type: 'oneWay', position: {
        coin: this.coin, szi: this.positionSize, entryPx: this.price, positionValue: notional.toFixed(),
        unrealizedPnl: '0', returnOnEquity: '0', liquidationPx: null,
        leverage: { ...this.leverage, rawUsd: margin }, marginUsed: margin,
        cumFunding: { allTime: '0', sinceOpen: '0', sinceChange: '0' },
      } }] : [],
    };
  }

  private answer(body: Payload): unknown {
    this.infoRequests.push(body);
    if (body.user && body.user.toLowerCase() !== this.user) { throw new Error('Unexpected account'); }
    if (body.dex && body.dex !== 'xyz') { throw new Error(`Unexpected DEX: ${body.dex}`); }
    switch (body.type) {
      case 'perpDexs': return [null, { name: 'xyz', fullName: 'XYZ' }];
      case 'metaAndAssetCtxs': {
        const snapshot = this.marketSnapshots?.[body.dex || ''];
        if (snapshot) {
          return [{
            universe: snapshot.universe,
            marginTables: [[1, { marginTiers: [{ lowerBound: '0', maxLeverage: 25 }] }]],
            collateralToken: 0,
          }, snapshot.ctxs];
        }
        return [{
          universe: (body.dex || '') !== this.dex ? [] : [{
            name: this.coin, szDecimals: this.szDecimals, maxLeverage: 25, marginTableId: 1, ...this.marketMetadata,
          }],
          marginTables: [[1, { marginTiers: [{ lowerBound: '0', maxLeverage: 25 }] }]], collateralToken: 0,
        }, (body.dex || '') !== this.dex ? [] : [this.context()]];
      }
      case 'clearinghouseState': return this.account(body.dex);
      case 'spotClearinghouseState': return { balances: this.spotBalances ??
        (['unifiedAccount', 'portfolioMargin'].includes(this.accountMode)
          ? [{ coin: 'USDC', token: 0, total: this.spotTotal, hold: this.spotHold, entryNtl: '0' }] : []) };
      case 'userAbstraction': return this.accountMode;
      case 'activeAssetData': return this.activeAssetData();
      case 'userFees': return this.fees;
      case 'candleSnapshot': {
        const req = body.req;
        const requestedCoin = req.coin;
        const intervalMs: Record<string, number> = {
          '1m': 60_000, '5m': 5 * 60_000, '15m': 15 * 60_000, '1h': 60 * 60_000,
          '12h': 12 * 60 * 60_000, '1d': 24 * 60 * 60_000, '1w': 7 * 24 * 60 * 60_000,
          '1M': 30 * 24 * 60 * 60_000,
        };
        const duration = intervalMs[req.interval];
        const configuredMarket = Object.entries(this.marketSnapshots || {}).some(([dex, snapshot]) =>
          snapshot.universe.some((asset) => `${dex ? `${dex}:` : ''}${asset.name}` === requestedCoin)
        );
        if ((requestedCoin !== this.coin && !configuredMarket) || !duration) {
          throw new Error('Unexpected candle series');
        }
        const end = Math.floor(req.endTime / duration) * duration;
        const count = Math.min(100, Math.max(0, Math.floor((end - req.startTime) / duration)));
        return Array.from({ length: count }, (_, index) => {
          const t = end - (count - 1 - index) * duration;
          return { t, T: t + duration - 1, s: requestedCoin, i: req.interval, o: this.price, h: this.price, l: this.price, c: this.price, v: '10', n: 5 };
        });
      }
      case 'frontendOpenOrders':
        return [];
      case 'userFills': return this.historyFills;
      case 'historicalOrders': return this.historicalOrders;
      case 'userFunding': return this.fundingHistory;
      case 'userNonFundingLedgerUpdates': return this.ledgerHistory;
      case 'orderStatus': {
        const parent = this.orders.find((item) => item.action.orders[0].c === body.oid)?.action.orders[0];
        return this.statusQueries.length >= this.orderFoundAfterQueries && parent ? { status: 'order', order: {
          order: { coin: this.coin, side: parent.b ? 'B' : 'A', limitPx: parent.p, sz: '0',
            oid: 10001, timestamp: 1, origSz: parent.s, cloid: parent.c },
          status: 'filled', statusTimestamp: 2,
        } } : { status: 'unknownOid' };
      }
      default: throw new Error(`Unmocked info: ${body.type}`);
    }
  }

  private activeAssetData() {
    if (this.capacityOverride !== undefined) { return this.capacityOverride; }
    return {
      user: this.user, coin: this.coin, leverage: this.leverage,
      maxTradeSzs: this.maxTradeSzs, availableToTrade: this.availableToTrade, markPx: this.mark,
    };
  }

  private async serve(route: Route) {
    const request = route.request();
    const url = new URL(request.url());
    if (url.origin === 'http://127.0.0.1:4300') { await route.continue(); return; }
    try {
      if (await this.funding.serve(route)) { return; }
      if (url.origin === api && ['/info', '/exchange'].includes(url.pathname)) {
        if (request.method() === 'OPTIONS') { await route.fulfill({ status: 204, headers: cors }); return; }
        const body = request.postDataJSON();
        if (url.pathname === '/info') {
          if (body.type === 'metaAndAssetCtxs' && body.dex === this.marketSnapshotFailureDex) {
            this.infoRequests.push(body);
            const response = { error: 'Market snapshot unavailable' };
            this.events.push({ at: new Date().toISOString(), endpoint: 'info', request: body, response,
              clientFailure: '503' });
            await route.fulfill({ status: 503, headers: cors, json: response }); return;
          }
          if (body.type === 'clearinghouseState' && this.accountReadFailureStatus !== null &&
              (this.accountReadFailureDex === null || body.dex === this.accountReadFailureDex)) {
            this.infoRequests.push(body);
            const response = { error: 'Account read unavailable' };
            this.events.push({ at: new Date().toISOString(), endpoint: 'info', request: body, response,
              clientFailure: String(this.accountReadFailureStatus) });
            await route.fulfill({ status: this.accountReadFailureStatus, headers: cors, json: response }); return;
          }
          if (body.type === 'activeAssetData' && this.writes.some((item) => item.action.type === 'updateLeverage')) {
            await this.capacityAfterLeverageGate;
          }
          const response = this.answer(body);
          this.events.push({ at: new Date().toISOString(), endpoint: 'info', request: body, response });
          await route.fulfill({ json: response, headers: cors }); return;
        }
        const event: (typeof this.events)[number] = { at: new Date().toISOString(), endpoint: 'exchange', request: body };
        this.events.push(event);
        this.writes.push(body);
        const signer = body.action.type === 'sendToEvmWithData' ? recoverWithdrawalSigner(body) : recoverSigner(body);
        if (signer.toLowerCase() !== this.user) { throw new Error('Invalid test-wallet signature'); }
        if (body.action.type === 'sendToEvmWithData') {
          const failure = this.withdrawFailures.shift();
          if (failure === 'nonce' || failure === 'balance') {
            event.response = { status: 'err', response: failure === 'nonce' ? 'Invalid nonce' : 'Insufficient balance' };
            await route.fulfill({ headers: cors, json: event.response }); return;
          }
          if (this.withdrawLostResponse) { event.clientFailure = 'disconnect'; await route.abort('connectionreset'); return; }
          if (body.action.sourceDex === 'spot') {
            this.spotTotal = new BigNumber(this.spotTotal).minus(body.action.amount).toFixed();
            const usdc = this.spotBalances?.find((balance) => balance.coin === 'USDC');
            if (usdc) { usdc.total = new BigNumber(usdc.total).minus(body.action.amount).toFixed(); }
          } else {
            this.accountValue = new BigNumber(this.accountValue).minus(body.action.amount).toFixed();
          }
          event.response = { status: 'ok', response: { type: 'default' } };
          await this.withdrawResponseGate;
          // These failures occur after the simulated venue has debited the account.
          if (failure === '503') {
            event.clientFailure = '503'; await route.fulfill({ status: 503, headers: cors, body: 'Unavailable' }); return;
          }
          if (failure === 'malformed') {
            event.clientFailure = 'malformed'; await route.fulfill({ headers: cors, body: '{"status":' }); return;
          }
          await route.fulfill({ headers: cors, json: event.response });
          return;
        }
        if (body.action.type === 'updateLeverage') {
          if (this.rejectLeverage) {
            event.response = { status: 'err', response: 'Insufficient margin to set leverage' };
            await route.fulfill({ headers: cors, json: event.response });
            return;
          }
          this.leverage = {
            type: body.action.isCross ? 'cross' : 'isolated',
            value: body.action.leverage,
          };
          if (this.capacityAfterLeverage !== null) { this.maxTradeSzs = [this.capacityAfterLeverage, this.capacityAfterLeverage]; }
          this.capacityOverride = this.capacityOverrideAfterLeverage;
          event.response = { status: 'ok', response: { type: 'default' } };
          if (this.leverageResponseLost) { event.clientFailure = 'disconnect'; await route.abort('connectionreset'); return; }
          await route.fulfill({ headers: cors, json: { status: 'ok', response: { type: 'default' } } });
          if (this.activeAssetData()) { await this.pushCapacity(); }
          return;
        }
        if (body.action.type === 'order') {
          const parent = body.action.orders[0];
          const fillSize = this.partialFillSize ?? parent.s;
          const before = new BigNumber(this.positionSize);
          const change = new BigNumber(fillSize).times(parent.b ? 1 : -1);
          if (parent.r && (before.isZero() || before.times(change).isPositive() || change.abs().gt(before.abs()))) {
            throw new Error('Invalid reduce-only close');
          }
          this.positionSize = before.plus(change).toFixed();
          const statuses = [
            { filled: { totalSz: fillSize, avgPx: this.price, oid: 10001 } },
            ...body.action.orders.slice(1).map(() => this.protectionRejected
              ? { error: 'Trigger order rejected' } : this.protectionWaitingForFill ? 'waitingForFill' : 'waitingForTrigger'),
          ];
          event.response = { status: 'ok', response: { type: 'order', data: { statuses } } };
          await this.orderResponseGate;
          // The venue accepted and filled before its response was lost/corrupted.
          event.clientFailure = this.lostResponse ? 'disconnect' : this.orderFailure ?? undefined;
          if (this.lostResponse || this.orderFailure === 'disconnect') { await route.abort('connectionreset'); return; }
          if (this.orderFailure === '503') { await route.fulfill({ status: 503, headers: cors, body: 'Unavailable' }); return; }
          if (this.orderFailure === 'malformed') { await route.fulfill({ headers: cors, json: { status: 'ok', response: {} } }); return; }
          await route.fulfill({ headers: cors, json: event.response });
          await pushFrame(this.page, { channel: 'clearinghouseState', data: {
            user: this.user, dex: this.dex, clearinghouseState: this.account(this.dex),
          } });
          return;
        }
      }
      // The real wallet shell reads its normal balance/rates before Perps opens.
      if (request.method() === 'GET' && [
        'https://fonts.googleapis.com/css?family=Roboto:300,400,500',
        'https://fonts.googleapis.com/icon?family=Material+Icons',
      ].includes(request.url())) {
        await route.fulfill({ contentType: 'text/css', body: '' }); return;
      }
      if (request.method() === 'GET' && url.hostname === 'api.neoline.io') {
        if (url.pathname === '/v1/evm/rates') { await route.fulfill({ json: { status: 'success', data: {} } }); return; }
        if (url.pathname === '/v1/fiat/rates') {
          await route.fulfill({ json: { status: 'success', data: { rates: { USD: 1 }, last_updated: 1 } } }); return;
        }
      }
      if (request.url() === 'https://cdn.neoline.io/nodelist.json') {
        await route.fulfill({ json: { '0': [] } }); return;
      }
      if (url.hostname === 'mainnet-1.rpc.banelabs.org' && request.method() === 'POST') {
        const body = request.postDataJSON();
        const rpc = (item: Payload) => {
          if (!['eth_getBalance', 'eth_blockNumber'].includes(item.method)) { throw new Error(`Unmocked RPC: ${item.method}`); }
          return { jsonrpc: '2.0', id: item.id, result: '0x0' };
        };
        await route.fulfill({ json: Array.isArray(body) ? body.map(rpc) : rpc(body) }); return;
      }
      if (url.hostname === 'app.hyperliquid.xyz' && url.pathname.startsWith('/coins/')) {
        await route.fulfill({ contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" />' }); return;
      }
      throw new Error(`Unmocked ${request.method()} ${request.url()}`);
    } catch (error) {
      this.unexpected.push(String(error));
      await route.abort('blockedbyclient');
    }
  }
}

/** User-signed withdrawals use a different EIP-712 domain from exchange orders. */
export function recoverWithdrawalSigner(request: Payload): string {
  return verifyTypedData(
    { name: 'HyperliquidSignTransaction', version: '1', chainId: 421614, verifyingContract: ZeroAddress },
    { 'HyperliquidTransaction:SendToEvmWithData': [
      { name: 'hyperliquidChain', type: 'string' }, { name: 'token', type: 'string' },
      { name: 'amount', type: 'string' }, { name: 'sourceDex', type: 'string' },
      { name: 'destinationRecipient', type: 'string' }, { name: 'addressEncoding', type: 'string' },
      { name: 'destinationChainId', type: 'uint32' }, { name: 'gasLimit', type: 'uint64' },
      { name: 'data', type: 'bytes' }, { name: 'nonce', type: 'uint64' },
    ] },
    request.action, request.signature,
  );
}

/** Recover from the wire payload, without importing the app's signing function. */
export function recoverSigner(request: Payload): string {
  const nonce = Buffer.alloc(8);
  nonce.writeBigUInt64BE(BigInt(request.nonce));
  return verifyTypedData(
    { name: 'Exchange', version: '1', chainId: 1337, verifyingContract: ZeroAddress },
    { Agent: [{ name: 'source', type: 'string' }, { name: 'connectionId', type: 'bytes32' }] },
    { source: 'b', connectionId: keccak256(concat([encode(request.action), nonce, new Uint8Array([0])])) },
    request.signature,
  );
}
