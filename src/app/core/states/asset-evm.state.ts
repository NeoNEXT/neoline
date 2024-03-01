import { RpcNetwork } from '@/app/popup/_lib';
import { ETH_SOURCE_ASSET_HASH } from '@/app/popup/_lib/evm';
import { AppState } from '@/app/reduers';
import { Asset } from '@/models/models';
import { Injectable } from '@angular/core';
import { Store } from '@ngrx/store';
import { ethers } from 'ethers';
import Erc20ABI from '@assets/contract-json/ERC20.json';

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
    const contract = new ethers.Contract(
      contractAddress,
      Erc20ABI,
      this.provider
    );
    const balance = await contract.balanceOf(address);
    return ethers.formatUnits(balance, 0);
  }

  async getNeoXAssetDecimals(contractAddress: string): Promise<string> {
    const contract = new ethers.Contract(
      contractAddress,
      Erc20ABI,
      this.provider
    );
    const decimals = await contract.decimals();
    return ethers.formatUnits(decimals, 0);
  }
}
