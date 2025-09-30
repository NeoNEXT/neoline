import {
  abiERC20,
  AddressNonceInfo,
  EvmTransactionParams,
  RpcNetwork,
} from '@/app/popup/_lib';
import { ETH_SOURCE_ASSET_HASH } from '@/app/popup/_lib/evm';
import { AppState } from '@/app/reduers';
import { Asset, TransactionStatus } from '@/models/models';
import { Injectable } from '@angular/core';
import { Store } from '@ngrx/store';
import { ethers } from 'ethers';
import BigNumber from 'bignumber.js';
import { NeoXFeeInfoProp } from '@/app/popup/transfer/create/interface';

@Injectable()
export class EvmTxService {
  private neoXNetwork: RpcNetwork;
  private provider: ethers.JsonRpcProvider;

  constructor(private store: Store<AppState>) {
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
  getTxParams(
    txParams: Omit<EvmTransactionParams, 'type'>,
    neoXFeeInfo: Omit<NeoXFeeInfoProp, 'estimateGas'>,
    nonce: number,
    from: string
  ) {
    const { maxFeePerGas, maxPriorityFeePerGas, gasLimit, gasPrice } =
      neoXFeeInfo;

    const newParams = {
      ...txParams,
      maxFeePerGas: this.getBigIntValue(maxFeePerGas),
      maxPriorityFeePerGas: this.getBigIntValue(maxPriorityFeePerGas),
      gasPrice: this.getBigIntValue(gasPrice),
      gasLimit: this.getBigIntValue(gasLimit, 0),
      value: this.getBigIntValue(txParams.value, 0),
      nonce: nonce,
    };
    const PreExecutionParams = {
      // ...txParams,
      to: txParams.to,
      data: txParams.data,
      from,
      // maxFeePerGas: this.getHexValue(maxFeePerGas),
      // maxPriorityFeePerGas: this.getHexValue(maxPriorityFeePerGas),
      // gasPrice: this.getHexValue(gasPrice),
      // gas: this.getHexValue(gasLimit, 0),
      value: this.getHexValue(txParams.value, 0),
      nonce: this.getHexValue(nonce, 0),
    };

    return { PreExecutionParams, newParams };
  }

  getTransferErc20TxRequest({
    asset,
    toAddress,
    transferAmount,
    maxFeePerGas,
    maxPriorityFeePerGas,
    gasLimit,
    gasPrice,
    nonce,
    fromAddress,
  }: {
    asset: Asset;
    toAddress: string;
    transferAmount: string;
    maxFeePerGas?: string;
    maxPriorityFeePerGas?: string;
    gasPrice?: string;
    gasLimit: string;
    nonce: number;
    fromAddress: string;
  }) {
    let txParams;
    const value = new BigNumber(transferAmount)
      .shiftedBy(asset.decimals)
      .toFixed(0, 1);
    if (asset.asset_id === ETH_SOURCE_ASSET_HASH) {
      txParams = { to: toAddress, value };
    } else {
      txParams = {
        to: asset.asset_id,
        data: this.getTransferERC20Data({
          asset,
          toAddress,
          transferAmount: this.getBigIntValue(value, 0),
        }),
      };
    }
    const neoXFeeInfo = {
      maxFeePerGas,
      maxPriorityFeePerGas,
      gasLimit,
      gasPrice,
    };
    return this.getTxParams(txParams, neoXFeeInfo, nonce, fromAddress);
  }

  async sendDappTransaction(PreExecutionParams, txParams, privateKey: string) {
    try {
      await this.provider.send('eth_call', [PreExecutionParams, 'latest']);
    } catch (error) {
      throw await this.handleEthersTxError(error);
    }
    const wallet = new ethers.Wallet(privateKey, this.provider);
    try {
      const tx = await wallet.sendTransaction(txParams);
      return tx;
    } catch (error) {
      throw await this.handleEthersTxError(error);
    }
  }

  async getNonceInfo(address: string): Promise<AddressNonceInfo> {
    let pending = await this.provider.send('eth_getTransactionCount', [
      address,
      'pending',
    ]);
    let latest = await this.provider.send('eth_getTransactionCount', [
      address,
      'latest',
    ]);
    pending = Number(pending);
    latest = Number(latest);
    return { nonce: pending, pendingTxs: pending - latest };
  }

  async sendTransactionByRPC(txRequest, PreExecutionParams?) {
    if (PreExecutionParams) {
      try {
        await this.provider.send('eth_call', [PreExecutionParams, 'latest']);
      } catch (error) {
        throw await this.handleEthersTxError(error);
      }
    }
    const serializedTx = ethers.Transaction.from(txRequest).serialized;
    try {
      const tx = await this.provider.send('eth_sendRawTransaction', [
        serializedTx,
      ]);
      return tx;
    } catch (error) {
      throw await this.handleEthersTxError(error);
    }
  }

  removeWaitTxListen() {
    this.provider.off('block');
    // this.provider.removeAllListeners();
  }

  async waitForTx(hash: string) {
    try {
      const tx = await this.provider.waitForTransaction(hash, 1, 600000);
      const blockTx = await this.provider.send('eth_getBlockByHash', [
        tx.blockHash,
        false,
      ]);
      return { status: tx.status, block_time: blockTx.timestamp };
    } catch {
      const hashTx = await this.provider.getTransaction(hash);
      if (hashTx === null) {
        return {
          status: TransactionStatus.Dropped,
          block_time: Math.floor(new Date().getTime() / 1000),
        };
      }
      try {
        const tx = await this.provider.waitForTransaction(hash);
        const blockTx = await this.provider.send('eth_getBlockByHash', [
          tx.blockHash,
          false,
        ]);
        return { status: tx.status, block_time: blockTx.timestamp };
      } catch (error) {
        throw await this.handleEthersTxError(error);
      }
    }
  }

  getTransferERC20Data({
    asset,
    toAddress,
    transferAmount,
  }: {
    asset: Asset;
    toAddress: string;
    transferAmount: BigInt;
  }) {
    const contract = new ethers.Contract(
      asset.asset_id,
      abiERC20,
      this.provider
    );
    const data = contract.interface.encodeFunctionData('transfer', [
      toAddress,
      transferAmount,
    ]);
    return data;
  }

  getApproveERC20Data({
    assetAddress,
    toAddress,
    approveAmount,
  }: {
    assetAddress: string;
    toAddress: string;
    approveAmount: BigInt;
  }) {
    const contract = new ethers.Contract(assetAddress, abiERC20, this.provider);
    const data = contract.interface.encodeFunctionData('approve', [
      toAddress,
      approveAmount,
    ]);
    return data;
  }

  //#region private function
  private async handleEthersTxError(err) {
    const message: string = err?.info?.error?.message ?? err?.error?.message;
    if (
      typeof message === 'string' &&
      message.toLowerCase().includes('transaction underpriced')
    ) {
      return 'Transaction underpriced';
    }
    return typeof message === 'string'
      ? `Transaction failed: ${message}`
      : 'Transaction failed';
  }
  private getBigIntValue(value: string, decimals = 18) {
    return value
      ? BigInt(new BigNumber(value).shiftedBy(decimals).toFixed(0, 1))
      : undefined;
  }
  private getHexValue(value: string | number, decimals = 18) {
    return value
      ? '0x' + new BigNumber(value).shiftedBy(decimals).toString(16)
      : undefined;
  }
  //#endregion
}
