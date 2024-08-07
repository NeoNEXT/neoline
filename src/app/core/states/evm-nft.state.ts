import { RpcNetwork, abiERC1155, abiERC721 } from '@/app/popup/_lib';
import { AppState } from '@/app/reduers';
import { Injectable } from '@angular/core';
import { Store } from '@ngrx/store';
import { ethers } from 'ethers';
import type BN from 'bn.js';
import { HttpClient } from '@angular/common/http';
import { DappEVMState } from './dapp-evm.state';
import { NftAsset, NftToken } from '@/models/models';
import BigNumber from 'bignumber.js';
import { AssetEVMState } from './asset-evm.state';

@Injectable()
export class EvmNFTState {
  private neoXNetwork: RpcNetwork;
  provider: ethers.JsonRpcProvider;

  constructor(
    private store: Store<AppState>,
    private http: HttpClient,
    private assetEVMState: AssetEVMState,
    private dappEVMState: DappEVMState
  ) {
    const account$ = this.store.select('account');
    account$.subscribe((state) => {
      this.neoXNetwork = state.neoXNetworks[state.neoXNetworkIndex];
      this.provider = new ethers.JsonRpcProvider(this.neoXNetwork.rpcUrl);
    });
  }

  getTransferTxRequest({
    asset,
    token,
    fromAddress,
    toAddress,
    maxFeePerGas,
    maxPriorityFeePerGas,
    gasLimit,
    gasPrice,
  }: {
    asset: NftAsset;
    token: NftToken;
    fromAddress: string;
    toAddress: string;
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
    const gasLimitBN = BigInt(new BigNumber(gasLimit).toFixed(0, 1));
    let txRequest: ethers.TransactionRequest;
    txRequest = {
      to: asset.assethash,
      data: this.getTransferData({ asset, token, fromAddress, toAddress }),
      maxFeePerGas: maxFeePerGasBN,
      maxPriorityFeePerGas: maxPriorityFeePerGasBN,
      gasLimit: gasLimitBN,
      gasPrice: gasPriceBN,
    };
    return txRequest;
  }

  async transferNFT({
    asset,
    token,
    fromAddress,
    toAddress,
    maxFeePerGas,
    maxPriorityFeePerGas,
    gasLimit,
    gasPrice,
    privateKey,
    nonce,
  }: {
    asset: NftAsset;
    token: NftToken;
    fromAddress: string;
    toAddress: string;
    maxFeePerGas?: string;
    maxPriorityFeePerGas?: string;
    gasPrice?: string;
    gasLimit: string;
    privateKey: string;
    nonce: number;
  }) {
    const txRequest = this.getTransferTxRequest({
      asset,
      token,
      fromAddress,
      toAddress,
      maxFeePerGas,
      maxPriorityFeePerGas,
      gasLimit,
      gasPrice,
    });
    txRequest.nonce = nonce;
    const wallet = new ethers.Wallet(privateKey, this.provider);
    try {
      const tx = await wallet.sendTransaction(txRequest);
      return tx;
    } catch (error) {
      throw this.assetEVMState.handleEthersError(error);
    }
  }

  async estimateGasOfTransfer({
    asset,
    token,
    fromAddress,
    toAddress,
  }: {
    asset: NftAsset;
    token: NftToken;
    fromAddress: string;
    toAddress: string;
  }): Promise<bigint> {
    return this.provider.estimateGas({
      from: fromAddress,
      to: asset.assethash,
      data: this.getTransferData({ asset, token, fromAddress, toAddress }),
    });
  }

  getTransferData({
    asset,
    token,
    fromAddress,
    toAddress,
  }: {
    asset: NftAsset;
    token: NftToken;
    fromAddress: string;
    toAddress: string;
  }) {
    if (asset.standard === 'ERC721') {
      const contract = new ethers.Contract(
        asset.assethash,
        abiERC721,
        this.provider
      );
      const data = contract.interface.encodeFunctionData('transferFrom', [
        fromAddress,
        toAddress,
        token.tokenid,
      ]);
      return data;
    } else {
      const contract = new ethers.Contract(
        asset.assethash,
        abiERC1155,
        this.provider
      );
      const data = contract.interface.encodeFunctionData('TransferSingle', [
        asset.assethash,
        fromAddress,
        toAddress,
        token.tokenid,
        '1',
      ]);
      return data;
    }
  }

  async watchNft(tokenAddress: string, tokenId: string, userAddress: string) {
    await this.validateWatchNft(tokenAddress, tokenId, userAddress);

    const nftMetadata = await this.dappEVMState.getNFTTokenStandardAndDetails(
      tokenAddress,
      userAddress,
      tokenId
    );
    return nftMetadata;
  }

  private async validateWatchNft(
    tokenAddress: string,
    tokenId: string,
    userAddress: string
  ) {
    if (!ethers.isAddress(tokenAddress)) {
      throw new Error('Invalid address');
    }

    if (!/^\d+$/u.test(tokenId)) {
      throw new Error('Invalid tokenId');
    }

    // Check if the user owns the suggested NFT
    try {
      const isOwner = await this.isNftOwner(userAddress, tokenAddress, tokenId);
      if (!isOwner) {
        throw new Error('Suggested NFT is not owned by the selected account');
      }
    } catch (error) {
      // error thrown here: "Unable to verify ownership. Possibly because the standard is not supported or the user's currently selected network does not match the chain of the asset in question."
      if (error instanceof Error) {
        throw new Error(error.message);
      }
      throw error;
    }
  }

  /**
   * Checks the ownership of a ERC-721 or ERC-1155 NFT for a given address.
   *
   * @param ownerAddress - User public address.
   * @param nftAddress - NFT contract address.
   * @param tokenId - NFT token ID.
   * @param options - Options bag.
   * @param options.networkClientId - The networkClientId that can be used to identify the network client to use for this request.
   * @returns Promise resolving the NFT ownership.
   */
  async isNftOwner(
    ownerAddress: string,
    nftAddress: string,
    tokenId: string,
    standard?: 'ERC721' | 'ERC1155' | string,
  ): Promise<boolean> {
    // Checks the ownership for ERC-721.
    try {
      if (!standard || standard === 'ERC721') {
        const owner = await this.getERC721OwnerOf(nftAddress, tokenId);
        return ownerAddress.toLowerCase() === owner.toLowerCase();
      }
      // eslint-disable-next-line no-empty
    } catch {
      // Ignore ERC-721 contract error
    }

    // Checks the ownership for ERC-1155.
    try {
      if (!standard || standard === 'ERC1155') {
        const balance = await this.getERC1155BalanceOf(
          ownerAddress,
          nftAddress,
          tokenId
        );
        return !balance.isZero();
      }
      // eslint-disable-next-line no-empty
    } catch {
      // Ignore ERC-1155 contract error
    }

    throw new Error(
      `Unable to verify ownership. Possibly because the standard is not supported or the user's currently selected network does not match the chain of the asset in question.`
    );
  }

  /**
   * Query for owner for a given ERC721 asset.
   *
   * @param address - ERC721 asset contract address.
   * @param tokenId - ERC721 asset identifier.
   * @param networkClientId - Network Client ID to fetch the provider with.
   * @returns Promise resolving to the owner address.
   */
  private async getERC721OwnerOf(
    address: string,
    tokenId: string
  ): Promise<string> {
    const contract = new ethers.Contract(address, abiERC721, this.provider);
    return contract.ownerOf(tokenId);
  }

  /**
   * Query for balance of a given ERC 1155 token.
   *
   * @param userAddress - Wallet public address.
   * @param nftAddress - ERC1155 asset contract address.
   * @param nftId - ERC1155 asset identifier.
   * @param networkClientId - Network Client ID to fetch the provider with.
   * @returns Promise resolving to the 'balanceOf'.
   */
  private async getERC1155BalanceOf(
    userAddress: string,
    nftAddress: string,
    nftId: string
  ): Promise<BN> {
    const contract = new ethers.Contract(nftAddress, abiERC1155, this.provider);
    return contract.balanceOf(userAddress, nftId);
  }
}
