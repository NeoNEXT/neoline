import { ethers } from 'ethers';

import { PERPS_DEPOSIT_CONFIG, PERPS_HYPEREVM_CONFIG } from '@popup/_lib/perps';
import {
  encodeForwardHookData,
  PerpsDepositAuthorization,
  PerpsDepositChainService,
} from './perps-deposit-chain.service';
import { PerpsChainError, PerpsRpcService } from './perps-rpc';

const PRIVATE_KEY =
  '0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d';
const ADDRESS = new ethers.Wallet(PRIVATE_KEY).address;
const CONFIG = PERPS_DEPOSIT_CONFIG.testnet;
const FORWARDER = PERPS_HYPEREVM_CONFIG.testnet.cctpForwarder;

const CCTP_EXTENSION = new ethers.Interface([
  'function batchDepositForBurnWithAuth(' +
    '(uint256 amount,uint256 authValidAfter,uint256 authValidBefore,bytes32 authNonce,uint8 v,bytes32 r,bytes32 s) receiveWithAuthorizationData,' +
    '(uint256 amount,uint32 destinationDomain,bytes32 mintRecipient,bytes32 destinationCaller,uint256 maxFee,uint32 minFinalityThreshold,bytes hookData) depositForBurnData' +
    ')',
]);

const coder = ethers.AbiCoder.defaultAbiCoder();

const ERC20 = new ethers.Interface([
  'function balanceOf(address owner) view returns (uint256)',
  'function name() view returns (string)',
  'function version() view returns (string)',
]);

/**
 * 一个对两处 EIP-712 域读取给出不同值的代币，这样用错域构造出来的签名，
 * 就不会因为看起来对称而蒙混过关。
 */
function tokenProvider(seen: { to?: string }[] = []) {
  return {
    call: (tx: { to: string; data: string }) => {
      seen.push({ to: tx.to });
      const name = ERC20.getFunction('name')!.selector;
      return Promise.resolve(
        coder.encode(['string'], [tx.data.startsWith(name) ? 'USD Coin' : '2'])
      );
    },
  };
}

const AUTHORIZATION: PerpsDepositAuthorization = {
  from: ADDRESS,
  amountExact: '10',
  validAfter: 0,
  validBefore: 2000000000,
  nonce: ethers.hexlify(new Uint8Array(32).fill(7)),
  v: 27,
  r: ethers.hexlify(new Uint8Array(32).fill(1)),
  s: ethers.hexlify(new Uint8Array(32).fill(2)),
};

describe('CCTP deposit hook data', () => {
  it('names the perps balance and nothing else', () => {
    const data = encodeForwardHookData(ADDRESS);
    const body = data.slice(2);

    // 24 字节 magic + 4 字节版本 + 4 字节长度 + 20 字节地址 + 4 字节 dex。
    expect(body.length).toBe(56 * 2);
    expect(ethers.toUtf8String('0x' + body.slice(0, 24)).replace(/\0+$/, '')).toBe(
      'cctp-forward'
    );
    expect(body.slice(48, 56)).toBe('00000000');
    expect(parseInt(body.slice(56, 64), 16)).toBe(24);
    expect('0x' + body.slice(64, 104)).toBe(ADDRESS.toLowerCase());
    // 0 是永续余额；现货余额会是 0xffffffff，
    // 而入账到现货的钱在 NeoLine 内既不能交易也不能提出。
    expect(body.slice(104, 112)).toBe('00000000');
  });
});

