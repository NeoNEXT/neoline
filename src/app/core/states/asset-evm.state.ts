import { RpcNetwork } from '@/app/popup/_lib';
import { ETH_SOURCE_ASSET_HASH } from '@/app/popup/_lib/evm';
import { AppState } from '@/app/reduers';
import { Asset } from '@/models/models';
import { Injectable } from '@angular/core';
import { Store } from '@ngrx/store';
import { ethers } from 'ethers';
import Erc20ABI from '@assets/contract-json/ERC20.json';
import BigNumber from 'bignumber.js';

@Injectable()
export class AssetEVMState {
  private neoXNetwork: RpcNetwork;
  provider: ethers.JsonRpcProvider;

  constructor(private store: Store<AppState>) {
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
        Erc20ABI,
        this.provider
      );
      balance = await contract.balanceOf(address);
    }
    return ethers.formatUnits(balance, 0);
  }

  async getNeoXAssetDecimals(contractAddress: string): Promise<number> {
    const contract = new ethers.Contract(
      contractAddress,
      Erc20ABI,
      this.provider
    );
    const decimals = await contract.decimals();
    return ethers.toNumber(decimals);
  }

  async searchNeoXAsset(q: string): Promise<Asset | null> {
    if (!ethers.isAddress(q)) return null;
    const contract = new ethers.Contract(q, Erc20ABI, this.provider);
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

  async getTransferERC20Info({
    asset,
    fromAddress,
    toAddress,
    transferAmount,
  }: {
    asset: Asset;
    fromAddress: string;
    toAddress: string;
    transferAmount: string;
  }): Promise<{
    maxFeePerGas: string;
    maxPriorityFeePerGas: string;
    baseFeePerGas: string;
    gasLimit: string;
    estimateGas: string;
  }> {
    let getGasLimit = Promise.resolve(BigInt(21000));
    if (asset.asset_id !== ETH_SOURCE_ASSET_HASH) {
      getGasLimit = this.provider.estimateGas({
        from: fromAddress,
        to: asset.asset_id,
        data: this.getTransferERC20Data({
          asset,
          toAddress,
          transferAmount,
        }),
      });
    }
    const {
      block: { baseFeePerGas },
      feeData: { maxFeePerGas, maxPriorityFeePerGas },
      gasLimit,
    } = await ethers.resolveProperties({
      block: this.provider.getBlock('latest'),
      feeData: this.provider.getFeeData(),
      gasLimit: getGasLimit,
    });
    const estimateGas = maxFeePerGas * gasLimit;
    return {
      maxFeePerGas: new BigNumber(maxFeePerGas.toString())
        .shiftedBy(-18)
        .toFixed(),
      maxPriorityFeePerGas: new BigNumber(maxPriorityFeePerGas.toString())
        .shiftedBy(-18)
        .toFixed(),
      baseFeePerGas: new BigNumber(baseFeePerGas.toString())
        .shiftedBy(-18)
        .toFixed(),
      gasLimit: gasLimit.toString(),
      estimateGas: new BigNumber(estimateGas.toString())
        .shiftedBy(-18)
        .toFixed(),
    };
  }

  async transferErc20({
    asset,
    toAddress,
    transferAmount,
    maxFeePerGas,
    maxPriorityFeePerGas,
    gasLimit,
    privateKey,
  }: {
    asset: Asset;
    toAddress: string;
    transferAmount: string;
    maxFeePerGas: string;
    maxPriorityFeePerGas: string;
    gasLimit: string;
    privateKey: string;
  }) {
    const newMaxFeePerGas = BigInt(
      new BigNumber(maxFeePerGas).shiftedBy(18).toFixed()
    );
    const newMaxPriorityFeePerGas = BigInt(
      new BigNumber(maxPriorityFeePerGas).shiftedBy(18).toFixed()
    );
    let txRequest: ethers.TransactionRequest;
    if (asset.asset_id === ETH_SOURCE_ASSET_HASH) {
      txRequest = {
        to: toAddress,
        value: ethers.parseUnits(transferAmount, asset.decimals),
        maxFeePerGas: newMaxFeePerGas,
        maxPriorityFeePerGas: newMaxPriorityFeePerGas,
        gasLimit: BigInt(gasLimit),
      };
    } else {
      txRequest = {
        to: asset.asset_id,
        data: this.getTransferERC20Data({
          asset,
          toAddress,
          transferAmount,
        }),
        maxFeePerGas: newMaxFeePerGas,
        maxPriorityFeePerGas: newMaxPriorityFeePerGas,
        gasLimit: BigInt(gasLimit),
      };
    }
    const wallet = new ethers.Wallet(privateKey, this.provider);
    try {
      const tx = await wallet.sendTransaction(txRequest);
      return await this.provider.waitForTransaction(tx.hash);
    } catch (error) {
      throw this.handleEthersError(error);
    }
  }

  //#region private function
  private getTransferERC20Data({
    asset,
    toAddress,
    transferAmount,
  }: {
    asset: Asset;
    toAddress: string;
    transferAmount: string;
  }) {
    const contract = new ethers.Contract(
      asset.asset_id,
      Erc20ABI,
      this.provider
    );
    const data = contract.interface.encodeFunctionData('transfer', [
      toAddress,
      ethers.parseUnits(transferAmount, asset.decimals),
    ]);
    return data;
  }

  private handleEthersError(error) {
    console.log(error);
    const code = error.data.replace('Reverted ', '');
    let reason = ethers.toUtf8String('0x' + code.substr(138));
    console.log('revert reason:', reason);
    const message = error?.info?.error?.message;

    return `Transaction failed: ${message}`;
  }
  //#endregion
}
