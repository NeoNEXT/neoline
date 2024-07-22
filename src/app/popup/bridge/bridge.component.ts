import {
  AssetEVMState,
  AssetState,
  GlobalService,
  NotificationService,
  BridgeState,
  TransactionState,
  ChromeService,
} from '@/app/core';
import { Asset } from '@/models/models';
import { Component, OnDestroy, OnInit } from '@angular/core';
import {
  BridgeTransactionItem,
  ChainType,
  DEFAULT_N3_RPC_NETWORK,
  EvmTransactionParams,
  GAS3_CONTRACT,
  RpcNetwork,
  STORAGE_NAME,
} from '../_lib';
import {
  DEFAULT_NEOX_RPC_NETWORK,
  ETH_SOURCE_ASSET_HASH,
  EvmWalletJSON,
  NeoXTestNetChainId,
} from '../_lib/evm';
import { Unsubscribable, map } from 'rxjs';
import { Store } from '@ngrx/store';
import { AppState } from '@/app/reduers';
import { sc, wallet } from '@cityofzion/neon-core-neo3/lib';
import { Wallet as Wallet3 } from '@cityofzion/neon-core-neo3/lib/wallet';
import { Wallet as Wallet2 } from '@cityofzion/neon-core/lib/wallet';
import BigNumber from 'bignumber.js';
import { Neo3InvokeService } from '../transfer/neo3-invoke.service';
import { SignerLike, Transaction } from '@cityofzion/neon-core-neo3/lib/tx';
import { ContractCall } from '@cityofzion/neon-core-neo3/lib/sc';
import { NeoXFeeInfoProp } from '../transfer/create/interface';
import { interval } from 'rxjs';
import { MatDialog, MatDialogRef } from '@angular/material/dialog';
import {
  PopupBridgeProgressDialogComponent,
  PopupSelectAddressDialogComponent,
} from '../_dialogs';

const NeoN3GasAsset: Asset = {
  asset_id: GAS3_CONTRACT,
  decimals: 8,
  symbol: 'GAS',
};
const NeoXGasAsset: Asset = {
  asset_id: ETH_SOURCE_ASSET_HASH,
  decimals: 18,
  symbol: 'GAS',
};

const DEFAULT_NEO3_ADDRESS = 'NfuwpaQ1A2xaeVbxWe8FRtaRgaMa8yF3YM';
const DEFAULT_NEOX_ADDRESS = '0x1212000000000000000000000000000000000004';
const MIN_BRIDGE_AMOUNT = 1;

@Component({
  templateUrl: 'bridge.component.html',
  styleUrls: ['bridge.component.scss'],
})
export class PopupBridgeComponent implements OnInit, OnDestroy {
  showConfirmPage = false;
  keepDecimals = 8;

  bridgeAsset: Asset;
  bridgeAmount: string;
  fromChain: string;
  toChain: string;
  toAddress: string;
  bridgeFee = '0.1';
  minBridgeAmount = '1.1';

  getSourceTxReceiptInterval;
  getTargetTxReceiptInterval;
  loading = false;
  bridgeProgressDialogRef: MatDialogRef<PopupBridgeProgressDialogComponent>;
  sessionTx: BridgeTransactionItem;

  // neo3
  networkFee: string;
  networkFeeWithoutPriorityFee: string;
  systemFee: string;
  unSignedTx: Transaction;
  priorityFee = '0.0001';
  invokeArgs: ContractCall[];
  signers: SignerLike[];
  maxGasDeposit: string;

  // neoX
  neoXFeeInfo: NeoXFeeInfoProp;
  txParams: EvmTransactionParams;

