import { RpcNetwork, abiNeoXBridgeNeo3 } from '@/app/popup/_lib';
import { AppState } from '@/app/reduers';
import { Asset } from '@/models/models';
import { Injectable } from '@angular/core';
import { Store } from '@ngrx/store';
import { ethers } from 'ethers';
import { HttpClient } from '@angular/common/http';
import BigNumber from 'bignumber.js';

@Injectable()
export class BridgeState {
  private neoXNetwork: RpcNetwork;
  provider: ethers.JsonRpcProvider;
  private bridgeTxHost = 'https://testmagnet.ngd.network/';

  constructor(private store: Store<AppState>, private http: HttpClient) {
    const account$ = this.store.select('account');
    account$.subscribe((state) => {
      this.neoXNetwork = state.neoXNetworks[state.neoXNetworkIndex];
      this.provider = new ethers.JsonRpcProvider(this.neoXNetwork.rpcUrl);
    });
  }

  getWithdrawData({
    asset,
    toScriptHash,
  }: {
    asset: Asset;
    toScriptHash: string;
  }) {
    const contract = new ethers.Contract(
      asset.asset_id,
      abiNeoXBridgeNeo3,
      this.provider
    );
    const data = contract.interface.encodeFunctionData('withdraw', [
      toScriptHash,
    ]);
    return data;
  }

  getTransactionReceipt(hash: string) {
    return this.provider.getTransactionReceipt(hash);
  }

  getWithdrawNonce({
    asset,
    topics,
    data,
  }: {
    asset: Asset;
    topics: readonly string[];
    data: string;
  }): number {
    const contract = new ethers.Contract(
      asset.asset_id,
      abiNeoXBridgeNeo3,
      this.provider
    );

    const decodeRes = contract.interface.parseLog({ data, topics });

    return new BigNumber(decodeRes.args[0].toString()).toNumber();
  }

  getBridgeTxByNonce(nonce: number) {
    const data = {
      jsonrpc: '2.0',
      method: 'GetBridgeTxByNonce',
      params: {
        ContractHash: '0x90ea23685148733e830a063d0fd7e41a4357adcc',
        Nonce: nonce,
      },
      id: 1,
    };
    return this.http.post(this.bridgeTxHost, data);
  }
}
