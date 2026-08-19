import { Injectable } from '@angular/core';
import { ethers } from 'ethers';
import BigNumber from 'bignumber.js';

import {
  PerpsDepositConfig,
  PERPS_CCTP_DEX_PERPS,
  PERPS_CCTP_FINALITY_FAST,
  PERPS_CCTP_HYPEREVM_DOMAIN,
  PERPS_DEPOSIT_AUTH_VALIDITY_SECONDS,
  PERPS_DEPOSIT_GAS_BUFFER,
  PERPS_HYPEREVM_CONFIG,
} from '@popup/_lib/perps';
import { PerpsChainError, PerpsRpcService } from './perps-rpc';

const ERC20_ABI = [
  'function balanceOf(address owner) view returns (uint256)',
  'function name() view returns (string)',
  'function version() view returns (string)',
];

/**
 * One call does the whole deposit: the extension pulls the USDC using the
 * user's signed authorisation and burns it through CCTP in the same
 * transaction. The separate approve that `TokenMessengerV2` would need is what
 * this contract exists to avoid.
 */
const CCTP_EXTENSION_ABI = [
  'function batchDepositForBurnWithAuth(' +
    '(uint256 amount,uint256 authValidAfter,uint256 authValidBefore,bytes32 authNonce,uint8 v,bytes32 r,bytes32 s) receiveWithAuthorizationData,' +
    '(uint256 amount,uint32 destinationDomain,bytes32 mintRecipient,bytes32 destinationCaller,uint256 maxFee,uint32 minFinalityThreshold,bytes hookData) depositForBurnData' +
    ')',
];

const RECEIVE_WITH_AUTHORIZATION_TYPES = {
  ReceiveWithAuthorization: [
    { name: 'from', type: 'address' },
    { name: 'to', type: 'address' },
    { name: 'value', type: 'uint256' },
    { name: 'validAfter', type: 'uint256' },
    { name: 'validBefore', type: 'uint256' },
    { name: 'nonce', type: 'bytes32' },
  ],
};

/**
 * What became of a deposit on the source chain.
 *
 * `pending` is not a failure and `reverted` is not a delay; the interface has
 * to be able to say each of them.
 */
export type PerpsDepositOutcome = 'confirmed' | 'reverted' | 'pending';

/**
 * A signed permission for the extension contract to take exactly this deposit.
 *
 * Held instead of the private key between estimating the fee and broadcasting:
 * it authorises one amount, to one contract, for a bounded time, and it cannot
 * be turned back into a key.
 */
export interface PerpsDepositAuthorization {
  from: string;
  amountExact: string;
  validAfter: number;
  validBefore: number;
  nonce: string;
  v: number;
  r: string;
  s: string;
}

@Injectable({ providedIn: 'root' })
export class PerpsDepositChainService {
  constructor(private rpc: PerpsRpcService) {}

  /** Exact token balance, or a `PerpsChainError` when nobody would answer. */
  async tokenBalanceExact(
    config: PerpsDepositConfig,
    address: string
  ): Promise<string> {
    return this.rpc.withEndpoint(config, async (provider) => {
      const token = new ethers.Contract(config.cctp.usdc, ERC20_ABI, provider);
      const balance = await token.balanceOf(address);
      return ethers.formatUnits(balance, config.decimals);
    });
  }

  /** Native balance on the deposit chain — what actually pays for the gas. */
  async nativeBalanceExact(
    config: PerpsDepositConfig,
    address: string
  ): Promise<string> {
    return this.rpc.withEndpoint(config, async (provider) => {
      const balance = await provider.getBalance(address);
      return ethers.formatEther(balance);
    });
  }