  private accountSub: Unsubscribable;
  private currentWallet: Wallet2 | Wallet3 | EvmWalletJSON;
  chainType: ChainType;
  n3Network: RpcNetwork;
  neoXNetwork: RpcNetwork;
  neo3WalletArr: Wallet3[];
  neoXWalletArr: EvmWalletJSON[];
  constructor(
    private assetState: AssetState,
    private assetEVMState: AssetEVMState,
    private neo3Invoke: Neo3InvokeService,
    private globalService: GlobalService,
    public notification: NotificationService,
    private bridgeState: BridgeState,
    private transactionState: TransactionState,
    private dialog: MatDialog,
    private chrome: ChromeService,
    private store: Store<AppState>
  ) {
    const account$ = this.store.select('account');
    this.accountSub = account$.subscribe((state) => {
      this.currentWallet = state.currentWallet;
      this.chainType = state.currentChainType;
      this.n3Network = state.n3Networks[state.n3NetworkIndex];
      this.neoXNetwork = state.neoXNetworks[state.neoXNetworkIndex];
      this.neo3WalletArr = state.neo3WalletArr;
      this.neoXWalletArr = state.neoXWalletArr;
      this.initData();
    });
  }

  ngOnInit(): void {
    this.chrome
      .getStorage(STORAGE_NAME.bridgeTransaction)
      .subscribe((tx: BridgeTransactionItem[]) => {
        if (tx.length > 0) {
          this.sessionTx = tx[0];
          if (!tx[0].sourceTxID || !tx[0].targetTxID) {
            if (tx[0].sourceChainType === 'Neo3') {
              this.waitNeo3SourceTxComplete(tx[0].txId);
            }
            if (tx[0].sourceChainType === 'NeoX') {
              this.waitNeoXSourceTxComplete(tx[0].txId);
            }
          }
        }
      });
  }

  ngOnDestroy(): void {
    this.accountSub?.unsubscribe();
    this.getSourceTxReceiptInterval?.unsubscribe();
    this.getTargetTxReceiptInterval?.unsubscribe();
  }

  private async initData() {
    if (this.chainType === 'Neo3') {
      this.fromChain = 'Neo N3';
      this.toChain = 'Neo X';
      this.bridgeAsset = NeoN3GasAsset;
      // bridge fee
      this.bridgeState.getGasDepositFee().subscribe((res) => {
        if (res) {
          this.bridgeFee = new BigNumber(res)
            .shiftedBy(-NeoN3GasAsset.decimals)
            .toFixed();
          this.minBridgeAmount = new BigNumber(this.bridgeFee)
            .plus(MIN_BRIDGE_AMOUNT)
            .toFixed();
        }
      });
      // max deposit fee
      this.bridgeState.getMaxGasDeposit().subscribe((res) => {
        if (res) {
          this.maxGasDeposit = new BigNumber(res)
            .shiftedBy(-NeoN3GasAsset.decimals)
            .toFixed();
        }
      });

      this.calculateNeoN3Fee().subscribe(() => {});
    }
    if (this.chainType === 'NeoX') {
      this.fromChain = 'Neo X';
      this.toChain = 'Neo N3';
      this.bridgeAsset = NeoXGasAsset;

      await this.calculateNeoXFee();
    }
    // balance
    const balance = await this.assetState.getAddressAssetBalance(
      this.currentWallet.accounts[0].address,
      this.bridgeAsset.asset_id,
      this.chainType
    );
    this.bridgeAsset.balance = new BigNumber(balance)
      .shiftedBy(-this.bridgeAsset.decimals)
      .toFixed();
  }

  getAssetRate() {
    const value = new BigNumber(this.bridgeAmount);
    if (!isNaN(Number(this.bridgeAmount)) && value.comparedTo(0) > 0) {
      this.assetState
        .getAssetRate(this.bridgeAsset.symbol, this.bridgeAsset.asset_id)
        .then((rate) => {
          if (rate) {
            this.bridgeAsset.rateBalance =
              value.times(rate || 0).toFixed(2) || '0';
          } else {
            this.bridgeAsset.rateBalance = undefined;
          }
        });
    } else {
      this.bridgeAsset.rateBalance = undefined;
    }
  }

  getActualReceive() {
    if (
      this.bridgeAmount &&
      new BigNumber(this.bridgeAmount).comparedTo(this.minBridgeAmount) >= 0
    ) {
      return new BigNumber(this.bridgeAmount)
        .minus(this.bridgeFee)
        .dp(8, 1)
        .toFixed();
    }
    return '-';
  }

