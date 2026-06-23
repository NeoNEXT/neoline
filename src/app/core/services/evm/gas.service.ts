import { RpcNetwork } from '@/app/popup/_lib';
import {
  ETH_SOURCE_ASSET_HASH,
  SIMULATION_FAILED_GAS_LIMIT_PERCENT,
} from '@/app/popup/_lib/evm';
import { AppState } from '@/app/reduers';
import { Asset } from '@/models/models';
import { Injectable } from '@angular/core';
import { Store } from '@ngrx/store';
import { ethers } from 'ethers';
import BigNumber from 'bignumber.js';
import {
  EvmGasEstimateResult,
  NeoXFeeInfoProp,
} from '@/app/popup/transfer/create/interface';
import { EvmTxService } from './tx.service';

@Injectable()
export class EvmGasService {
  private neoXNetwork: RpcNetwork;
  private provider: ethers.JsonRpcProvider;

  constructor(
    private store: Store<AppState>,
    private evmTxService: EvmTxService
  ) {
    const account$ = this.store.select('account');
    account$.subscribe((state) => {
      this.neoXNetwork = state.neoXNetworks[state.neoXNetworkIndex];
      this.provider?.destroy();
      const network = new ethers.Network(
        this.neoXNetwork.name,
        this.neoXNetwork.chainId
      );
      this.provider = new ethers.JsonRpcProvider(
        this.neoXNetwork.rpcUrl,
        network,
        {
          staticNetwork: network,
        }
      );
    });
  }

  estimateGasOfTransfer({
    asset,
    fromAddress,
    toAddress,
    transferAmount,
  }: {
    asset: Asset;
    fromAddress: string;
    toAddress: string;
    transferAmount: string;
  }): Promise<EvmGasEstimateResult> {
    if (asset.asset_id === ETH_SOURCE_ASSET_HASH) {
      return this.estimateWithFallback(() => Promise.resolve(BigInt(21000)));
    }
    const amountBN = BigInt(
      new BigNumber(transferAmount)
        .shiftedBy(Number(asset.decimals))
        .toFixed(0, 1)
    );
    return this.estimateWithFallback(() =>
      this.provider.estimateGas({
        from: fromAddress,
        to: asset.asset_id,
        data: this.evmTxService.getTransferERC20Data({
          asset,
          toAddress,
          transferAmount: amountBN,
        }),
      })
    );
  }

  estimateGas(txParams): Promise<EvmGasEstimateResult> {
    const newParams = {
      from: txParams.from,
      to: txParams.to,
      value: txParams.value,
      data: txParams.data,
    };
    return this.estimateWithFallback(() =>
      this.provider.estimateGas(newParams)
    );
  }

  /**
   * Runs a gas simulation, fetching the latest block up front so its gas limit is
   * available as the fallback. If the simulation reverts, we fall back to a
   * fraction of the *live* block gas limit and flag `simulationFailed` — never a
   * hardcoded number. If the block can't be fetched, or the estimate itself fails
   * for a transport reason (node unreachable/unresponsive), the error propagates
   * so the caller surfaces a network error instead of falsely warning that the
   * transaction will fail.
   * See docs/adr/0001-evm-gas-estimation-failure-fallback.md
   */
  private async estimateWithFallback(
    estimateFn: () => Promise<bigint>
  ): Promise<EvmGasEstimateResult> {
    const block = await this.provider.send('eth_getBlockByNumber', [
      'latest',
      false,
    ]);
    let gasLimit: bigint;
    let simulationFailed = false;
    try {
      gasLimit = await estimateFn();
    } catch (err) {
      // Only an execution revert justifies the block-gas-limit fallback. A
      // transport/RPC failure during estimation must propagate — otherwise a
      // transient network blip gets mislabeled as "this transaction will fail".
      if (this.isRpcFailure(err)) {
        throw err;
      }
      gasLimit =
        (BigInt(block.gasLimit) *
          BigInt(SIMULATION_FAILED_GAS_LIMIT_PERCENT)) /
        BigInt(100);
      simulationFailed = true;
    }
    return { gasLimit, simulationFailed, block };
  }

  /**
   * Distinguishes a transport/RPC failure (node unreachable or unresponsive)
   * from an execution revert. Only the former bypasses the gas fallback and
   * surfaces a network error; an execution revert wrapped in a `SERVER_ERROR`
   * still counts as a revert, not an unreachable node.
   */
  private isRpcFailure(err: any): boolean {
    const code = err?.code;
    if (
      code !== 'NETWORK_ERROR' &&
      code !== 'TIMEOUT' &&
      code !== 'SERVER_ERROR'
    ) {
      return false;
    }
    const message: string = (
      err?.info?.error?.message ??
      err?.shortMessage ??
      err?.message ??
      ''
    ).toLowerCase();
    return !(
      message.includes('execution reverted') || message.includes('revert')
    );
  }

  async getGasInfo(gasLimit: bigint, block?: any): Promise<NeoXFeeInfoProp> {
    block =
      block ??
      (await this.provider.send('eth_getBlockByNumber', ['latest', false]));

    // EIP-1559 chains (NeoX) expose baseFeePerGas; only the priority fee is
    // needed on top of it. Fetch just that one extra value instead of also
    // pulling eth_gasPrice, which is only used on the legacy path below.
    if (block.baseFeePerGas !== undefined) {
      const priorityFee = await this.provider.send(
        'eth_maxPriorityFeePerGas',
        []
      );
      const maxPriorityFeePerGas =
        priorityFee != null
          ? new BigNumber(priorityFee)
          : new BigNumber('1000000000');
      const maxFeePerGas = new BigNumber(block.baseFeePerGas).plus(
        maxPriorityFeePerGas
      );
      const estimateGas = maxFeePerGas.times(gasLimit.toString());
      return {
        maxFeePerGas: maxFeePerGas.shiftedBy(-18).toFixed(),
        maxPriorityFeePerGas: maxPriorityFeePerGas.shiftedBy(-18).toFixed(),
        gasLimit: gasLimit.toString(),
        estimateGas: estimateGas.shiftedBy(-18).toFixed(),
      };
    }

    // Legacy chains: gasPrice is the only fee value that matters.
    const gasPrice = new BigNumber(await this.provider.send('eth_gasPrice', []));
    const estimateGas = gasPrice.times(gasLimit.toString());
    return {
      gasPrice: gasPrice.shiftedBy(-18).toFixed(),
      gasLimit: gasLimit.toString(),
      estimateGas: estimateGas.shiftedBy(-18).toFixed(),
    };
  }
}
