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
    let block = await this.provider.send('eth_getBlockByNumber', [
      'latest',
      false,
    ]);
    let gasPrice = await this.provider.send('eth_gasPrice', []);
    let priorityFee = await this.provider.send('eth_maxPriorityFeePerGas', []);

    gasPrice = new BigNumber(gasPrice);
    priorityFee = new BigNumber(priorityFee);

    let maxFeePerGas: null | BigNumber = null;
    let maxPriorityFeePerGas: null | BigNumber = null;
    if (block.baseFeePerGas !== undefined) {
      maxPriorityFeePerGas =
        priorityFee != null ? priorityFee : new BigNumber('1000000000');
      maxFeePerGas = new BigNumber(block.baseFeePerGas).plus(
        maxPriorityFeePerGas
      );
      const estimateGas = new BigNumber(maxFeePerGas).times(
        gasLimit.toString()
      );
      return {
        maxFeePerGas: maxFeePerGas
          ? maxFeePerGas.shiftedBy(-18).toFixed()
          : undefined,
        maxPriorityFeePerGas: maxPriorityFeePerGas
          ? maxPriorityFeePerGas.shiftedBy(-18).toFixed()
          : undefined,
        gasLimit: gasLimit.toString(),
        estimateGas: estimateGas.shiftedBy(-18).toFixed(),
      };
    }

    const estimateGas = new BigNumber(gasPrice).times(gasLimit.toString());
    return {
      gasPrice: gasPrice ? gasPrice.shiftedBy(-18).toFixed() : undefined,
      gasLimit: gasLimit.toString(),
      estimateGas: estimateGas.shiftedBy(-18).toFixed(),
    };
  }
}
