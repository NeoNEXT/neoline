import { Interface, Transaction, ZeroAddress, keccak256, parseEther, parseUnits, toQuantity } from 'ethers';
import { Route } from '@playwright/test';

export const fundingContracts = {
  usdc: '0x75faf114eafb1BDbe2F0316DF893fd58CE46AA4d',
  extension: '0x8E4e3d0E95C1bEC4F3eC7F69aa48473E0Ab6eB8D',
  coreWallet: '0x0B80659a4076E9E93C7DbE0f10675A16a3e5C206',
  forwarder: '0x02e39ECb8368b41bF68FF99ff351aC9864e5E2a2',
};
export const depositAbi = new Interface([
  'function batchDepositForBurnWithAuth((uint256 amount,uint256 authValidAfter,uint256 authValidBefore,bytes32 authNonce,uint8 v,bytes32 r,bytes32 s) authorization,(uint256 amount,uint32 destinationDomain,bytes32 mintRecipient,bytes32 destinationCaller,uint256 maxFee,uint32 minFinalityThreshold,bytes hookData) burn)',
]);
const tokenAbi = new Interface([
  'function balanceOf(address owner) view returns (uint256)',
  'function name() view returns (string)',
  'function version() view returns (string)',
]);
const coreAbi = new Interface([
  'function calculateCrossChainWithdrawalFee(bool shouldForward,uint32 destinationChainId) view returns (uint256)',
]);
const blockHash = `0x${'11'.repeat(32)}`;
const sourceRpcUrls = [
  'https://sepolia-rollup.arbitrum.io/rpc',
  'https://arbitrum-sepolia-rpc.publicnode.com/',
];
const feeUrl = 'https://iris-api-sandbox.circle.com/v2/burn/USDC/fees/3/19?forward=true&hyperCoreDeposit=true';
type FundingEvent = { at: string; endpoint: string; request?: unknown; response?: unknown; clientFailure?: string };

/** Delay a protocol response until the UI has reached the intended lifecycle boundary. */
export function responseGate() {
  let arrived!: () => void;
  let resume!: () => void;
  let sent!: () => void;
  const received = new Promise<void>((resolve) => { arrived = resolve; });
  const pending = new Promise<void>((resolve) => { resume = resolve; });
  const completed = new Promise<void>((resolve) => { sent = resolve; });
  return { received, completed, promise: pending, release: resume, sent,
    wait: async () => { arrived(); await pending; } };
}

/** Protocol-only RPC fixture. Wallet authorization and raw transaction signing stay real. */
export class FakeFunding {
  readonly rpcRequests: { url: string; method: string; params: any[] }[] = [];
  readonly broadcasts: string[] = [];
  readonly feeRequests: string[] = [];
  readonly events: FundingEvent[] = [];
  tokenBalance = parseUnits('500.123456', 6);
  nativeBalance = parseEther('1');
  withdrawFee = '0.2';
  receiptStatus: number | null = 1;
  circleFees: any[] = [{
    finalityThreshold: 1000, minimumFee: 1.4,
    forwardFee: { low: 200000, med: 200000, high: 200000 },
  }];
  gasEstimate = 100000n;
  nativeBalanceUnavailable = false;
  tokenBalanceUnavailable = false;
  broadcastFailure: 'rotate-known' | 'lost-then-nonce' | 'disconnect' | null = null;
  private gasEstimateGate?: ReturnType<typeof responseGate>;
  private withdrawQuoteGate?: { gate: ReturnType<typeof responseGate>; malformed: boolean };

  constructor(private user: string) {}

  holdNextGasEstimate() {
    const gate = responseGate(); this.gasEstimateGate = gate; return gate;
  }

  holdNextWithdrawQuote(malformed = false) {
    const gate = responseGate(); this.withdrawQuoteGate = { gate, malformed }; return gate;
  }

  async serve(route: Route): Promise<boolean> {
    const request = route.request();
    const url = request.url();
    if (url === feeUrl && request.method() === 'GET') {
      this.feeRequests.push(url);
      const entries = JSON.parse(JSON.stringify(this.circleFees));
      this.events.push({ at: new Date().toISOString(), endpoint: url, response: entries });
      await route.fulfill({ json: entries });
      return true;
    }
    const source = sourceRpcUrls.includes(url);
    if (!source && url !== 'https://rpc.hyperliquid-testnet.xyz/evm') {
      return false;
    }
    if (request.method() !== 'POST') {
      throw new Error(`Unexpected funding method: ${request.method()}`);
    }
    const body = request.postDataJSON();
    const items = Array.isArray(body) ? body : [body];
    const withdrawalQuote = (item: any) => !source && item.method === 'eth_call' &&
      item.params[0].to.toLowerCase() === fundingContracts.coreWallet.toLowerCase() &&
      item.params[0].data.startsWith(coreAbi.getFunction('calculateCrossChainWithdrawalFee')!.selector);
    const held = items.some(withdrawalQuote) ? this.withdrawQuoteGate : undefined;
    if (held) { this.withdrawQuoteGate = undefined; }
    const respond = (item: any) => {
      this.rpcRequests.push({ url, method: item.method, params: item.params });
      const balanceCall = source && item.method === 'eth_call' &&
        item.params[0].to.toLowerCase() === fundingContracts.usdc.toLowerCase() &&
        item.params[0].data.startsWith(tokenAbi.getFunction('balanceOf')!.selector);
      if ((source && item.method === 'eth_getBalance' && this.nativeBalanceUnavailable) ||
          (balanceCall && this.tokenBalanceUnavailable)) {
        return { jsonrpc: '2.0', id: item.id, error: { code: -32000, message: 'Balance read unavailable' } };
      }
      if (held?.malformed && withdrawalQuote(item)) { return { jsonrpc: '2.0', id: item.id, result: '0x' }; }
      return { jsonrpc: '2.0', id: item.id, result: this.rpc(source, item.method, item.params) };
    };
    // Capture the old response before waiting: changing global fee state must not rewrite it.
    const responses = items.map(respond);
    const heldGas = source && items.some((item) => item.method === 'eth_estimateGas')
      ? this.gasEstimateGate : undefined;
    if (heldGas) { this.gasEstimateGate = undefined; }
    const event: FundingEvent = {
      at: new Date().toISOString(), endpoint: url, request: body,
    };
    this.events.push(event);
    await held?.gate.wait();
    await heldGas?.wait();
    const broadcast = items.findIndex((item: any) => item.method === 'eth_sendRawTransaction');
    if (broadcast >= 0 && this.broadcastFailure) {
      if (this.broadcastFailure === 'disconnect') {
        event.clientFailure = 'connectionreset'; await route.abort('connectionreset'); return true;
      }
      const lost = this.broadcastFailure === 'rotate-known'
        ? url === sourceRpcUrls[0] : this.broadcasts.length === 1;
      // A gateway may answer other batch items while returning no broadcast result.
      // Keep this distinct from a dropped HTTP batch, which also loses eth_blockNumber.
      responses[broadcast] = {
        jsonrpc: '2.0', id: items[broadcast].id,
        error: { code: -32000, message: lost ? 'network error: broadcast response lost'
          : this.broadcastFailure === 'rotate-known' ? 'already known' : 'nonce too low' },
      };
    }
    event.response = Array.isArray(body) ? responses : responses[0];
    await route.fulfill({ json: Array.isArray(body) ? responses : responses[0] });
    held?.gate.sent();
    heldGas?.sent();
    return true;
  }