  private async calculateNeoXFee() {
    const value = new BigNumber(this.bridgeAmount ?? this.minBridgeAmount)
      .shiftedBy(this.bridgeAsset.decimals)
      .toFixed(0, 1);

    const data = this.bridgeState.getWithdrawData({
      asset: NeoXGasAsset,
      toScriptHash: wallet.getScriptHashFromAddress(
        this.toAddress ?? DEFAULT_NEO3_ADDRESS
      ),
    });

    let networkGasLimit: bigint;
    this.txParams = {
      from: this.currentWallet.accounts[0].address,
      to: this.bridgeState.neoXContractOnNeoXBridgeNeo3,
      value,
      data,
    };
    try {
      networkGasLimit = await this.assetEVMState.estimateGas(this.txParams);
    } catch {
      networkGasLimit = BigInt(42750000);
    }
    this.neoXFeeInfo = await this.assetEVMState.getGasInfo(networkGasLimit);
    console.log(this.neoXFeeInfo);
  }

  private calculateNeoN3Fee() {
    const fromAddress = this.currentWallet.accounts[0].address;

    const tAmount = new BigNumber(this.bridgeAmount ?? this.minBridgeAmount)
      .shiftedBy(this.bridgeAsset.decimals)
      .toFixed(0, 1);

    const tBridgeFee = new BigNumber(this.bridgeFee)
      .shiftedBy(NeoN3GasAsset.decimals)
      .toFixed(0, 1);

    this.invokeArgs = [
      {
        operation: 'depositGas',
        scriptHash: this.bridgeState.bridgeTxContractOnNeo3BridgeNeoX,
        args: [
          sc.ContractParam.hash160(fromAddress),
          sc.ContractParam.fromJson({
            type: 'Hash160',
            value: this.toAddress ?? DEFAULT_NEOX_ADDRESS,
          }),
          sc.ContractParam.integer(tAmount),
          sc.ContractParam.integer(tBridgeFee),
        ],
      },
    ];
    this.signers = [
      {
        account: wallet.getScriptHashFromAddress(fromAddress),
        allowedContracts: [
          this.bridgeState.bridgeTxContractOnNeo3BridgeNeoX,
          GAS3_CONTRACT,
        ],
        allowedGroups: [],
        scopes: 16,
      },
    ];

    return this.neo3Invoke
      .createNeo3Tx({
        invokeArgs: this.invokeArgs,
        signers: this.signers,
        networkFee: this.priorityFee,
      })
      .pipe(
        map((tx) => {
          this.unSignedTx = tx;
          this.systemFee = tx.systemFee.toDecimal(8);
          this.networkFee = tx.networkFee.toDecimal(8);
          this.networkFeeWithoutPriorityFee = new BigNumber(this.networkFee)
            .minus(this.priorityFee)
            .toFixed();
          return;
        })
      );
  }

  async bridgeAll() {
    if (this.chainType === 'Neo3') {
      const getAllAmount = () => {
        const tAmount = new BigNumber(this.bridgeAsset.balance)
          .minus(this.systemFee)
          .minus(this.networkFee);
        if (tAmount.comparedTo(0) > 0) {
          this.bridgeAmount = tAmount
            .dp(this.bridgeAsset.decimals, 1)
            .toFixed();
        } else {
          this.globalService.snackBarTip('balanceLack');
        }
      };
      if (this.systemFee) {
        getAllAmount();
      } else {
        this.calculateNeoN3Fee().subscribe(() => {
          getAllAmount();
        });
      }
    } else {
      if (!this.neoXFeeInfo) {
        await this.calculateNeoXFee();
      }
      const tAmount = new BigNumber(this.bridgeAsset.balance).minus(
        this.neoXFeeInfo.estimateGas
      );
      if (tAmount.comparedTo(0) > 0) {
        this.bridgeAmount = tAmount.dp(this.keepDecimals, 1).toFixed();
      } else {
        this.globalService.snackBarTip('balanceLack');
      }
    }
  }