describe('PerpsDepositChainService deposit call', () => {
  let rpc: jasmine.SpyObj<PerpsRpcService>;
  let service: PerpsDepositChainService;
  let sent: { to?: string; data?: string };

  beforeEach(() => {
    sent = {};
    rpc = jasmine.createSpyObj<PerpsRpcService>('PerpsRpcService', [
      'withEndpoint',
    ]);
    rpc.withEndpoint.and.callFake((endpoints: any, run: any) =>
      run({
        estimateGas: (tx: { to: string; data: string }) => {
          sent = tx;
          return Promise.resolve(100000n);
        },
        getFeeData: () =>
          Promise.resolve({ maxFeePerGas: 1000000000n, gasPrice: null }),
      })
    );
    service = new PerpsDepositChainService(rpc);
  });

  function burnData() {
    const [, burn] = CCTP_EXTENSION.decodeFunctionData(
      'batchDepositForBurnWithAuth',
      sent.data as string
    );
    return burn;
  }

  it('mints to the forwarder and lets only the forwarder receive the message', async () => {
    await service.depositFeeExact(CONFIG, AUTHORIZATION, '0.2');
    const burn = burnData();

    // 这两者中任何一个指向别处，都会让这笔入金永久搁浅。
    expect(burn.mintRecipient).toBe(ethers.zeroPadValue(FORWARDER, 32));
    expect(burn.destinationCaller).toBe(ethers.zeroPadValue(FORWARDER, 32));
    expect(Number(burn.destinationDomain)).toBe(19);
    expect(Number(burn.minFinalityThreshold)).toBe(1000);
  });

  it('authorises CCTP for the fee it was given, not for the amount', async () => {
    await service.depositFeeExact(CONFIG, AUTHORIZATION, '0.2');
    const burn = burnData();

    expect(burn.maxFee).toBe(200000n);
    expect(burn.amount).toBe(10000000n);
  });

  it('prices the deposit at the buffered gas limit, not the bare estimate', async () => {
    const fee = await service.depositFeeExact(CONFIG, AUTHORIZATION, '0.2');

    // 预估 100k，放行 120k，按 1 gwei。
    expect(fee).toBe('0.00012');
  });

  it('refuses to guess which HyperEVM forwarder belongs to a chain', async () => {
    const stray = { ...CONFIG, chainId: 1 };

    await expectAsync(
      service.depositFeeExact(stray, AUTHORIZATION, '0.2')
    ).toBeRejectedWith(jasmine.objectContaining({ failure: 'rejected' }));
  });
});

describe('PerpsDepositChainService authorisation', () => {
  let rpc: jasmine.SpyObj<PerpsRpcService>;
  let service: PerpsDepositChainService;

  beforeEach(() => {
    rpc = jasmine.createSpyObj<PerpsRpcService>('PerpsRpcService', [
      'withEndpoint',
    ]);
    rpc.withEndpoint.and.callFake((endpoints: any, run: any) =>
      run(tokenProvider())
    );
    service = new PerpsDepositChainService(rpc);
  });

  it('reads the signing domain from the token the deposit will burn', async () => {
    const seen: { to?: string }[] = [];
    rpc.withEndpoint.and.callFake((endpoints: any, run: any) =>
      run(tokenProvider(seen))
    );

    await service.authorizeDeposit(CONFIG, PRIVATE_KEY, '10');

    expect(seen.length).toBe(2);
    expect(seen.every((call) => call.to === CONFIG.cctp.usdc)).toBeTrue();
  });

  it('lets the extension pull exactly this deposit, for a bounded time', async () => {
    const before = Math.floor(Date.now() / 1000);
    const auth = await service.authorizeDeposit(CONFIG, PRIVATE_KEY, '10');

    expect(auth.from).toBe(ADDRESS);
    expect(auth.validBefore).toBeGreaterThan(before);
    expect(auth.validBefore).toBeLessThanOrEqual(before + 1800 + 5);
    expect(ethers.dataLength(auth.nonce)).toBe(32);
  });

  it('signs the authorisation over to the extension contract', async () => {
    const auth = await service.authorizeDeposit(CONFIG, PRIVATE_KEY, '10');

    const recovered = ethers.verifyTypedData(
      {
        name: 'USD Coin',
        version: '2',
        chainId: CONFIG.chainId,
        verifyingContract: CONFIG.cctp.usdc,
      },
      {
        ReceiveWithAuthorization: [
          { name: 'from', type: 'address' },
          { name: 'to', type: 'address' },
          { name: 'value', type: 'uint256' },
          { name: 'validAfter', type: 'uint256' },
          { name: 'validBefore', type: 'uint256' },
          { name: 'nonce', type: 'bytes32' },
        ],
      },
      {
        from: ADDRESS,
        to: CONFIG.cctp.extension,
        value: 10000000n,
        validAfter: auth.validAfter,
        validBefore: auth.validBefore,
        nonce: auth.nonce,
      },
      ethers.Signature.from({ v: auth.v, r: auth.r, s: auth.s }).serialized
    );

    expect(recovered).toBe(ADDRESS);
  });
});

