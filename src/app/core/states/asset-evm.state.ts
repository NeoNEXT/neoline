import { abiERC20, RpcNetwork } from '@/app/popup/_lib';
import { ETH_SOURCE_ASSET_HASH } from '@/app/popup/_lib/evm';
import { AppState } from '@/app/reduers';
import { Asset } from '@/models/models';
import { Injectable } from '@angular/core';
import { Store } from '@ngrx/store';
import { ethers } from 'ethers';
import BigNumber from 'bignumber.js';
import { NeoXFeeInfoProp } from '@/app/popup/transfer/create/interface';
import { HttpClient } from '@angular/common/http';

@Injectable()
export class AssetEVMState {
  private neoXNetwork: RpcNetwork;
  provider: ethers.JsonRpcProvider;

  constructor(private store: Store<AppState>, private http: HttpClient) {
    const account$ = this.store.select('account');
    account$.subscribe((state) => {
      this.neoXNetwork = state.neoXNetworks[state.neoXNetworkIndex];
      this.provider = new ethers.JsonRpcProvider(this.neoXNetwork.rpcUrl);
    });
  }

  async getNeoXAddressBalances(address: string): Promise<Asset[]> {
    const balance = await this.provider.getBalance(address);
    const assetItem: Asset = {
      balance: ethers.formatEther(balance),
      asset_id: ETH_SOURCE_ASSET_HASH,
      symbol: this.neoXNetwork.symbol,
      decimals: 18,
    };
    return [assetItem];
  }

  async getNeoXAddressAssetBalance(
    address: string,
    contractAddress: string
  ): Promise<string> {
    let balance;
    if (contractAddress === ETH_SOURCE_ASSET_HASH) {
      balance = await this.provider.getBalance(address);
    } else {
      const contract = new ethers.Contract(
        contractAddress,
        abiERC20,
        this.provider
      );
      balance = await contract.balanceOf(address);
    }
    return ethers.formatUnits(balance, 0);
  }

  async getNeoXAssetDecimals(contractAddress: string): Promise<number> {
    const contract = new ethers.Contract(
      contractAddress,
      abiERC20,
      this.provider
    );
    const decimals = await contract.decimals();
    return ethers.toNumber(decimals);
  }