  toViewTx(isSourceTx = true) {
    let url: string;
    if (isSourceTx) {
      if (this.sessionTx.sourceChainType === 'Neo3') {
        url = `${this.sessionTx.sourceExplorer}transaction/${this.sessionTx.sourceTxID}`;
      } else {
        url = `${this.sessionTx.sourceExplorer}/tx/${this.sessionTx.sourceTxID}`;
      }
    } else {
      if (this.sessionTx.targetChainType === 'Neo3') {
        url = `${this.sessionTx.targetExplorer}transaction/${this.sessionTx.targetTxID}`;
      } else {
        url = `${this.sessionTx.targetExplorer}/tx/${this.sessionTx.targetTxID}`;
      }
    }
    window.open(url);
  }

  async confirm() {
    if (this.getActualReceive() === '-') {
      let message = `Deposit amount shouldn't be less than ${this.minBridgeAmount} GAS`;
      if (this.chainType === 'NeoX') {
        `Withdraw amount shouldn't be less than ${this.minBridgeAmount} GAS`;
      }
      this.globalService.snackBarTip(message);
      return;
    }
    if (
      new BigNumber(this.bridgeAmount).comparedTo(this.bridgeAsset.balance) > 0
    ) {
      this.globalService.snackBarTip('balanceLack');
      return;
    }

    if (
      this.chainType === 'Neo3' &&
      new BigNumber(this.bridgeAmount).comparedTo(this.maxGasDeposit) > 0
    ) {
      this.globalService.snackBarTip('exceedDepositLimit');
      return;
    }

    this.loading = true;
    if (this.chainType === 'Neo3') {
      this.calculateNeoN3Fee().subscribe(() => {
        const tAmount = new BigNumber(this.bridgeAsset.balance)
          .minus(this.bridgeAmount)
          .minus(this.systemFee)
          .minus(this.networkFee);
        if (tAmount.comparedTo(0) < 0) {
          this.globalService.snackBarTip(
            `${this.notification.content.insufficientSystemFee} ${this.bridgeAmount}`
          );
        } else {
          this.showConfirmPage = true;
        }
        this.loading = false;
      });
    } else {
      await this.calculateNeoXFee();
      const tAmount = new BigNumber(this.bridgeAsset.balance)
        .minus(this.bridgeAmount)
        .minus(this.neoXFeeInfo.estimateGas);
      if (tAmount.comparedTo(0) < 0) {
        this.globalService.snackBarTip(
          `${this.notification.content.insufficientSystemFee} ${this.bridgeAmount}`
        );
      } else {
        this.showConfirmPage = true;
      }
      this.loading = false;
    }
  }

  handleBack(event?: { hash: string; chain: ChainType }) {
    this.showConfirmPage = false;
    if (event) {
      const isTestNet =
        event.chain === 'Neo3'
          ? this.n3Network.chainId === 6
          : this.neoXNetwork.chainId === NeoXTestNetChainId;
      this.sessionTx = {
        txId: event.hash,
        sourceChainType: event.chain,
        targetChainType: event.chain === 'Neo3' ? 'NeoX' : 'Neo3',
        sourceExplorer:
          event.chain === 'Neo3'
            ? this.n3Network.explorer
            : this.neoXNetwork.explorer,
        targetExplorer: isTestNet
          ? DEFAULT_NEOX_RPC_NETWORK[0].explorer
          : DEFAULT_N3_RPC_NETWORK[1].explorer,
        sourceRpcUrl:
          event.chain === 'Neo3'
            ? this.n3Network.rpcUrl
            : this.neoXNetwork.rpcUrl,
      };
      this.updateSessionBridgeTx();
      this.resetData();
      this.openTxModal();
      if (event.chain === 'Neo3') {
        this.waitNeo3SourceTxComplete(event.hash);
      }
      if (event.chain === 'NeoX') {
        this.waitNeoXSourceTxComplete(event.hash);
      }
    }
  }

  openTxModal() {
    this.bridgeProgressDialogRef = this.dialog.open(
      PopupBridgeProgressDialogComponent,
      {
        panelClass: 'custom-dialog-panel',
        backdropClass: 'custom-dialog-backdrop',
        data: this.sessionTx,
      }
    );
  }

