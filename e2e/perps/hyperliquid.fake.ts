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
  lostResponse = false;
  withdrawLostResponse = false;
  protectionRejected = false;
  partialFillSize: string | null = null;
  rejectLeverage = false;
  capacityAfterLeverage: string | null = null;
  accountValue = '1000';
  accountMode = 'default';
  spotTotal = '300';
  spotHold = '50';
  positionSize = '0';
  private leverage = { type: 'cross', value: 2 };
  private capacity = '20';

  constructor(private page: Page, readonly user: string) {
    this.funding = new FakeFunding(user);
  }

  get orders() { return this.writes.filter((request) => request.action.type === 'order'); }
  get statusQueries() { return this.infoRequests.filter((request) => request.type === 'orderStatus'); }
  get withdrawals() { return this.writes.filter((request) => request.action.type === 'sendToEvmWithData'); }

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
    await pushFrame(this.page, { channel: 'activeAssetCtx', data: { coin: 'ETH', ctx: assetCtx(price) } });
  }

  private account(dex = '') {
    const positioned = !dex && !new BigNumber(this.positionSize).isZero();
    const notional = new BigNumber(this.positionSize).abs().times(100);
    const margin = positioned ? notional.div(this.leverage.value).toFixed() : '0';
    const free = new BigNumber(this.accountValue).minus(margin).toFixed();
    const summary = {
      accountValue: dex ? '0' : this.accountValue, totalRawUsd: dex ? '0' : this.accountValue,
      totalNtlPos: positioned ? notional.toFixed() : '0', totalMarginUsed: margin,
    };
    return {
      marginSummary: summary,
      crossMarginSummary: positioned && this.leverage.type === 'isolated'
        ? { accountValue: free, totalRawUsd: free, totalNtlPos: '0', totalMarginUsed: '0' }
        : summary,
      crossMaintenanceMarginUsed: positioned && this.leverage.type === 'cross' ? '2' : '0',
      withdrawable: dex || this.accountMode === 'unifiedAccount' ? '0' : free, time: Date.now(),
      assetPositions: positioned ? [{ type: 'oneWay', position: {
        coin: 'ETH', szi: this.positionSize, entryPx: '100', positionValue: notional.toFixed(),
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
      case 'metaAndAssetCtxs': return [{
        universe: body.dex ? [] : [{ name: 'ETH', szDecimals: 4, maxLeverage: 25, marginTableId: 1 }],
        marginTables: [[1, { marginTiers: [{ lowerBound: '0', maxLeverage: 25 }] }]], collateralToken: 0,
      }, body.dex ? [] : [assetCtx()]];
      case 'clearinghouseState': return this.account(body.dex);
      case 'spotClearinghouseState': return { balances: this.accountMode === 'unifiedAccount'
        ? [{ coin: 'USDC', token: 0, total: this.spotTotal, hold: this.spotHold, entryNtl: '0' }] : [] };
      case 'userAbstraction': return this.accountMode;
      case 'activeAssetData': return this.activeAssetData();
      case 'userFees': return { userCrossRate: '0.00045', userAddRate: '0.00015', activeReferralDiscount: '0' };
      case 'candleSnapshot': {
        const req = body.req;
        if (req.coin !== 'ETH' || req.interval !== '15m') { throw new Error('Unexpected candle series'); }
        const duration = 15 * 60_000;
        const end = Math.floor(req.endTime / duration) * duration;
        const count = Math.min(100, Math.max(0, Math.floor((end - req.startTime) / duration)));
        return Array.from({ length: count }, (_, index) => {
          const t = end - (count - 1 - index) * duration;
          return { t, T: t + duration - 1, s: 'ETH', i: '15m', o: '99', h: '101', l: '98', c: '100', v: '10', n: 5 };
        });
      }
      case 'frontendOpenOrders':
      case 'userFills': return [];
      case 'orderStatus': return { status: 'unknownOid' };
      default: throw new Error(`Unmocked info: ${body.type}`);
    }
  }

  private activeAssetData() {
    return {
      user: this.user, coin: 'ETH', leverage: this.leverage,
      maxTradeSzs: [this.capacity, this.capacity], availableToTrade: ['1000', '1000'], markPx: '100',
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
        if (url.pathname === '/info') { await route.fulfill({ json: this.answer(body), headers: cors }); return; }
        this.writes.push(body);
        const signer = body.action.type === 'sendToEvmWithData' ? recoverWithdrawalSigner(body) : recoverSigner(body);
        if (signer.toLowerCase() !== this.user) { throw new Error('Invalid test-wallet signature'); }
        if (body.action.type === 'sendToEvmWithData') {
          if (this.withdrawLostResponse) { await route.abort('connectionreset'); return; }
          if (body.action.sourceDex === 'spot') {
            this.spotTotal = new BigNumber(this.spotTotal).minus(body.action.amount).toFixed();
          } else {
            this.accountValue = new BigNumber(this.accountValue).minus(body.action.amount).toFixed();
          }
          await route.fulfill({ headers: cors, json: { status: 'ok', response: { type: 'default' } } });
          return;
        }
        if (body.action.type === 'updateLeverage') {
          if (this.rejectLeverage) {
            await route.fulfill({ headers: cors, json: { status: 'err', response: 'Insufficient margin to set leverage' } });
            return;
          }
          this.leverage = {
            type: body.action.isCross ? 'cross' : 'isolated',
            value: body.action.leverage,
          };
          if (this.capacityAfterLeverage !== null) { this.capacity = this.capacityAfterLeverage; }
          await route.fulfill({ headers: cors, json: { status: 'ok', response: { type: 'default' } } });
          await pushFrame(this.page, { channel: 'activeAssetData', data: this.activeAssetData() });
          return;
        }
        if (body.action.type === 'order') {
          if (this.lostResponse) { await route.abort('connectionreset'); return; }
          const parent = body.action.orders[0];
          const fillSize = this.partialFillSize ?? parent.s;
          const before = new BigNumber(this.positionSize);
          const change = new BigNumber(fillSize).times(parent.b ? 1 : -1);
          if (parent.r && (before.isZero() || before.times(change).isPositive() || change.abs().gt(before.abs()))) {
            throw new Error('Invalid reduce-only close');
          }
          this.positionSize = before.plus(change).toFixed();
          const statuses = [
            { filled: { totalSz: fillSize, avgPx: '100', oid: 10001 } },
            ...body.action.orders.slice(1).map(() => this.protectionRejected
              ? { error: 'Trigger order rejected' } : 'waitingForTrigger'),
          ];
          await route.fulfill({ headers: cors, json: { status: 'ok', response: { type: 'order', data: {
            statuses,
          } } } });
          await pushFrame(this.page, { channel: 'clearinghouseState', data: { user: this.user, dex: '', clearinghouseState: this.account() } });
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
