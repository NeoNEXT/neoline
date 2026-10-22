import { HttpClient } from '@angular/common/http';
import { ethers } from 'ethers';
import { of, throwError, TimeoutError } from 'rxjs';

import { PerpsFeeQuoteService } from './perps-fee-quote.service';
import { PerpsRpcService } from './perps-rpc';
import { environment } from '@/environments/environment';
import { PERPS_HYPEREVM_CONFIG } from '@popup/_lib/perps';

const FAST = 1000;
function feeResponse(overrides: Partial<any> = {}) {
  return [
    {
      finalityThreshold: FAST,
      minimumFee: 0,
      forwardFee: { low: 200000, med: 200000, high: 200000 },
      ...overrides,
    },
    { finalityThreshold: 2000, minimumFee: 0 },
  ];
}

function encodedUint(value: bigint): string {
  return ethers.AbiCoder.defaultAbiCoder().encode(['uint256'], [value]);
}

describe('PerpsFeeQuoteService deposit quotes', () => {
  let http: jasmine.SpyObj<HttpClient>;
  let rpc: jasmine.SpyObj<PerpsRpcService>;
  let service: PerpsFeeQuoteService;
  let network: 'mainnet' | 'testnet';

  beforeEach(() => {
    // 本服务连的是哪个 Circle API，是在构造时从构建环境读取的；开发者靠改那个文件把
    // 本地构建指向主网。这个套件针对的是测试网构建的路由，所以它固定网络，而不是继承。
    network = environment.perpsNetwork;
    environment.perpsNetwork = 'testnet';
    http = jasmine.createSpyObj<HttpClient>('HttpClient', ['get']);
    rpc = jasmine.createSpyObj<PerpsRpcService>('PerpsRpcService', [
      'withEndpoint',
    ]);
    rpc.withEndpoint.and.callFake((endpoints: any, run: any) =>
      run({ call: () => Promise.resolve(encodedUint(200000n)) })
    );
    service = new PerpsFeeQuoteService(http, rpc);
  });

  afterEach(() => {
    environment.perpsNetwork = network;
  });

  it('asks for the HyperCore deposit route, not a plain HyperEVM transfer', async () => {
    http.get.and.returnValue(of(feeResponse()) as any);

    await service.depositFeeRate();

    const url = http.get.calls.mostRecent().args[0] as string;
    expect(url).toContain('iris-api-sandbox.circle.com');
    expect(url).not.toContain('iris-api.circle.com/');
    expect(url).toContain('/3/19');
    expect(url).toContain('forward=true');
    expect(url).toContain('hyperCoreDeposit=true');
  });

  it('F1 uses the mainnet Circle route and withdrawal HyperEVM RPC from the build network', async () => {
    environment.perpsNetwork = 'mainnet';
    service = new PerpsFeeQuoteService(http, rpc);
    http.get.and.returnValue(of(feeResponse()) as any);
    await service.depositFeeRate();
    expect(http.get).toHaveBeenCalledOnceWith(
      'https://iris-api.circle.com/v2/burn/USDC/fees/3/19?forward=true&hyperCoreDeposit=true'
    );
    expect(rpc.withEndpoint).not.toHaveBeenCalled();
    await service.withdrawQuote();
    expect(rpc.withEndpoint.calls.mostRecent().args[0]).toBe(PERPS_HYPEREVM_CONFIG.mainnet);
  });

  it('quotes the flat forwarding fee in USDC', async () => {
    http.get.and.returnValue(of(feeResponse()) as any);

    const quote = await service.depositFeeRate();

    expect(quote.forwardFeeExact).toBe('0.2');
  });

  it('returns the protocol fee in basis points and the forwarding fee in USDC', async () => {
    http.get.and.returnValue(of(feeResponse({ minimumFee: 1.4 })) as any);

    expect(await service.depositFeeRate()).toEqual({ protocolFeeBps: 1.4, forwardFeeExact: '0.2' });
    expect(http.get).toHaveBeenCalledTimes(1);
  });

  it('quotes only CCTP fees without querying account existence or account fees', async () => {
    http.get.and.returnValue(of(feeResponse()) as any);
    rpc.withEndpoint.and.rejectWith(new Error('Account RPC unavailable'));

    const quote = await service.depositFeeRate();

    expect(quote.forwardFeeExact).toBe('0.2');
    expect(rpc.withEndpoint).not.toHaveBeenCalled();
  });

  it('refuses to quote when the fast transfer is missing', async () => {
    http.get.and.returnValue(
      of([{ finalityThreshold: 2000, minimumFee: 0 }]) as any
    );

    await expectAsync(service.depositFeeRate()).toBeRejectedWithError(
      /fast transfer/
    );
  });

  it('refuses to quote when the fee is unreadable', async () => {
    http.get.and.returnValue(
      of([{ finalityThreshold: FAST, minimumFee: 0 }]) as any
    );

    await expectAsync(service.depositFeeRate()).toBeRejectedWithError(
      /unreadable/
    );
  });

  it('reports a refusal as an answer, not as an outage', async () => {
    http.get.and.returnValue(
      throwError(() => ({ status: 400, message: 'Bad request' }))
    );

    await expectAsync(service.depositFeeRate()).toBeRejectedWith(
      jasmine.objectContaining({ failure: 'rejected' })
    );
  });

  // 这个请求由 rxjs 而非 ethers 限定，所以错误里既没有 code 也没有 status。
  // 若把它读作拒绝，就会中止入金并告诉用户 Circle 说了不 —— 而这恰恰是重试存在的那种失败。
  it('asks again when the request outlived its deadline', async () => {
    let attempts = 0;
    http.get.and.callFake(() => {
      attempts += 1;
      return (
        attempts === 1 ? throwError(() => new TimeoutError()) : of(feeResponse())
      ) as any;
    });

    const quote = await service.depositFeeRate();

    expect(attempts).toBe(2);
    expect(quote.forwardFeeExact).toBe('0.2');
  });

  // 会把整条重试阶梯跑完，所以才给它留出时间。
  it(
    'reports an unanswered request as an outage, never as a refusal',
    async () => {
      http.get.and.returnValue(throwError(() => new TimeoutError()) as any);

      await expectAsync(service.depositFeeRate()).toBeRejectedWith(
        jasmine.objectContaining({ failure: 'unavailable' })
      );
    },
    15000
  );
});