  selectToAddress() {
    const chain: ChainType = this.chainType === 'Neo3' ? 'NeoX' : 'Neo3';
    this.dialog
      .open(PopupSelectAddressDialogComponent, {
        panelClass: 'custom-dialog-panel',
        backdropClass: 'custom-dialog-backdrop',
        data: {
          chainType: chain,
          walletArr: chain === 'Neo3' ? this.neo3WalletArr : this.neoXWalletArr,
        },
      })
      .afterClosed()
      .subscribe((res) => {
        if (res) {
          this.toAddress = res;
        }
      });
  }

  updateSessionBridgeTx() {
    this.chrome.setStorage(STORAGE_NAME.bridgeTransaction, [this.sessionTx]);
  }

  //#region neo3
  private waitNeo3SourceTxComplete(hash: string) {
    this.getSourceTxReceiptInterval?.unsubscribe();
    this.getSourceTxReceiptInterval = interval(3000).subscribe(() => {
      this.transactionState
        .getApplicationLog(hash, this.sessionTx.sourceRpcUrl)
        .subscribe((res) => {
          console.log(res);
          this.sessionTx.sourceTxID = hash;
          this.updateSessionBridgeTx();
          if (this.bridgeProgressDialogRef?.componentInstance) {
            this.bridgeProgressDialogRef.componentInstance.data.sourceTxID =
              hash;
          }
          this.getSourceTxReceiptInterval.unsubscribe();
          const notifications = res.executions[0].notifications;
          const notifi = notifications.find(
            (item) => item.eventname === 'GasDeposit'
          );
          const depositId = notifi.state.value[0].value;
          console.log(depositId);
          this.waitNeo3TargetTxComplete(depositId);
        });
    });
  }

  private waitNeo3TargetTxComplete(depositId: number) {
    this.getTargetTxReceiptInterval?.unsubscribe();
    this.getTargetTxReceiptInterval = interval(5000).subscribe(() => {
      this.bridgeState
        .getBridgeTxOnNeo3BridgeNeoX(depositId)
        .subscribe((res: any) => {
          console.log(res);
          if (res.txid) {
            this.sessionTx.targetTxID = res.txid;
            this.updateSessionBridgeTx();
            if (this.bridgeProgressDialogRef?.componentInstance) {
              this.bridgeProgressDialogRef.componentInstance.data.targetTxID =
                res.txid;
            }
            this.getTargetTxReceiptInterval.unsubscribe();
          }
        });
    });
  }
  //#endregion

  //#region neox
  private waitNeoXSourceTxComplete(hash: string) {
    this.getSourceTxReceiptInterval?.unsubscribe();
    this.getSourceTxReceiptInterval = interval(3000).subscribe(() => {
      this.bridgeState
        .getTransactionReceipt(hash, this.sessionTx.sourceRpcUrl)
        .then((res) => {
          if (res) {
            console.log(res);
            this.sessionTx.sourceTxID = hash;
            this.updateSessionBridgeTx();
            if (this.bridgeProgressDialogRef?.componentInstance) {
              this.bridgeProgressDialogRef.componentInstance.data.sourceTxID =
                hash;
            }
            this.getSourceTxReceiptInterval.unsubscribe();
            const nonce = new BigNumber(res.logs[0].topics[1]).toNumber();
            console.log(nonce);
            this.waitNeoXTargetTxComplete(nonce);
          }
        });
    });
  }

  private waitNeoXTargetTxComplete(nonce: number) {
    this.getTargetTxReceiptInterval?.unsubscribe();
    this.getTargetTxReceiptInterval = interval(3000).subscribe(() => {
      this.bridgeState
        .getBridgeTxOnNeoXBridgeNeo3(nonce)
        .subscribe((res: any) => {
          console.log(res);
          if (res.result) {
            this.sessionTx.targetTxID = res.result.txid;
            this.updateSessionBridgeTx();
            if (this.bridgeProgressDialogRef?.componentInstance) {
              this.bridgeProgressDialogRef.componentInstance.data.targetTxID =
                res.result.txid;
            }
            this.getTargetTxReceiptInterval.unsubscribe();
          }
        });
    });
  }
  //#region

  private resetData() {
    this.initData();
    this.bridgeAmount = '';
    this.toAddress = '';
  }
}