  async searchNeoXAsset(q: string): Promise<Asset | null> {
    if (!ethers.isAddress(q)) return null;
    const contract = new ethers.Contract(q, abiERC20, this.provider);
    const { symbol, name, decimals } = await ethers.resolveProperties({
      symbol: contract.symbol(),
      name: contract.name(),
      decimals: contract.decimals(),
    });
    const asset: Asset = {
      name,
      asset_id: q,
      symbol,
      decimals: ethers.toNumber(decimals),
    };
    return asset;
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
      new BigNumber(transferAmount).shiftedBy(asset.decimals).toFixed(0, 1)
    );
    return this.provider.estimateGas({
      from: fromAddress,
      to: asset.asset_id,
      data: this.getTransferERC20Data({
        asset,
        toAddress,
        transferAmount: amountBN,
      }),
    });
  }

  estimateGas(txParams): Promise<bigint> {
    return this.provider.estimateGas(txParams);
  }

  async getGasInfo(gasLimit: bigint): Promise<NeoXFeeInfoProp> {
    let { block, gasPrice, priorityFee } = await ethers.resolveProperties({
      block: this.provider.send('eth_getBlockByNumber', ['latest', false]),
      gasPrice: this.provider.send('eth_gasPrice', []),
      priorityFee: this.provider.send('eth_maxPriorityFeePerGas', []),
    });

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

  getTransferErc20TxRequest({
    asset,
    toAddress,
    transferAmount,
    maxFeePerGas,
    maxPriorityFeePerGas,
    gasLimit,
    gasPrice,
  }: {
    asset: Asset;
    toAddress: string;
    transferAmount: string;
    maxFeePerGas?: string;
    maxPriorityFeePerGas?: string;
    gasPrice?: string;
    gasLimit: string;
  }): ethers.TransactionRequest {
    const maxFeePerGasBN = maxFeePerGas
      ? BigInt(new BigNumber(maxFeePerGas).shiftedBy(18).toFixed(0, 1))
      : undefined;
    const maxPriorityFeePerGasBN = maxPriorityFeePerGas
      ? BigInt(new BigNumber(maxPriorityFeePerGas).shiftedBy(18).toFixed(0, 1))
      : undefined;
    const gasPriceBN = gasPrice
      ? BigInt(new BigNumber(gasPrice).shiftedBy(18).toFixed(0, 1))
      : undefined;
    const amountBN = BigInt(
      new BigNumber(transferAmount).shiftedBy(asset.decimals).toFixed(0, 1)
    );
    const gasLimitBN = BigInt(new BigNumber(gasLimit).toFixed(0, 1));
    let txRequest: ethers.TransactionRequest;
    if (asset.asset_id === ETH_SOURCE_ASSET_HASH) {
      txRequest = {
        to: toAddress,
        value: amountBN,
        maxFeePerGas: maxFeePerGasBN,
        maxPriorityFeePerGas: maxPriorityFeePerGasBN,
        gasLimit: gasLimitBN,
        gasPrice: gasPriceBN,
      };
    } else {
      txRequest = {
        to: asset.asset_id,
        data: this.getTransferERC20Data({
          asset,
          toAddress,
          transferAmount: amountBN,
        }),
        maxFeePerGas: maxFeePerGasBN,
        maxPriorityFeePerGas: maxPriorityFeePerGasBN,
        gasLimit: gasLimitBN,
        gasPrice: gasPriceBN,
      };
    }
    return txRequest;
  }

  async transferErc20({
    asset,
    toAddress,
    transferAmount,
    maxFeePerGas,
    maxPriorityFeePerGas,
    gasLimit,
    gasPrice,
    privateKey,
  }: {
    asset: Asset;
    toAddress: string;
    transferAmount: string;
    maxFeePerGas?: string;
    maxPriorityFeePerGas?: string;
    gasPrice?: string;
    gasLimit: string;
    privateKey: string;
  }) {
    const txRequest = this.getTransferErc20TxRequest({
      asset,
      toAddress,
      transferAmount,
      maxFeePerGas,
      maxPriorityFeePerGas,
      gasLimit,
      gasPrice,
    });
    const wallet = new ethers.Wallet(privateKey, this.provider);
    try {
      const tx = await wallet.sendTransaction(txRequest);
      return tx;
    } catch (error) {
      throw this.handleEthersError(error);
    }
  }

  async sendDappTransaction(PreExecutionParams, txParams, privateKey: string) {
    try {
      await this.provider.send('eth_call', [PreExecutionParams, 'latest']);
    } catch (error) {
      throw this.handleEthersError(error);
    }
    const wallet = new ethers.Wallet(privateKey, this.provider);
    try {
      const tx = await wallet.sendTransaction(txParams);
      return tx;
    } catch (error) {
      throw this.handleEthersError(error);
    }
  }

  async getNonce(address: string) {
    return await this.provider.send('eth_getTransactionCount', [
      address,
      'latest',
    ]);
  }

  async sendTransactionByRPC(txRequest, PreExecutionParams?) {
    if (PreExecutionParams) {
      try {
        await this.provider.send('eth_call', [PreExecutionParams, 'latest']);
      } catch (error) {
        throw this.handleEthersError(error);
      }
    }
    const serializedTx = ethers.Transaction.from(txRequest).serialized;
    try {
      const tx = await this.provider.send('eth_sendRawTransaction', [
        serializedTx,
      ]);
      return tx;
    } catch (error) {
      throw this.handleEthersError(error);
    }
  }

  async waitForTx(hash: string) {
    try {
      const tx = await this.provider.waitForTransaction(hash);
      const blockTx = await this.provider.send('eth_getBlockByHash', [
        tx.blockHash,
        false,
      ]);
      return { status: tx.status, block_time: blockTx.timestamp };
    } catch (error) {
      throw this.handleEthersError(error);
    }
  }

  //#region private function
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

  handleEthersError(error) {
    console.log(error);
    if (error.data) {
      const code = error.data.replace('Reverted ', '');
      let reason = ethers.toUtf8String('0x' + code.substr(138));
      console.log('revert reason:', reason);
    }
    const message = error?.info?.error?.message;
    return `Transaction failed: ${message}`;
  }
  //#endregion
}
