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
  ChainType,
} from '@/app/popup/_lib';
import { AppState } from '@/app/reduers';
import { Asset } from '@/models/models';
import { Injectable } from '@angular/core';
import { Store } from '@ngrx/store';
import { ethers } from 'ethers';
import { catchError, map } from 'rxjs/operators';
import { HttpClient } from '@angular/common/http';
import BigNumber from 'bignumber.js';
import { sc, wallet } from '@cityofzion/neon-core-neo3/lib';
import {
  handleNeo3StackNumber,
  handleNeo3StackNumberValue,
} from '../utils/neo';
import { HttpService } from './http.service';
import {
  BridgeParams,
  BRIDGE_ASSET_LIST_URL,
  BRIDGE_TOKENS_MAINNET,
  BRIDGE_TOKENS_TESTNET,
} from '@/app/popup/_lib/bridge';
import { from, Observable, of } from 'rxjs';

@Injectable()
export class BridgeService {
  private neoXNetwork: RpcNetwork;
  private neo3Network: RpcNetwork;
  private provider: ethers.JsonRpcProvider;
  private bridgeAssetList: {
    [network: string]: { neo3: Asset[]; neox: Asset[] };
  } = {
    [BridgeNetwork.MainNet]: undefined,
    [BridgeNetwork.TestNet]: undefined,
  };
  private depositInfo: {
    [network: string]: {
      [assetId: string]: {
        bridgeFee: string;
        minBridge: string;
        maxBridge: string;
      };
    };
  } = {};
  private withdrawInfo: {
    [network: string]: {
      [assetId: string]: {
        bridgeFee: string;
        minBridge: string;
        maxBridge: string;
      };
    };
  } = {};

