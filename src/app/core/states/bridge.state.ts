import { RpcNetwork, abiNeoXBridgeNeo3, BridgeNetwork } from '@/app/popup/_lib';
import { AppState } from '@/app/reduers';
import { Asset } from '@/models/models';
import { Injectable } from '@angular/core';
import { Store } from '@ngrx/store';
import { ethers } from 'ethers';
import { map } from 'rxjs/operators';
import { HttpClient } from '@angular/common/http';
import { UtilServiceState } from '../util/util.service';

@Injectable()
export class BridgeState {
  readonly BridgeParams = {
    [BridgeNetwork.MainNet]: {
      n3BridgeContract: '',
      bridgeTxHostOnNeo3BridgeNeoX: '',
      neoXBridgeContract: '',
      bridgeTxHostOnNeoXBridgeNeo3: '',
    },
    [BridgeNetwork.TestNet]: {
      n3BridgeContract: '0x2ba94444d43c9a084a5660982a9f95f43f07422e',
      bridgeTxHostOnNeo3BridgeNeoX: 'https://bridgeapi.banelabs.org/deposits',
      neoXBridgeContract: '0x1212000000000000000000000000000000000004',
      bridgeTxHostOnNeoXBridgeNeo3: 'https://testmagnet.ngd.network/',
    },
  };
  private neoXNetwork: RpcNetwork;
  private neo3Network: RpcNetwork;
  provider: ethers.JsonRpcProvider;

  constructor(
    private store: Store<AppState>,
    private http: HttpClient,
    private utilService: UtilServiceState
  ) {
    const account$ = this.store.select('account');
    account$.subscribe((state) => {
      this.neoXNetwork = state.neoXNetworks[state.neoXNetworkIndex];
      this.neo3Network = state.n3Networks[state.n3NetworkIndex];
      this.provider = new ethers.JsonRpcProvider(this.neoXNetwork.rpcUrl);
    });
  }

  // neo3 => neoX
  getBridgeTxOnNeo3BridgeNeoX(depositId: number, network: BridgeNetwork) {
    return this.http.get(
      `${this.BridgeParams[network].bridgeTxHostOnNeo3BridgeNeoX}/${depositId}`
    );
  }
  getGasDepositFee(network: BridgeNetwork) {
    const data = {
      jsonrpc: '2.0',
      method: 'invokefunction',
      params: [this.BridgeParams[network].n3BridgeContract, 'gasDepositFee'],
      id: 1,
    };
    return this.http.post(this.neo3Network.rpcUrl, data).pipe(
      map((res: any) => {
        return this.utilService.handleNeo3StackNumberValue(res.result);
      })
    );
  }

  getMaxGasDeposit(network: BridgeNetwork) {
    const data = {
      jsonrpc: '2.0',
      method: 'invokefunction',
      params: [this.BridgeParams[network].n3BridgeContract, 'maxGasDeposit'],
      id: 1,
    };
    return this.http.post(this.neo3Network.rpcUrl, data).pipe(
      map((res: any) => {
        return this.utilService.handleNeo3StackNumberValue(res.result);
      })
    );
  }

  //#region neoX => neo3
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
    const data = contract.interface.encodeFunctionData('withdrawGas', [
      toScriptHash,
    ]);
    return data;
  }

  getTransactionReceipt(hash: string, rpcUrl: string) {
    const tempProvider = new ethers.JsonRpcProvider(rpcUrl);
    return tempProvider.getTransactionReceipt(hash);
  }

  getBridgeTxOnNeoXBridgeNeo3(nonce: number, network: BridgeNetwork) {
    const data = {
      jsonrpc: '2.0',
      method: 'GetBridgeTxByNonce',
      params: {
        ContractHash: this.BridgeParams[network].n3BridgeContract,
        Nonce: nonce,
      },
      id: 1,
    };
    return this.http.post(
      this.BridgeParams[network].bridgeTxHostOnNeoXBridgeNeo3,
      data
    );
  }
  //#endregion
}
