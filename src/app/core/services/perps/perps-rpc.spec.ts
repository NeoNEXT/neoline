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

/** The shape ethers gives a non-2xx response: one code, whatever the status. */
function serverError(status: string) {
  return {
    code: 'SERVER_ERROR',
    message: `server response ${status}`,
    info: { responseStatus: status },
  };
}

describe('perps RPC retry policy', () => {
  // Money is at the other end of this rule, so what may be repeated and what
  // may not is stated per case rather than left to a single code check.
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

  // Status zero is ethers saying nothing answered, which is not a refusal.
  it('retries when no server answered at all', () => {
    expect(isRetriable(serverError('0 '))).toBeTrue();
    expect(isRetriable({ code: 'TIMEOUT', message: 'timeout' })).toBeTrue();
    expect(isRetriable(new TypeError('Failed to fetch'))).toBeTrue();
  });

  // The fee quote does not go out through ethers: it is an `HttpClient` call
  // bounded by rxjs `timeout`, and neither shape carries a code or a status the
  // checks above would recognise.
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

  // The transaction it already knows about is this one: the bytes are identical.
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