  /**
   * Sign the authorisation this deposit will be carried by.
   *
   * The token's EIP-712 name and version are read from the token rather than
   * assumed. Getting either wrong produces a signature the contract rejects,
   * which would surface as an unexplained failure at broadcast; reading them
   * turns that into an ordinary unreachable-chain error instead.
   */
  async authorizeDeposit(
    config: PerpsDepositConfig,
    privateKey: string,
    amountExact: string
  ): Promise<PerpsDepositAuthorization> {
    const wallet = new ethers.Wallet(privateKey);
    const value = ethers.parseUnits(amountExact, config.decimals);
    const nowSeconds = Math.floor(Date.now() / 1000);
    const message = {
      from: wallet.address,
      to: config.cctp.extension,
      value,
      validAfter: 0,
      validBefore: nowSeconds + PERPS_DEPOSIT_AUTH_VALIDITY_SECONDS,
      nonce: ethers.hexlify(ethers.randomBytes(32)),
    };

    const domain = await this.rpc.withEndpoint(config, async (provider) => {
      const token = new ethers.Contract(config.cctp.usdc, ERC20_ABI, provider);
      const [name, version] = await Promise.all([
        token.name(),
        token.version(),
      ]);
      return {
        name,
        version,
        chainId: config.chainId,
        verifyingContract: config.cctp.usdc,
      };
    });

    const signature = ethers.Signature.from(
      await wallet.signTypedData(
        domain,
        RECEIVE_WITH_AUTHORIZATION_TYPES,
        message
      )
    );

    return {
      from: wallet.address,
      amountExact,
      validAfter: message.validAfter,
      validBefore: message.validBefore,
      nonce: message.nonce,
      v: signature.v,
      r: signature.r,
      s: signature.s,
    };
  }

  /**
   * What the deposit will cost in the chain's own currency, as a ceiling.
   *
   * Estimated against the real call rather than assumed — on a rollup the true
   * cost moves with the L1 data fee — and then raised by the same 20% Circle's
   * own example uses, because an authorisation plus an external call estimates
   * tightly and a deposit that runs out of gas still burns what it spent. The
   * buffered limit is both what gets sent and what the user is shown.
   */
  async depositFeeExact(
    config: PerpsDepositConfig,
    authorization: PerpsDepositAuthorization,
    maxFeeExact: string
  ): Promise<string> {
    return this.rpc.withEndpoint(config, async (provider) => {
      const extension = new ethers.Contract(
        config.cctp.extension,
        CCTP_EXTENSION_ABI,
        provider
      );
      const gasLimit = await extension.batchDepositForBurnWithAuth.estimateGas(
        ...this.callArguments(config, authorization, maxFeeExact),
        { from: authorization.from }
      );
      const feeData = await provider.getFeeData();
      const perGas = feeData.maxFeePerGas ?? feeData.gasPrice;
      if (perGas === null || perGas === undefined) {
        throw new PerpsChainError('unavailable', 'No gas price available');
      }
      return ethers.formatEther(this.bufferedGas(gasLimit) * perGas);
    });
  }

  /**
   * Broadcast the deposit and return its hash; it is not yet confirmed.
   *
   * Signed once, then sent as fixed bytes. The endpoint rotation and retries
   * underneath exist for reads, and a write handed to them directly would
   * re-sign on every attempt: a response lost after the node accepted the
   * transaction would come back as a second burn of the user's USDC. Pinning
   * the nonce and the fees into one signature makes every resubmission the
   * same transaction, which a node either already has or has yet to see.
   */
  async sendDeposit(
    config: PerpsDepositConfig,
    privateKey: string,
    authorization: PerpsDepositAuthorization,
    maxFeeExact: string
  ): Promise<string> {
    const signed = await this.rpc.withEndpoint(config, async (provider) => {
      const signer = new ethers.Wallet(privateKey, provider);
      const extension = new ethers.Contract(
        config.cctp.extension,
        CCTP_EXTENSION_ABI,
        signer
      );
      const args = this.callArguments(config, authorization, maxFeeExact);
      const request =
        await extension.batchDepositForBurnWithAuth.populateTransaction(...args);
      request.gasLimit = this.bufferedGas(
        await extension.batchDepositForBurnWithAuth.estimateGas(...args, {
          from: authorization.from,
        })
      );
      return signer.signTransaction(await signer.populateTransaction(request));
    });
    return this.rpc.broadcast(config, signed);
  }

  /**
   * What the deposit transaction did on the source chain, within the caller's
   * patience.
   *
   * Three outcomes, because collapsing them loses the one that matters most.
   * `pending` says only that it has not confirmed yet — the deposit is
   * broadcast and may still land. `reverted` is the opposite: a receipt with a
   * failed status is a settled answer, the USDC was never burned, and no
   * HyperCore credit is ever coming. Reading the presence of a receipt as
   * success puts a reverted deposit into an unending wait for a credit that
   * cannot arrive.
   */
  async depositOutcome(
    config: PerpsDepositConfig,
    hash: string,
    timeoutMs: number
  ): Promise<PerpsDepositOutcome> {
    try {
      const receipt = await this.rpc.withEndpoint(config, (provider) =>
        provider.waitForTransaction(hash, 1, timeoutMs)
      );
      if (!receipt) {
        return 'pending';
      }
      return receipt.status === 1 ? 'confirmed' : 'reverted';
    } catch (error) {
      if (error instanceof PerpsChainError) {
        return 'pending';
      }
      throw error;
    }
  }

