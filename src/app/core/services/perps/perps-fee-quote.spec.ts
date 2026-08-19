import { HttpClient } from '@angular/common/http';
import { ethers } from 'ethers';
import { of, throwError, TimeoutError } from 'rxjs';

import { PerpsFeeQuoteService } from './perps-fee-quote.service';
import { PerpsChainError, PerpsRpcService } from './perps-rpc';
import { environment } from '@/environments/environment';

const FAST = 1000;
/** Quotes are per recipient: whether the account exists changes what is charged. */
const RECIPIENT = '0x1234567890123456789012345678901234567890';

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

function encodedBool(value: boolean): string {
  return ethers.AbiCoder.defaultAbiCoder().encode(['bool'], [value]);
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
    // Which Circle API the service talks to is read from the build environment
    // when it is constructed, and a developer points a local build at mainnet
    // by editing that file. This suite is about the testnet build's route, so
    // it pins the network instead of inheriting one.
    network = environment.perpsNetwork;
    environment.perpsNetwork = 'testnet';
    http = jasmine.createSpyObj<HttpClient>('HttpClient', ['get']);
    rpc = jasmine.createSpyObj<PerpsRpcService>('PerpsRpcService', [
      'withEndpoint',
    ]);
    // The recipient already exists on HyperCore, so no new-account fee applies.
    rpc.withEndpoint.and.callFake((endpoints: any, run: any) =>
      run({ call: () => Promise.resolve(encodedBool(true)) })
    );
    service = new PerpsFeeQuoteService(http, rpc);
  });

  afterEach(() => {
    environment.perpsNetwork = network;
  });

  it('asks for the HyperCore deposit route, not a plain HyperEVM transfer', async () => {
    http.get.and.returnValue(of(feeResponse()) as any);

    await service.depositQuote('10', RECIPIENT);

    const url = http.get.calls.mostRecent().args[0] as string;
    expect(url).toContain('iris-api-sandbox.circle.com');
    expect(url).not.toContain('iris-api.circle.com/');
    expect(url).toContain('/3/19');
    expect(url).toContain('forward=true');
    expect(url).toContain('hyperCoreDeposit=true');
  });

  it('quotes the flat forwarding fee in USDC', async () => {
    http.get.and.returnValue(of(feeResponse()) as any);

    const quote = await service.depositQuote('10', RECIPIENT);

    expect(quote.feeExact).toBe('0.2');
  });

  it('adds the protocol fee in basis points, rounded up', async () => {
    http.get.and.returnValue(of(feeResponse({ minimumFee: 1.4 })) as any);

    // 10 USDC at 1.4bps is 0.0014, which needs no rounding; 3.33 gives
    // 0.0004662, which must not be rounded down onto the user.
    const quote = await service.depositQuote('3.33', RECIPIENT);

    expect(quote.feeExact).toBe('0.200467');
  });

  it('folds in the new-account fee when the recipient does not exist yet', async () => {
    http.get.and.returnValue(of(feeResponse()) as any);
    rpc.withEndpoint.and.callFake((endpoints: any, run: any) =>
      run({
        call: (tx: { to: string }) =>
          Promise.resolve(
            tx.to === '0x0000000000000000000000000000000000000810'
              ? encodedBool(false)
              : encodedUint(100000000n)
          ),
      })
    );

    const quote = await service.depositQuote('10', RECIPIENT);

    // 0.2 forwarding plus the 1 USDC Circle charges for creating the account,
    // quoted as one number rather than itemised at the user.
    expect(quote.feeExact).toBe('1.2');
    // But CCTP is only ever authorised for its own share: the account fee is
    // taken later, on the HyperCore leg, by a contract CCTP knows nothing about.
    expect(quote.maxFeeExact).toBe('0.2');
  });

  it('charges no new-account fee to an account that already exists', async () => {
    http.get.and.returnValue(of(feeResponse()) as any);

    const quote = await service.depositQuote('10', RECIPIENT);

    expect(quote.feeExact).toBe('0.2');
  });

  it('refuses to quote when the fast transfer is missing', async () => {
    http.get.and.returnValue(
      of([{ finalityThreshold: 2000, minimumFee: 0 }]) as any
    );

    await expectAsync(service.depositQuote('10', RECIPIENT)).toBeRejectedWithError(
      /fast transfer/
    );
  });

  it('refuses to quote when the fee is unreadable', async () => {
    http.get.and.returnValue(
      of([{ finalityThreshold: FAST, minimumFee: 0 }]) as any
    );

    await expectAsync(service.depositQuote('10', RECIPIENT)).toBeRejectedWithError(
      /unreadable/
    );
  });

  it('reports a refusal as an answer, not as an outage', async () => {
    http.get.and.returnValue(
      throwError(() => ({ status: 400, message: 'Bad request' }))
    );

    await expectAsync(service.depositQuote('10', RECIPIENT)).toBeRejectedWith(
      jasmine.objectContaining({ failure: 'rejected' })
    );
  });

  // The request is bounded by rxjs rather than by ethers, so the error carries
  // neither a code nor a status. Read as a refusal it would stop the deposit
  // and tell the user Circle said no, on the one failure retrying is for.
  it('asks again when the request outlived its deadline', async () => {
    let attempts = 0;
    http.get.and.callFake(() => {
      attempts += 1;
      return (
        attempts === 1 ? throwError(() => new TimeoutError()) : of(feeResponse())
      ) as any;
    });

    const quote = await service.depositQuote('10', RECIPIENT);

    expect(attempts).toBe(2);
    expect(quote.feeExact).toBe('0.2');
  });

  // Runs the retry ladder to the end, which is why it is given room to.
  it(
    'reports an unanswered request as an outage, never as a refusal',
    async () => {
      http.get.and.returnValue(throwError(() => new TimeoutError()) as any);

      await expectAsync(service.depositQuote('10', RECIPIENT)).toBeRejectedWith(
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
    expect(service.minWithdrawExact({ feeExact: '0.2', maxFeeExact: '0.2' })).toBe(
      '0.4'
    );
    expect(service.minWithdrawExact({ feeExact: '0.35', maxFeeExact: '0.35' })).toBe(
      '0.7'
    );
  });
});
