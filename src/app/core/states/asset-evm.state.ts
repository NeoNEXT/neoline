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
      new BigNumber(transferAmount)
        .shiftedBy(Number(asset.decimals))
        .toFixed(0, 1)
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
    const newParams = {
      from: txParams.from,
      to: txParams.to,
      value: txParams.value,
      data: txParams.data,
    };
    return this.provider.estimateGas(newParams);
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

  getBigIntValue(value: string, decimals = 18) {
    return value
      ? BigInt(new BigNumber(value).shiftedBy(decimals).toFixed(0, 1))
      : undefined;
  }
  private getHexValue(value: string | number, decimals = 18) {
    return value
      ? '0x' + new BigNumber(value).shiftedBy(decimals).toString(16)
      : undefined;
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
      throw await this.handleEthersError(error);
    }
    const wallet = new ethers.Wallet(privateKey, this.provider);
    try {
      const tx = await wallet.sendTransaction(txParams);
      return tx;
    } catch (error) {
      throw await this.handleEthersError(error);
    }
  }

  async getNonceInfo(address: string): Promise<AddressNonceInfo> {
    let { pending, latest } = await ethers.resolveProperties({
      pending: this.provider.send('eth_getTransactionCount', [
        address,
        'pending',
      ]),
      latest: this.provider.send('eth_getTransactionCount', [
        address,
        'latest',
      ]),
    });
    pending = Number(pending);
    latest = Number(latest);
    return { nonce: pending, pendingTxs: pending - latest };
  }

  async sendTransactionByRPC(txRequest, PreExecutionParams?) {
    if (PreExecutionParams) {
      try {
        await this.provider.send('eth_call', [PreExecutionParams, 'latest']);
      } catch (error) {
        throw await this.handleEthersError(error);
      }
    }
    const serializedTx = ethers.Transaction.from(txRequest).serialized;
    try {
      const tx = await this.provider.send('eth_sendRawTransaction', [
        serializedTx,
      ]);
      return tx;
    } catch (error) {
      throw await this.handleEthersError(error);
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
        throw await this.handleEthersError(error);
      }
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

  async handleEthersError(err) {
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
  //#endregion
}