  /**
   * The two structs the extension is called with.
   *
   * `mintRecipient` and `destinationCaller` are both the forwarder on HyperEVM,
   * never the user: the mint goes to the forwarder, which then credits the
   * user's HyperCore account from the hook data. Either one pointing anywhere
   * else strands the money permanently.
   */
  private callArguments(
    config: PerpsDepositConfig,
    authorization: PerpsDepositAuthorization,
    maxFeeExact: string
  ) {
    const forwarder = ethers.zeroPadValue(
      this.hyperEvmFor(config).cctpForwarder,
      32
    );
    const amount = ethers.parseUnits(
      authorization.amountExact,
      config.decimals
    );
    return [
      {
        amount,
        authValidAfter: authorization.validAfter,
        authValidBefore: authorization.validBefore,
        authNonce: authorization.nonce,
        v: authorization.v,
        r: authorization.r,
        s: authorization.s,
      },
      {
        amount,
        destinationDomain: PERPS_CCTP_HYPEREVM_DOMAIN,
        mintRecipient: forwarder,
        destinationCaller: forwarder,
        maxFee: ethers.parseUnits(maxFeeExact, config.decimals),
        minFinalityThreshold: PERPS_CCTP_FINALITY_FAST,
        hookData: encodeForwardHookData(authorization.from),
      },
    ] as const;
  }

  private bufferedGas(estimate: bigint): bigint {
    // Held as tenths so a buffer like 1.15 cannot go through Number into BigInt.
    const tenths = new BigNumber(PERPS_DEPOSIT_GAS_BUFFER).times(10);
    if (!tenths.isInteger() || !tenths.isPositive()) {
      throw new Error('PERPS_DEPOSIT_GAS_BUFFER must be a positive multiple of 0.1');
    }
    return (estimate * BigInt(tenths.toFixed())) / 10n;
  }

  /**
   * The HyperEVM side that belongs to this deposit chain.
   *
   * Matched explicitly and refused when it does not match, rather than falling
   * back to one of them: the forwarder address chosen here becomes the mint
   * recipient, and a testnet forwarder named in a mainnet burn sends real USDC
   * somewhere nobody can retrieve it from.
   */
  private hyperEvmFor(config: PerpsDepositConfig) {
    const paired = Object.values(PERPS_HYPEREVM_CONFIG).find(
      (candidate) => candidate.pairedDepositChainId === config.chainId
    );
    if (!paired) {
      throw new PerpsChainError(
        'rejected',
        `No HyperEVM forwarder is paired with chain ${config.chainId}`
      );
    }
    return paired;
  }
}

/**
 * Hook data telling the forwarder which HyperCore account to credit.
 *
 * The layout is Circle's: a 24-byte `cctp-forward` marker, a version, the
 * length of what follows, the recipient, and which HyperCore balance to credit.
 * Only the perps balance is ever named here.
 */
export function encodeForwardHookData(
  recipient: string,
  destinationDex: number = PERPS_CCTP_DEX_PERPS
): string {
  const magic = ethers
    .hexlify(ethers.toUtf8Bytes('cctp-forward'))
    .slice(2)
    .padEnd(48, '0');
  const version = '00000000';
  const dataLength = (24).toString(16).padStart(8, '0');
  const address = recipient.slice(2).toLowerCase();
  const dex = (destinationDex >>> 0).toString(16).padStart(8, '0');
  return `0x${magic}${version}${dataLength}${address}${dex}`;
}

/** Whether an exact decimal covers another, without passing through Number. */
export function coversExact(
  available: string | null,
  required: string | null
): boolean {
  if (available === null || required === null) {
    return false;
  }
  const have = new BigNumber(available);
  const need = new BigNumber(required);
  return (
    have.isFinite() && need.isFinite() && have.isGreaterThanOrEqualTo(need)
  );
}
