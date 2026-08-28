import { ethers } from 'ethers';
import { TimeoutError } from 'rxjs';

import {
  isAlreadyBroadcast,
  isRetriable,
  PerpsChainError,
  PerpsRpcService,
} from './perps-rpc';

const PRIVATE_KEY =
  '0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d';

/** ethers 给非 2xx 响应的形状：无论状态码是什么，都是同一个 code。 */
function serverError(status: string) {
  return {
    code: 'SERVER_ERROR',
    message: `server response ${status}`,
    info: { responseStatus: status },
  };
}

describe('perps RPC retry policy', () => {
  // 这条规则的另一端是钱，所以什么可以重发、什么不可以，都逐个用例写清楚，
  // 而不是丢给一次统一的 code 判断。
  it('does not retry a 500 carrying an answer', () => {
    expect(isRetriable(serverError('500 Internal Server Error'))).toBeFalse();
  });

  it('retries the gateway-class answers', () => {
    expect(isRetriable(serverError('502 Bad Gateway'))).toBeTrue();
    expect(isRetriable(serverError('503 Service Unavailable'))).toBeTrue();
    expect(isRetriable(serverError('504 Gateway Timeout'))).toBeTrue();
  });

  it('does not retry a refusal', () => {
    expect(isRetriable(serverError('400 Bad Request'))).toBeFalse();
    expect(isRetriable(serverError('429 Too Many Requests'))).toBeFalse();
  });

  // 状态码为 0 是 ethers 在说「没有任何回应」，这不是拒绝。
  it('retries when no server answered at all', () => {
    expect(isRetriable(serverError('0 '))).toBeTrue();
    expect(isRetriable({ code: 'TIMEOUT', message: 'timeout' })).toBeTrue();
    expect(isRetriable(new TypeError('Failed to fetch'))).toBeTrue();
  });

  // 手续费报价不走 ethers：它是一次由 rxjs `timeout` 限定的 `HttpClient` 调用，
  // 这两种形状都不带上面的检查能识别的 code 或 status。
  it('retries a request that outlived its own deadline', () => {
    expect(isRetriable(new TimeoutError())).toBeTrue();
  });

  it('retries an HTTP request that never reached a server', () => {
    expect(
      isRetriable({
        status: 0,
        message: 'Http failure response for https://iris: 0 Unknown Error',
      })
    ).toBeTrue();
  });

  it('still refuses an HTTP answer that says no', () => {
    expect(isRetriable({ status: 400, message: 'Bad Request' })).toBeFalse();
    expect(isRetriable({ status: 429, message: 'Too Many Requests' })).toBeFalse();
    expect(isRetriable({ status: 503, message: 'Service Unavailable' })).toBeTrue();
  });

  it('retries a body that did not parse, whatever status came with it', () => {
    expect(
      isRetriable({
        code: 'UNSUPPORTED_OPERATION',
        message: 'response body is not valid JSON',
      })
    ).toBeTrue();
  });

  it('never retries a decision this policy already made', () => {
    expect(isRetriable(new PerpsChainError('rejected', 'refused'))).toBeFalse();
  });

  it('does not retry while the browser reports itself offline', () => {
    spyOnProperty(navigator, 'onLine', 'get').and.returnValue(false);
    expect(isRetriable(new TimeoutError())).toBeFalse();
    expect(isRetriable({ status: 0, message: 'Unknown Error' })).toBeFalse();
  });

  it('recognises an endpoint that already holds the transaction', () => {
    expect(isAlreadyBroadcast(new Error('already known'))).toBeTrue();
    expect(isAlreadyBroadcast(new Error('nonce too low'))).toBeFalse();
  });
});

describe('PerpsRpcService broadcast', () => {
  let rpc: PerpsRpcService;
  let signed: string;

  const endpoints = {
    chainId: 421614,
    chainName: 'Arbitrum Sepolia',
    rpcUrls: ['https://example.invalid'],
  };

  beforeEach(async () => {
    rpc = new PerpsRpcService();
    signed = await new ethers.Wallet(PRIVATE_KEY).signTransaction({
      chainId: 421614,
      nonce: 3,
      to: ethers.ZeroAddress,
      value: 0n,
      gasLimit: 120000n,
      maxFeePerGas: 1000000000n,
      maxPriorityFeePerGas: 1000000n,
      type: 2,
    });
  });

  it('derives the hash from the bytes, not from the reply', async () => {
    spyOn(rpc, 'withEndpoint').and.callFake((_endpoints: any, run: any) =>
      run({ broadcastTransaction: () => Promise.resolve({ hash: 'ignored' }) })
    );

    await expectAsync(rpc.broadcast(endpoints, signed)).toBeResolvedTo(
      ethers.keccak256(signed)
    );
  });

  // 它已经知道的那笔交易就是这一笔：字节完全相同。
  it('accepts an endpoint saying it already has this transaction', async () => {
    spyOn(rpc, 'withEndpoint').and.returnValue(
      Promise.reject(new PerpsChainError('rejected', 'already known'))
    );

    await expectAsync(rpc.broadcast(endpoints, signed)).toBeResolvedTo(
      ethers.keccak256(signed)
    );
  });

  it('still reports a refusal that means something else', async () => {
    spyOn(rpc, 'withEndpoint').and.returnValue(
      Promise.reject(new PerpsChainError('rejected', 'insufficient funds'))
    );

    await expectAsync(rpc.broadcast(endpoints, signed)).toBeRejectedWith(
      jasmine.objectContaining({ failure: 'rejected' })
    );
  });
});