  private rpc(source: boolean, method: string, params: any[]): unknown {
    if (method === 'eth_call') {
      const call = params[0];
      const to = call.to.toLowerCase();
      if (source && to === fundingContracts.usdc.toLowerCase()) {
        const decoded = tokenAbi.parseTransaction(call)!;
        if (decoded.name === 'balanceOf') {
          if (decoded.args[0].toLowerCase() !== this.user) { throw new Error('Wrong deposit balance owner'); }
          return tokenAbi.encodeFunctionResult('balanceOf', [this.tokenBalance]);
        }
        if (decoded.name === 'name') { return tokenAbi.encodeFunctionResult('name', ['USD Coin']); }
        if (decoded.name === 'version') { return tokenAbi.encodeFunctionResult('version', ['2']); }
      }
      if (!source && to === fundingContracts.coreWallet.toLowerCase()) {
        const decoded = coreAbi.parseTransaction(call)!;
        if (decoded.name === 'calculateCrossChainWithdrawalFee' && decoded.args[0] && decoded.args[1] === 3n) {
          return coreAbi.encodeFunctionResult(decoded.name, [parseUnits(this.withdrawFee, 6)]);
        }
      }
      throw new Error(`Unmocked funding call: ${to} ${call.data}`);
    }
    if (!source) { throw new Error(`Unmocked HyperEVM RPC: ${method}`); }
    switch (method) {
      case 'eth_getBalance':
        if (params[0].toLowerCase() !== this.user) { throw new Error('Wrong gas balance owner'); }
        return toQuantity(this.nativeBalance);
      case 'eth_estimateGas':
        if (params[0].to.toLowerCase() !== fundingContracts.extension.toLowerCase() ||
            !depositAbi.parseTransaction(params[0])) { throw new Error('Wrong deposit gas estimate'); }
        return toQuantity(this.gasEstimate);
      case 'eth_gasPrice':
      case 'eth_maxPriorityFeePerGas': return toQuantity(1_000_000_000);
      case 'eth_getTransactionCount': return '0x0';
      case 'eth_blockNumber': return '0x64';
      case 'eth_getBlockByNumber': return {
        hash: blockHash, parentHash: `0x${'00'.repeat(32)}`, number: '0x64',
        timestamp: toQuantity(Math.floor(Date.now() / 1000)), nonce: '0x0000000000000000',
        difficulty: '0x0', gasLimit: '0x1c9c380', gasUsed: '0x186a0',
        miner: ZeroAddress, extraData: '0x', baseFeePerGas: toQuantity(1_000_000_000), transactions: [],
      };
      case 'eth_sendRawTransaction': {
        const raw = params[0];
        const tx = Transaction.from(raw);
        if (tx.chainId !== 421614n || tx.from?.toLowerCase() !== this.user ||
            tx.to?.toLowerCase() !== fundingContracts.extension.toLowerCase()) {
          throw new Error('Wrong deposit transaction network, signer or recipient');
        }
        const call = depositAbi.parseTransaction(tx)!;
        if (!this.broadcasts.includes(raw) && this.receiptStatus === 1) {
          this.tokenBalance -= call.args[0].amount;
        }
        this.broadcasts.push(raw);
        return keccak256(raw);
      }
      case 'eth_getTransactionReceipt': {
        const raw = this.broadcasts.find((item) => keccak256(item) === params[0]);
        if (!raw) { throw new Error('Receipt requested for an unknown deposit'); }
        if (this.receiptStatus === null) { return null; }
        return {
          transactionHash: params[0], transactionIndex: '0x0', blockHash, blockNumber: '0x64',
          from: this.user, to: fundingContracts.extension, contractAddress: null,
          gasUsed: '0x186a0', cumulativeGasUsed: '0x186a0', effectiveGasPrice: toQuantity(1_000_000_000),
          logsBloom: `0x${'00'.repeat(256)}`, logs: [], status: toQuantity(this.receiptStatus), type: '0x2',
        };
      }
      default: throw new Error(`Unmocked Arbitrum RPC: ${method}`);
    }
  }
}
