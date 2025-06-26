import {
  RpcNetwork,
  abiNeoXBridgeNeo3,
  BridgeNetwork,
  N3MainnetNetwork,
  N3TestnetNetwork,
  BridgeTransactionOnBridge,
  ETH_SOURCE_ASSET_HASH,
  abiERC20,
  GAS3_CONTRACT,
} from '@/app/popup/_lib';
import { AppState } from '@/app/reduers';
import { Asset } from '@/models/models';
import { Injectable } from '@angular/core';
import { Store } from '@ngrx/store';
import { ethers } from 'ethers';
import { map } from 'rxjs/operators';
import { HttpClient } from '@angular/common/http';
import { UtilServiceState } from '../util/util.service';
import BigNumber from 'bignumber.js';
import { sc, wallet } from '@cityofzion/neon-core-neo3/lib';

@Injectable()
export class BridgeState {
  readonly BridgeParams = {
    [BridgeNetwork.MainNet]: {
      n3BridgeContract: '0xbb19cfc864b73159277e1fd39694b3fd5fc613d2',
      bridgeTxHostOnNeo3BridgeNeoX:
        'https://xexplorer.neo.org:8877/api/v1/transactions/deposits',
      neoXBridgeContract: '0x1212000000000000000000000000000000000004',
      bridgeTxHostOnNeoXBridgeNeo3: 'https://neofura.ngd.network/',
    },
    [BridgeNetwork.TestNet]: {
      n3BridgeContract: '0x2ba94444d43c9a084a5660982a9f95f43f07422e',
      bridgeTxHostOnNeo3BridgeNeoX:
        'https://xt4scan.ngd.network:8877/api/v1/transactions/deposits',
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
      this.provider?.destroy();
      const network = new ethers.Network(this.neoXNetwork.name, this.neoXNetwork.chainId);
      this.provider = new ethers.JsonRpcProvider(this.neoXNetwork.rpcUrl, network, {
        staticNetwork: network,
      });
    });
  }

  //#region neo3 => neoX
  getBridgeTxOnNeo3BridgeNeoX(
    depositId: number,
    storageTx: BridgeTransactionOnBridge
  ) {
    let suffixAddress = '';
    if (storageTx.asset.bridgeTargetAssetId) {
      suffixAddress = `/${storageTx.asset.bridgeTargetAssetId}`;
    }
    return this.http.get(
      `${
        this.BridgeParams[storageTx.network].bridgeTxHostOnNeo3BridgeNeoX
      }${suffixAddress}/${depositId}`
    );
  }
  getGasDepositFee(network: BridgeNetwork) {
    const data = {
      jsonrpc: '2.0',
      method: 'invokefunction',
      params: [this.BridgeParams[network].n3BridgeContract, 'nativeDepositFee'],
      id: 1,
    };
    return this.http.post(this.neo3Network.rpcUrl, data).pipe(
      map((res: any) => {
        const fee = this.utilService.handleNeo3StackNumberValue(res.result);
        return new BigNumber(fee).shiftedBy(-8).toFixed();
      })
    );
  }

  getMaxGasDeposit(network: BridgeNetwork) {
    const data = {
      jsonrpc: '2.0',
      method: 'invokefunction',
      params: [this.BridgeParams[network].n3BridgeContract, 'maxNativeDeposit'],
      id: 1,
    };
    return this.http.post(this.neo3Network.rpcUrl, data).pipe(
      map((res: any) => {
        const data = this.utilService.handleNeo3StackNumberValue(res.result);
        return new BigNumber(data).shiftedBy(-8).toFixed();
      })
    );
  }

  getGasBridgeProgress(network: BridgeNetwork) {
    const data = {
      jsonrpc: '2.0',
      method: 'invokefunction',
      params: [this.BridgeParams[network].n3BridgeContract, 'getNativeBridge'],
      id: 1,
    };
    const neo3RPC =
      network === BridgeNetwork.MainNet
        ? N3MainnetNetwork.rpcUrl
        : N3TestnetNetwork.rpcUrl;
    return this.http.post(neo3RPC, data).pipe(
      map((res: any) => {
        res = res.result;
        const value = res.stack?.[0]?.value;
        let used: string;
        let total: string;
        let percentage: string;
        if (res.state === 'HALT') {
          if (value?.[1]) {
            used = this.utilService.handleNeo3StackNumber(value[1]);
            used = new BigNumber(used).shiftedBy(-8).toFixed(0);
          }
          if (value?.[4]?.value?.[4]) {
            total = this.utilService.handleNeo3StackNumber(value[4].value[4]);
            total = new BigNumber(total).shiftedBy(-8).toFixed(0);
          }
        }
        if (used && total) {
          percentage = new BigNumber(used)
            .div(total)
            .shiftedBy(2)
            .toFixed(2, 1);
        }
        return { used, total, percentage };
      })
    );
  }
  //#endregion

  //#region neoX => neo3
  getWithdrawData({
    asset,
    toScriptHash,
    maxFee,
    amount,
  }: {
    asset: Asset;
    toScriptHash: string;
    maxFee: bigint;
    amount: string;
  }) {
    const contract = new ethers.Contract(
      asset.asset_id,
      abiNeoXBridgeNeo3,
      this.provider
    );
    let data;
    if (asset.asset_id === ETH_SOURCE_ASSET_HASH) {
      data = contract.interface.encodeFunctionData('withdrawNative', [
        toScriptHash,
        maxFee,
      ]);
    } else {
      data = contract.interface.encodeFunctionData('withdrawToken', [
        asset.asset_id,
        toScriptHash,
        new BigNumber(amount).shiftedBy(asset.decimals).toFixed(0),
      ]);
    }
    return data;
  }

  getTransactionReceipt(hash: string, rpcUrl: string) {
    const tempProvider = new ethers.JsonRpcProvider(rpcUrl);
    return tempProvider.getTransactionReceipt(hash);
  }

  getBridgeTxOnNeoXBridgeNeo3(
    nonce: number,
    storageTx: BridgeTransactionOnBridge
  ) {
    const data = {
      jsonrpc: '2.0',
      method: 'GetBridgeTxByNonce',
      params: {
        ContractHash: this.BridgeParams[storageTx.network].n3BridgeContract,
        Nonce: nonce,
      },
      id: 1,
    };
    if (storageTx.asset.bridgeTargetAssetId) {
      data.params['TokenHash'] = storageTx.asset.bridgeTargetAssetId;
    }
    return this.http.post(
      this.BridgeParams[storageTx.network].bridgeTxHostOnNeoXBridgeNeo3,
      data
    );
  }

  getAllowance(asset: Asset, address: string, network: BridgeNetwork) {
    const contract = new ethers.Contract(
      asset.asset_id,
      abiERC20,
      this.provider
    );
    const data = contract.interface.encodeFunctionData('allowance', [
      address,
      this.BridgeParams[network].neoXBridgeContract,
    ]);
    return this.provider
      .call({
        to: asset.asset_id,
        data,
      })
      .then((res) => {
        return ethers.formatUnits(res, asset.decimals);
      });
  }
  //#endregion

  getNeoN3TxParams({
    bridgeAsset,
    bridgeAmount,
    fromAddress,
    toAddress,
    bridgeFee,
    currentBridgeNetwork,
  }: {
    bridgeAsset: Asset;
    bridgeAmount: string;
    fromAddress: string;
    toAddress: string;
    bridgeFee: string;
    currentBridgeNetwork: BridgeNetwork;
  }) {
    const tAmount = new BigNumber(bridgeAmount)
      .shiftedBy(bridgeAsset.decimals)
      .toFixed(0, 1);
    const tBridgeFee = new BigNumber(bridgeFee).shiftedBy(8).toFixed(0, 1);

    const invokeArgs = [
      {
        operation: 'depositNative',
        scriptHash: this.BridgeParams[currentBridgeNetwork].n3BridgeContract,
        args: [
          sc.ContractParam.hash160(fromAddress),
          sc.ContractParam.fromJson({
            type: 'Hash160',
            value: toAddress,
          }),
          sc.ContractParam.integer(tAmount),
          sc.ContractParam.integer(tBridgeFee),
        ],
      },
    ];
    const signers = [
      {
        account: wallet.getScriptHashFromAddress(fromAddress),
        allowedContracts: [
          this.BridgeParams[currentBridgeNetwork].n3BridgeContract,
          GAS3_CONTRACT,
        ],
        allowedGroups: [],
        scopes: 16,
      },
    ];

    if (bridgeAsset.asset_id !== GAS3_CONTRACT) {
      invokeArgs[0].operation = 'depositToken';
      invokeArgs[0].args.unshift(
        sc.ContractParam.hash160(bridgeAsset.asset_id)
      );
      signers[0].allowedContracts.push(bridgeAsset.asset_id);
    }

    return { invokeArgs, signers };
  }

  getNeoXTxParams({
    bridgeAsset,
    bridgeAmount,
    fromAddress,
    toAddress,
    bridgeFee,
    currentBridgeNetwork,
  }: {
    bridgeAsset: Asset;
    bridgeAmount: string;
    fromAddress: string;
    toAddress: string;
    bridgeFee: string;
    currentBridgeNetwork: BridgeNetwork;
  }) {
    const value = new BigNumber(bridgeAmount)
      .shiftedBy(bridgeAsset.decimals)
      .toFixed(0, 1);

    const data = this.getWithdrawData({
      asset: bridgeAsset,
      toScriptHash: wallet.getScriptHashFromAddress(toAddress),
      maxFee: ethers.parseUnits(bridgeFee, bridgeAsset.decimals),
      amount: bridgeAmount,
    });

    const txParams = {
      from: fromAddress,
      to: this.BridgeParams[currentBridgeNetwork].neoXBridgeContract,
      value,
      data,
    };
    if (bridgeAsset.asset_id !== ETH_SOURCE_ASSET_HASH) {
      txParams.value = new BigNumber(bridgeFee).shiftedBy(18).toFixed(0);
    }
    return txParams;
  }
}