  constructor(
    private store: Store<AppState>,
    private httpClient: HttpClient,
    private http: HttpService
  ) {
    const account$ = this.store.select('account');
    account$.subscribe((state) => {
      this.neoXNetwork = state.neoXNetworks[state.neoXNetworkIndex];
      this.neo3Network = state.n3Networks[state.n3NetworkIndex];
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

  getBridgeAssetList(network: BridgeNetwork) {
    if (this.bridgeAssetList[network]) {
      return of(this.bridgeAssetList[network]);
    }
    return this.httpClient
      .get<{ neo3: Asset[]; neox: Asset[] }>(BRIDGE_ASSET_LIST_URL[network])
      .pipe(
        catchError(() =>
          of(
            network === BridgeNetwork.MainNet
              ? BRIDGE_TOKENS_MAINNET
              : BRIDGE_TOKENS_TESTNET
          )
        ),
        map((res) => {
          this.bridgeAssetList[network] = res;
          return res;
        })
      );
  }

  getBridgeInfo(
    chain: ChainType,
    network: BridgeNetwork,
    asset: Asset
  ): Observable<{
    bridgeFee: string;
    minBridge: string;
    maxBridge: string;
  }> {
    if (chain === 'Neo3') {
      return this.getDepositInfo(network, asset);
    } else {
      return from(this.getWithdrawInfo(network, asset));
    }
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
    return this.httpClient.get(
      `${
        BridgeParams[storageTx.network].bridgeTxHostOnNeo3BridgeNeoX
      }${suffixAddress}/${depositId}`
    );
  }

  private getDepositInfo(
    network: BridgeNetwork,
    asset: Asset
  ): Observable<{
    bridgeFee: string;
    minBridge: string;
    maxBridge: string;
  }> {
    const assetId = asset.asset_id;
    if (this.depositInfo?.[network]?.[assetId]?.bridgeFee !== undefined) {
      return of(this.depositInfo[network][assetId]);
    }
    const contractParams =
      assetId === GAS3_CONTRACT ? [] : [{ type: 'Hash160', value: assetId }];
    const feeData = {
      jsonrpc: '2.0',
      method: 'invokefunction',
      params: [
        BridgeParams[network].n3BridgeContract,
        assetId === GAS3_CONTRACT ? 'nativeDepositFee' : 'tokenDepositFee',
        contractParams,
      ],
      id: 1,
    };
    const minData = {
      jsonrpc: '2.0',
      method: 'invokefunction',
      params: [
        BridgeParams[network].n3BridgeContract,
        assetId === GAS3_CONTRACT ? 'minNativeDeposit' : 'minTokenDeposit',
        contractParams,
      ],
      id: 1,
    };
    const maxData = {
      jsonrpc: '2.0',
      method: 'invokefunction',
      params: [
        BridgeParams[network].n3BridgeContract,
        assetId === GAS3_CONTRACT ? 'maxNativeDeposit' : 'maxTokenDeposit',
        contractParams,
      ],
      id: 1,
    };
    return this.http
      .rpcPostReturnAllData(this.neo3Network.rpcUrl, [
        feeData,
        minData,
        maxData,
      ])
      .pipe(
        map(([feeRes, minRes, maxRes]) => {
          if (!this.depositInfo[network]) {
            this.depositInfo[network] = {};
          }
          if (!this.depositInfo[network][assetId]) {
            this.depositInfo[network][assetId] = {
              bridgeFee: '',
              minBridge: '',
              maxBridge: '',
            };
          }
          if (feeRes.result) {
            const fee = handleNeo3StackNumberValue(feeRes.result);
            this.depositInfo[network][assetId].bridgeFee = new BigNumber(fee)
              .shiftedBy(-8)
              .toFixed();
          }
          if (minRes.result) {
            const min = handleNeo3StackNumberValue(minRes.result);
            this.depositInfo[network][assetId].minBridge = new BigNumber(min)
              .shiftedBy(-asset.decimals)
              .toFixed();
          }
          if (maxRes.result) {
            const max = handleNeo3StackNumberValue(maxRes.result);
            this.depositInfo[network][assetId].maxBridge = new BigNumber(max)
              .shiftedBy(-asset.decimals)
              .toFixed();
          }
          return this.depositInfo[network][assetId];
        })
      );
  }

  getGasBridgeProgress(network: BridgeNetwork) {
    const data = {
      jsonrpc: '2.0',
      method: 'invokefunction',
      params: [BridgeParams[network].n3BridgeContract, 'getNativeBridge'],
      id: 1,
    };
    const neo3RPC =
      network === BridgeNetwork.MainNet
        ? N3MainnetNetwork.rpcUrl
        : N3TestnetNetwork.rpcUrl;
    return this.http.rpcPost(neo3RPC, data).pipe(
      map((res: any) => {
        const value = res.stack?.[0]?.value;
        let used: string;
        let total: string;
        let percentage: string;
        if (res.state === 'HALT') {
          if (value?.[1]) {
            used = handleNeo3StackNumber(value[1]);
            used = new BigNumber(used).shiftedBy(-8).toFixed(0);
          }
          if (value?.[4]?.value?.[4]) {
            total = handleNeo3StackNumber(value[4].value[4]);
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
    currentBridgeNetwork,
  }: {
    asset: Asset;
    toScriptHash: string;
    maxFee: bigint;
    amount: string;
    currentBridgeNetwork: BridgeNetwork;
  }) {
    const contract = new ethers.Contract(
      BridgeParams[currentBridgeNetwork].neoXBridgeContract,
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

  private getWithdrawInfo(
    network: BridgeNetwork,
    asset: Asset
  ): Promise<{
    bridgeFee: string;
    minBridge: string;
    maxBridge: string;
  }> {
    if (
      this.withdrawInfo?.[network]?.[asset.asset_id]?.bridgeFee !== undefined
    ) {
      return Promise.resolve(this.withdrawInfo[network][asset.asset_id]);
    }
    const contract = new ethers.Contract(
      BridgeParams[network].neoXBridgeContract,
      abiNeoXBridgeNeo3,
      this.provider
    );
    if (!this.withdrawInfo[network]) {
      this.withdrawInfo[network] = {};
    }
    if (!this.withdrawInfo[network][asset.asset_id]) {
      this.withdrawInfo[network][asset.asset_id] = {
        bridgeFee: '',
        minBridge: '',
        maxBridge: '',
      };
    }
    if (asset.asset_id === ETH_SOURCE_ASSET_HASH) {
      return contract.nativeBridge().then((res) => {
        this.withdrawInfo[network][ETH_SOURCE_ASSET_HASH].bridgeFee =
          new BigNumber(res.config.fee).shiftedBy(-18).toFixed();
        this.withdrawInfo[network][ETH_SOURCE_ASSET_HASH].minBridge =
          new BigNumber(res.config.minAmount)
            .shiftedBy(-18)
            .plus(this.withdrawInfo[network][ETH_SOURCE_ASSET_HASH].bridgeFee)
            .toFixed();
        this.withdrawInfo[network][ETH_SOURCE_ASSET_HASH].maxBridge =
          new BigNumber(res.config.maxAmount).shiftedBy(-18).toFixed();
        return this.withdrawInfo[network][ETH_SOURCE_ASSET_HASH];
      });
    } else {
      return contract.tokenBridges(asset.asset_id).then((res) => {
        this.withdrawInfo[network][asset.asset_id].bridgeFee = new BigNumber(
          res.config.fee
        )
          .shiftedBy(-18)
          .toFixed();
        this.withdrawInfo[network][asset.asset_id].minBridge = new BigNumber(
          res.config.minAmount
        )
          .shiftedBy(-asset.decimals)
          .toFixed();
        this.withdrawInfo[network][asset.asset_id].maxBridge = new BigNumber(
          res.config.maxAmount
        )
          .shiftedBy(-asset.decimals)
          .toFixed();
        return this.withdrawInfo[network][asset.asset_id];
      });
    }
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
        ContractHash: BridgeParams[storageTx.network].n3BridgeContract,
        Nonce: nonce,
      },
      id: 1,
    };
    if (storageTx.asset.bridgeTargetAssetId) {
      data.params['TokenHash'] = storageTx.asset.bridgeTargetAssetId;
    }
    return this.httpClient.post(
      BridgeParams[storageTx.network].bridgeTxHostOnNeoXBridgeNeo3,
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
      BridgeParams[network].neoXBridgeContract,
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
        scriptHash: BridgeParams[currentBridgeNetwork].n3BridgeContract,
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
          BridgeParams[currentBridgeNetwork].n3BridgeContract,
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
      currentBridgeNetwork,
    });

    const txParams = {
      from: fromAddress,
      to: BridgeParams[currentBridgeNetwork].neoXBridgeContract,
      value,
      data,
    };
    if (bridgeAsset.asset_id !== ETH_SOURCE_ASSET_HASH) {
      txParams.value = new BigNumber(bridgeFee).shiftedBy(18).toFixed(0);
    }
    return txParams;
  }
}
