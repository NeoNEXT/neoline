import { RpcNetwork } from '@/app/popup/_lib';
import { ETH_SOURCE_ASSET_HASH } from '@/app/popup/_lib/evm';
import { AppState } from '@/app/reduers';
import { Asset } from '@/models/models';
import { Injectable } from '@angular/core';
import { Store } from '@ngrx/store';
import { ethers } from 'ethers';
import BigNumber from 'bignumber.js';
import { NeoXFeeInfoProp } from '@/app/popup/transfer/create/interface';
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

  async estimateGasOfTransfer({
    asset,
    fromAddress,
    toAddress,
    transferAmount,
  }: {
    asset: Asset;
    fromAddress: string;
    toAddress: string;
    transferAmount: string;
  }): Promise<bigint> {
    if (asset.asset_id === ETH_SOURCE_ASSET_HASH) {
      return Promise.resolve(BigInt(21000));
    }
    const amountBN = BigInt(
      new BigNumber(transferAmount)
        .shiftedBy(Number(asset.decimals))
        .toFixed(0, 1)
    );
    return this.provider.estimateGas({
      from: fromAddress,
      to: asset.asset_id,
      data: this.evmTxService.getTransferERC20Data({
        asset,
        toAddress,
        transferAmount: amountBN,
      }),
    });
  }

  estimateGas(txParams): Promise<bigint> {
    const newParams = {
      from: txParams.from,
      to: txParams.to,
      value: txParams.value,
      data: txParams.data,
    };
    return this.provider.estimateGas(newParams);
  }

  async getGasInfo(gasLimit: bigint): Promise<NeoXFeeInfoProp> {
    const block = await this.provider.send('eth_getBlockByNumber', [
      'latest',
      false,
    ]);

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