describe('PerpsDepositChainService source-chain outcome', () => {
  let rpc: jasmine.SpyObj<PerpsRpcService>;
  let service: PerpsDepositChainService;

  function receiving(receipt: unknown) {
    rpc = jasmine.createSpyObj<PerpsRpcService>('PerpsRpcService', [
      'withEndpoint',
      'broadcast',
    ]);
    rpc.withEndpoint.and.callFake((endpoints: any, run: any) =>
      run({ waitForTransaction: () => Promise.resolve(receipt) })
    );
    service = new PerpsDepositChainService(rpc);
  }

  it('calls a mined transaction with a successful status confirmed', async () => {
    receiving({ status: 1 });

    await expectAsync(
      service.depositOutcome(CONFIG, '0xhash', 1000)
    ).toBeResolvedTo('confirmed');
  });

  // 被 revert 的交易同样有回执。只凭回执就判定成功，会让这笔入金永远等待一笔
  // 不可能到来的入账 —— 因为那些 USDC 根本没有被销毁。
  it('does not mistake a reverted transaction for a confirmed one', async () => {
    receiving({ status: 0 });

    await expectAsync(
      service.depositOutcome(CONFIG, '0xhash', 1000)
    ).toBeResolvedTo('reverted');
  });

  it('treats no receipt inside the timeout as still pending', async () => {
    receiving(null);

    await expectAsync(
      service.depositOutcome(CONFIG, '0xhash', 1000)
    ).toBeResolvedTo('pending');
  });

  it('treats an unreachable chain as pending rather than as an answer', async () => {
    rpc = jasmine.createSpyObj<PerpsRpcService>('PerpsRpcService', [
      'withEndpoint',
      'broadcast',
    ]);
    rpc.withEndpoint.and.returnValue(
      Promise.reject(new PerpsChainError('unavailable', 'no endpoint'))
    );
    service = new PerpsDepositChainService(rpc);

    await expectAsync(
      service.depositOutcome(CONFIG, '0xhash', 1000)
    ).toBeResolvedTo('pending');
  });
});

describe('PerpsDepositChainService broadcast', () => {
  let rpc: jasmine.SpyObj<PerpsRpcService>;
  let service: PerpsDepositChainService;
  let signedCount: number;

  beforeEach(() => {
    signedCount = 0;
    rpc = jasmine.createSpyObj<PerpsRpcService>('PerpsRpcService', [
      'withEndpoint',
      'broadcast',
    ]);
    rpc.withEndpoint.and.callFake((endpoints: any, run: any) => {
      signedCount++;
      return run({
        estimateGas: () => Promise.resolve(100000n),
        getFeeData: () =>
          Promise.resolve({
            maxFeePerGas: 1000000000n,
            maxPriorityFeePerGas: 1000000n,
            gasPrice: 1000000000n,
          }),
        getTransactionCount: () => Promise.resolve(7),
        estimateGasLimit: () => Promise.resolve(100000n),
        getNetwork: () =>
          Promise.resolve(new ethers.Network(CONFIG.chainName, CONFIG.chainId)),
        call: () => Promise.resolve('0x'),
        broadcastTransaction: () => Promise.reject(new Error('not used')),
        _perform: () => Promise.resolve(null),
      });
    });
    rpc.broadcast.and.callFake((_endpoints: any, raw: string) =>
      Promise.resolve(ethers.keccak256(raw))
    );
    service = new PerpsDepositChainService(rpc);
  });

  // `withEndpoint` 下的重试循环可能把回调跑很多次。把广播放在里面，每次尝试都会重新
  // 签名，于是一次丢失的响应就变成了用户 USDC 的第二次销毁。
  it('signs the deposit once and hands fixed bytes to the broadcaster', async () => {
    const hash = await service.sendDeposit(CONFIG, PRIVATE_KEY, AUTHORIZATION, '0.2');

    expect(rpc.broadcast).toHaveBeenCalledTimes(1);
    const raw = rpc.broadcast.calls.mostRecent().args[1] as string;
    const transaction = ethers.Transaction.from(raw);
    expect(transaction.from).toBe(ADDRESS);
    expect(transaction.to).toBe(CONFIG.cctp.extension);
    expect(transaction.nonce).toBe(7);
    // 预估 100k，放行 120k。
    expect(transaction.gasLimit).toBe(120000n);
    expect(hash).toBe(ethers.keccak256(raw));
  });

  it('is the same transaction however many times those bytes are submitted', async () => {
    await service.sendDeposit(CONFIG, PRIVATE_KEY, AUTHORIZATION, '0.2');
    const raw = rpc.broadcast.calls.mostRecent().args[1] as string;

    expect(ethers.Transaction.from(raw).hash).toBe(ethers.keccak256(raw));
    expect(signedCount).toBe(1);
  });
});
