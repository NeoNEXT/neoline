import { RpcNetwork, abiNeoXBridgeNeo3 } from '@/app/popup/_lib';
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
  readonly bridgeTxContractOnNeo3BridgeNeoX =
    '0x90ea23685148733e830a063d0fd7e41a4357adcc';
  private readonly bridgeTxHostOnNeo3BridgeNeoX =
    'https://bridgeapi.banelabs.org/deposits';

  readonly neoXContractOnNeoXBridgeNeo3 =
    '0x1212000000000000000000000000000000000004';
  private readonly bridgeTxContractOnNeoXBridgeNeo3 =
    '0x90ea23685148733e830a063d0fd7e41a4357adcc';
  private readonly bridgeTxHostOnNeoXBridgeNeo3 =
    'https://testmagnet.ngd.network/';

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
  getBridgeTxOnNeo3BridgeNeoX(depositId: number) {
    return this.http.get(`${this.bridgeTxHostOnNeo3BridgeNeoX}/${depositId}`);
  }
  getGasDepositFee() {
    const data = {
      jsonrpc: '2.0',
      method: 'invokefunction',
      params: [this.bridgeTxContractOnNeo3BridgeNeoX, 'gasDepositFee'],
      id: 1,
    };
    return this.http.post(this.neo3Network.rpcUrl, data).pipe(
      map((res: any) => {
        return this.utilService.handleNeo3StackNumberValue(res.result);
      })
    );
  }

  getMaxGasDeposit() {
    const data = {
      jsonrpc: '2.0',
      method: 'invokefunction',
      params: [this.bridgeTxContractOnNeo3BridgeNeoX, 'maxGasDeposit'],
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

  getTransactionReceipt(hash: string) {
    return this.provider.getTransactionReceipt(hash);
  }

  getBridgeTxOnNeoXBridgeNeo3(nonce: number) {
    const data = {
      jsonrpc: '2.0',
      method: 'GetBridgeTxByNonce',
      params: {
        ContractHash: this.bridgeTxContractOnNeoXBridgeNeo3,
        Nonce: nonce,
      },
      id: 1,
    };
    return this.http.post(this.bridgeTxHostOnNeoXBridgeNeo3, data);
  }
  //#endregion
}