describe('PerpsFeeQuoteService withdrawal quotes', () => {
  let http: jasmine.SpyObj<HttpClient>;
  let rpc: jasmine.SpyObj<PerpsRpcService>;
  let service: PerpsFeeQuoteService;
  let lastCall: { to?: string; data?: string };

  beforeEach(() => {
    http = jasmine.createSpyObj<HttpClient>('HttpClient', ['get']);
    rpc = jasmine.createSpyObj<PerpsRpcService>('PerpsRpcService', [
      'withEndpoint',
    ]);
    lastCall = {};
    rpc.withEndpoint.and.callFake((endpoints: any, run: any) =>
      run({
        call: (tx: { to: string; data: string }) => {
          lastCall = tx;
          return Promise.resolve(encodedUint(200000n));
        },
      })
    );
    service = new PerpsFeeQuoteService(http, rpc);
  });

  it('reads the fee from the function that applies the override rule', async () => {
    await service.withdrawQuote();

    const selector = ethers
      .id('calculateCrossChainWithdrawalFee(bool,uint32)')
      .slice(0, 10);
    const mapping = ethers.id('cctpForwardFees(uint32)').slice(0, 10);
    expect(lastCall.data?.slice(0, 10)).toBe(selector);
    expect(lastCall.data?.slice(0, 10)).not.toBe(mapping);
  });

  it('asks about forwarding to the deposit chain', async () => {
    await service.withdrawQuote();

    const [shouldForward, destination] =
      ethers.AbiCoder.defaultAbiCoder().decode(
        ['bool', 'uint32'],
        '0x' + (lastCall.data as string).slice(10)
      );
    expect(shouldForward).toBeTrue();
    expect(Number(destination)).toBe(3);
  });

  it('returns the fee in USDC', async () => {
    const quote = await service.withdrawQuote();

    expect(quote.feeExact).toBe('0.2');
  });

  it('derives the withdrawal floor from the quote, not from a constant', () => {
    expect(service.minWithdrawExact({ feeExact: '0.2' })).toBe(
      '0.4'
    );
    expect(service.minWithdrawExact({ feeExact: '0.35' })).toBe(
      '0.7'
    );
  });
});
