import {
  AssetEVMState,
  AssetState,
  GlobalService,
  NotificationService,
  BridgeState,
  TransactionState,
  ChromeService,
  SettingState,
} from '@/app/core';
import { Asset } from '@/models/models';
import { Component, OnDestroy, OnInit } from '@angular/core';
import {
  BridgeNetwork,
  TransactionOnBridge,
  BridgeTransactionOnBridge,
  ApproveTransactionOnBridge,
  ChainType,
  EvmTransactionParams,
  GAS3_CONTRACT,
  N3MainnetNetwork,
  N3TestnetNetwork,
  RpcNetwork,
  STORAGE_NAME,
} from '../_lib';
import {
  ETH_SOURCE_ASSET_HASH,
  EvmWalletJSON,
  NeoXMainnetNetwork,
  NeoXTestnetNetwork,
} from '../_lib/evm';
import { Unsubscribable, map, timer } from 'rxjs';
import { Store } from '@ngrx/store';
import { AppState } from '@/app/reduers';
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
  PopupApproveDialogComponent,
  PopupBridgeProgressDialogComponent,
  PopupSelectAddressDialogComponent,
} from '../_dialogs';
import { Neo3BridgeAssetList, NeoXBridgeAssetList } from '../_lib/bridge';

const MIN_BRIDGE_AMOUNT = 1;

@Component({
  templateUrl: 'bridge.component.html',
  styleUrls: ['bridge.component.scss'],
})
export class PopupBridgeComponent implements OnInit, OnDestroy {
  showConfirmPage = false;
  settingStateSub: Unsubscribable;
  lang: string;
  rateCurrency = '';

  bridgeAsset: Asset;
  bridgeAssetList: Asset[];
  isShowAssetList = false;
  showAssetListTimeout: NodeJS.Timeout;
  bridgeAmount: string;
  handleInputSub: Unsubscribable;
  toAddress: string;
  bridgeFee = '0.1';
  minBridgeAmount = '1.1';
  private gasBalance: string;

  getSourceTxReceiptInterval;
  getTargetTxReceiptInterval;
  loading = false;
  bridgeProgressDialogRef: MatDialogRef<PopupBridgeProgressDialogComponent>;
  sessionFirstTx: TransactionOnBridge;
  sessionTx: BridgeTransactionOnBridge;

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
  neoXTxParams: EvmTransactionParams;
  isApproveBtn = false;
  isApproving = false;

  private accountSub: Unsubscribable;
  private currentWallet: Wallet2 | Wallet3 | EvmWalletJSON;
  chainType: ChainType;
  n3Network: RpcNetwork;
  neoXNetwork: RpcNetwork;
  neo3WalletArr: Wallet3[];
  neoXWalletArr: EvmWalletJSON[];
  currentBridgeNetwork: BridgeNetwork;
  constructor(
    private assetState: AssetState,
    private assetEVMState: AssetEVMState,
    private neo3Invoke: Neo3InvokeService,
    private globalService: GlobalService,
    public notification: NotificationService,
    private bridgeState: BridgeState,
    private transactionState: TransactionState,
    private settingState: SettingState,
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
    this.settingStateSub = this.settingState.langSub.subscribe((lang) => {
      this.lang = lang;
    });
    this.settingState.rateCurrencySub.subscribe((res) => {
      this.rateCurrency = res;
    });
    this.chrome
      .getStorage(STORAGE_NAME.bridgeTransaction)
      .subscribe((tx: TransactionOnBridge[]) => {
        if (tx.length > 0) {
          this.sessionFirstTx = tx[0];
          if (tx[0].type === 'bridge') {
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
        }
      });
  }

  ngOnDestroy(): void {
    this.accountSub?.unsubscribe();
    this.getSourceTxReceiptInterval?.unsubscribe();
    this.getTargetTxReceiptInterval?.unsubscribe();
    this.settingStateSub?.unsubscribe();
  }

  private async initData() {
    if (this.chainType === 'Neo3') {
      this.currentBridgeNetwork =
        this.n3Network.chainId === N3MainnetNetwork.chainId
          ? BridgeNetwork.MainNet
          : BridgeNetwork.TestNet;
      this.bridgeAssetList = Neo3BridgeAssetList[this.currentBridgeNetwork];
      this.bridgeAsset = this.bridgeAssetList[0];
      // bridge fee
      this.bridgeState
        .getGasDepositFee(this.currentBridgeNetwork)
        .subscribe((res) => {
          if (res) {
            this.bridgeFee = res;
            this.getMinBridgeAmount();
          }
        });
      // max deposit fee
      this.bridgeState
        .getMaxGasDeposit(this.currentBridgeNetwork)
        .subscribe((res) => {
          if (res) {
            this.maxGasDeposit = res;
          }
        });

      this.calculateNeoN3Fee().subscribe(() => {});
    }
    if (this.chainType === 'NeoX') {
      this.currentBridgeNetwork =
        this.neoXNetwork.chainId === NeoXMainnetNetwork.chainId
          ? BridgeNetwork.MainNet
          : BridgeNetwork.TestNet;
      this.bridgeAssetList = NeoXBridgeAssetList[this.currentBridgeNetwork];
      this.bridgeAsset = this.bridgeAssetList[0];

      await this.calculateNeoXFee();
    }
    // balance
    await this.getBridgeAssetBalance();
  }

  private getAssetRate() {
    this.handleInputSub?.unsubscribe();
    this.handleInputSub = timer(500).subscribe(async () => {
      this.bridgeAsset.rateBalance = await this.assetState.getAssetAmountRate({
        chainType: this.chainType,
        assetId: this.bridgeAsset.asset_id,
        chainId:
          this.chainType === 'NeoX' ? this.neoXNetwork.chainId : undefined,
        amount: this.bridgeAmount,
      });
    });
  }

  getActualReceive() {
    if (
      this.bridgeAmount &&
      new BigNumber(this.bridgeAmount).comparedTo(this.minBridgeAmount) >= 0
    ) {
      if (this.bridgeAsset.symbol === 'GAS') {
        return new BigNumber(this.bridgeAmount)
          .minus(this.bridgeFee)
          .dp(this.bridgeAsset.decimals, 1)
          .toFixed();
      } else {
        return new BigNumber(this.bridgeAmount)
          .dp(this.bridgeAsset.decimals, 1)
          .toFixed();
      }
    }
    return '-';
  }

  private async calculateNeoXFee() {
    const txParams = this.bridgeState.getNeoXTxParams({
      bridgeAsset: this.bridgeAsset,
      bridgeAmount: this.bridgeAmount ?? this.minBridgeAmount,
      fromAddress: this.currentWallet.accounts[0].address,
      toAddress: this.toAddress ?? 'NL1Frwvb3jo8sWyqN6NCfwg2o2Y2pQ9ttT', // 0x0000000000000000000000000000000000000001
      bridgeFee: this.bridgeFee,
      currentBridgeNetwork: this.currentBridgeNetwork,
    });
    let networkGasLimit;
    try {
      networkGasLimit = await this.assetEVMState.estimateGas(txParams);
    } catch {
      networkGasLimit = BigInt(42750000);
    }
    this.neoXFeeInfo = await this.assetEVMState.getGasInfo(networkGasLimit);
  }

  private calculateNeoN3Fee() {
    const { invokeArgs, signers } = this.bridgeState.getNeoN3TxParams({
      bridgeAsset: this.bridgeAsset,
      bridgeAmount: this.bridgeAmount ?? this.minBridgeAmount,
      fromAddress: this.currentWallet.accounts[0].address,
      toAddress: this.toAddress ?? '0x0000000000000000000000000000000000000001',
      bridgeFee: this.bridgeFee,
      currentBridgeNetwork: this.currentBridgeNetwork,
    });

    return this.neo3Invoke
      .createNeo3Tx({
        invokeArgs,
        signers,
        networkFee: this.priorityFee,
      })
      .pipe(
        map((tx) => {
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
    if (this.bridgeAsset.symbol !== 'GAS') {
      this.bridgeAmount = this.bridgeAsset.balance;
    } else if (this.chainType === 'Neo3') {
      const getAllAmount = () => {
        const tAmount = new BigNumber(this.bridgeAsset.balance)
          .minus(this.systemFee)
          .minus(this.networkFee);
        if (tAmount.comparedTo(0) > 0) {
          this.bridgeAmount = tAmount
            .dp(this.bridgeAsset.decimals, 1)
            .toFixed();
        } else {
          this.bridgeAmount = '0';
          this.globalService.snackBarTip('balanceLack');
        }
      };
      if (this.systemFee) {
        getAllAmount();
      } else {
        this.calculateNeoN3Fee().subscribe(
          () => {
            getAllAmount();
          },
          () => {
            this.bridgeAmount = this.bridgeAsset.balance;
          }
        );
      }
    } else {
      if (!this.neoXFeeInfo) {
        await this.calculateNeoXFee();
      }
      const tAmount = new BigNumber(this.bridgeAsset.balance).minus(
        this.neoXFeeInfo.estimateGas
      );
      if (tAmount.comparedTo(0) > 0) {
        this.bridgeAmount = tAmount.dp(this.bridgeAsset.decimals, 1).toFixed();
      } else {
        this.bridgeAmount = '0';
        this.globalService.snackBarTip('balanceLack');
      }
    }
    this.bridgeAmount = new BigNumber(this.bridgeAmount)
      .dp(this.bridgeAsset.bridgeDecimals, 1)
      .toFixed();
    this.checkShowApprove();
    this.getAssetRate();
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
  toViewApproveTx(neoXExplorer: string, txId: string) {
    window.open(`${neoXExplorer}/tx/${txId}`);
  }

  async confirm() {
    if (!this.toAddress) return;
    this.checkShowApprove();
    if (this.isApproveBtn) {
      return;
    }
    if (this.getActualReceive() === '-') {
      let message =
        this.lang !== 'en'
          ? `存入数额不能少于 ${this.minBridgeAmount} ${this.bridgeAsset.symbol}`
          : `Deposit amount shouldn't be less than ${this.minBridgeAmount} ${this.bridgeAsset.symbol}`;
      if (this.chainType === 'NeoX') {
        message =
          this.lang !== 'en'
            ? `提取数额不能少于 ${this.minBridgeAmount} ${this.bridgeAsset.symbol}`
            : `Withdraw amount shouldn't be less than ${this.minBridgeAmount} ${this.bridgeAsset.symbol}`;
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
      const { invokeArgs, signers } = this.bridgeState.getNeoN3TxParams({
        bridgeAsset: this.bridgeAsset,
        bridgeAmount: this.bridgeAmount,
        fromAddress: this.currentWallet.accounts[0].address,
        toAddress: this.toAddress,
        bridgeFee: this.bridgeFee,
        currentBridgeNetwork: this.currentBridgeNetwork,
      });
      this.invokeArgs = invokeArgs;
      this.signers = signers;
      this.neo3Invoke
        .createNeo3Tx({
          invokeArgs,
          signers,
          networkFee: this.priorityFee,
        })
        .subscribe(
          (tx) => {
            this.unSignedTx = tx;
            this.systemFee = tx.systemFee.toDecimal(8);
            this.networkFee = tx.networkFee.toDecimal(8);
            this.networkFeeWithoutPriorityFee = new BigNumber(this.networkFee)
              .minus(this.priorityFee)
              .toFixed();
            if (this.bridgeAsset.asset_id === GAS3_CONTRACT) {
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
            } else {
              const tAmount = new BigNumber(this.gasBalance)
                .minus(this.systemFee)
                .minus(this.networkFee);
              if (tAmount.comparedTo(0) < 0) {
                this.globalService.snackBarTip(
                  `${this.notification.content.InsufficientGas}`
                );
              } else {
                this.showConfirmPage = true;
              }
            }
            this.loading = false;
          },
          (error) => {
            this.handleCreateNeo3TxError(error);
          }
        );
    } else {
      const txParams = this.bridgeState.getNeoXTxParams({
        bridgeAsset: this.bridgeAsset,
        bridgeAmount: this.bridgeAmount,
        fromAddress: this.currentWallet.accounts[0].address,
        toAddress: this.toAddress,
        bridgeFee: this.bridgeFee,
        currentBridgeNetwork: this.currentBridgeNetwork,
      });
      this.neoXTxParams = txParams;
      let networkGasLimit;
      try {
        networkGasLimit = await this.assetEVMState.estimateGas(txParams);
      } catch {
        networkGasLimit = BigInt(42750000);
      }
      this.neoXFeeInfo = await this.assetEVMState.getGasInfo(networkGasLimit);
      if (this.bridgeAsset.asset_id === ETH_SOURCE_ASSET_HASH) {
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
      } else {
        const tAmount = new BigNumber(this.gasBalance)
          .minus(this.bridgeFee)
          .minus(this.neoXFeeInfo.estimateGas);
        if (tAmount.comparedTo(0) < 0) {
          this.globalService.snackBarTip(
            `${this.notification.content.InsufficientGas}`
          );
        } else {
          this.showConfirmPage = true;
        }
      }
      this.loading = false;
    }
  }

  handleTxhash(event?: { hash: string; chain: ChainType }) {
    this.showConfirmPage = false;
    if (event) {
      const isMainNet =
        event.chain === 'Neo3'
          ? this.n3Network.chainId === N3MainnetNetwork.chainId
          : this.neoXNetwork.chainId === NeoXMainnetNetwork.chainId;
      const targetChainType = event.chain === 'Neo3' ? 'NeoX' : 'Neo3';
      let targetExplorer: string;
      if (targetChainType === 'Neo3') {
        targetExplorer = isMainNet
          ? N3MainnetNetwork.explorer
          : N3TestnetNetwork.explorer;
      } else {
        targetExplorer = isMainNet
          ? NeoXMainnetNetwork.explorer
          : NeoXTestnetNetwork.explorer;
      }
      this.sessionTx = {
        type: 'bridge',
        txId: event.hash,
        asset: this.bridgeAsset,
        network: isMainNet ? BridgeNetwork.MainNet : BridgeNetwork.TestNet,
        sourceChainType: event.chain,
        targetChainType,
        sourceExplorer:
          event.chain === 'Neo3'
            ? this.n3Network.explorer
            : this.neoXNetwork.explorer,
        targetExplorer,
        sourceRpcUrl:
          event.chain === 'Neo3'
            ? this.n3Network.rpcUrl
            : this.neoXNetwork.rpcUrl,
      };
      this.updateSessionBridgeTx(this.sessionTx);
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

  private updateSessionBridgeTx(tx: TransactionOnBridge) {
    this.sessionFirstTx = tx;
    this.chrome.setStorage(STORAGE_NAME.bridgeTransaction, [tx]);
  }

  //#region neo3
  private waitNeo3SourceTxComplete(hash: string) {
    this.getSourceTxReceiptInterval?.unsubscribe();
    this.getSourceTxReceiptInterval = interval(3000).subscribe(() => {
      this.transactionState
        .getApplicationLog(hash, this.sessionTx.sourceRpcUrl)
        .subscribe((res) => {
          this.sessionTx.sourceTxID = hash;
          this.updateSessionBridgeTx(this.sessionTx);
          if (this.bridgeProgressDialogRef?.componentInstance) {
            this.bridgeProgressDialogRef.componentInstance.data.sourceTxID =
              hash;
          }
          this.getSourceTxReceiptInterval.unsubscribe();
          const notifications = res.executions[0].notifications;
          let depositId;
          if (this.sessionTx.asset.asset_id === GAS3_CONTRACT) {
            const notifi = notifications.find(
              (item) => item.eventname === 'GasDeposit'
            );
            depositId = notifi.state.value[0].value;
          } else {
            const notifi = notifications.find(
              (item) => item.eventname === 'TokenDeposit'
            );
            depositId = notifi.state.value[2].value;
          }
          this.waitNeo3TargetTxComplete(depositId);
        });
    });
  }

  private waitNeo3TargetTxComplete(depositId: number) {
    this.getTargetTxReceiptInterval?.unsubscribe();
    this.getTargetTxReceiptInterval = interval(5000).subscribe(() => {
      this.bridgeState
        .getBridgeTxOnNeo3BridgeNeoX(depositId, this.sessionTx)
        .subscribe((res: any) => {
          if (res.txid) {
            this.sessionTx.targetTxID = res.txid;
            this.updateSessionBridgeTx(this.sessionTx);
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
            this.sessionTx.sourceTxID = hash;
            this.updateSessionBridgeTx(this.sessionTx);
            if (this.bridgeProgressDialogRef?.componentInstance) {
              this.bridgeProgressDialogRef.componentInstance.data.sourceTxID =
                hash;
            }
            this.getSourceTxReceiptInterval.unsubscribe();
            let nonce;
            if (this.sessionTx.asset.asset_id === ETH_SOURCE_ASSET_HASH) {
              nonce = new BigNumber(res.logs[0].topics[1]).toNumber();
            } else {
              nonce = new BigNumber(res.logs[1].topics[2]).toNumber();
            }
            this.waitNeoXTargetTxComplete(nonce);
          }
        });
    });
  }

  private waitNeoXTargetTxComplete(nonce: number) {
    this.getTargetTxReceiptInterval?.unsubscribe();
    this.getTargetTxReceiptInterval = interval(3000).subscribe(() => {
      this.bridgeState
        .getBridgeTxOnNeoXBridgeNeo3(nonce, this.sessionTx)
        .subscribe((res: any) => {
          if (res.result) {
            this.sessionTx.targetTxID = res.result.txid;
            this.updateSessionBridgeTx(this.sessionTx);
            if (this.bridgeProgressDialogRef?.componentInstance) {
              this.bridgeProgressDialogRef.componentInstance.data.targetTxID =
                res.result.txid;
            }
            this.getTargetTxReceiptInterval.unsubscribe();
          }
        });
    });
  }
  //#endregion

  //#region private
  private resetData() {
    this.initData();
    this.bridgeAmount = '';
    this.toAddress = '';
  }

  private handleCreateNeo3TxError(error) {
    this.loading = false;
    if (error?.type === 'scriptError') {
      this.globalService.snackBarTip('checkInput');
    } else {
      this.globalService.snackBarTip(
        error?.error?.message || error?.error?.exception || 'rpcError'
      );
    }
  }
  private async getBridgeAssetBalance() {
    const balance = await this.assetState.getAddressAssetBalance(
      this.currentWallet.accounts[0].address,
      this.bridgeAsset.asset_id,
      this.chainType
    );
    this.bridgeAsset.balance = new BigNumber(balance)
      .shiftedBy(-this.bridgeAsset.decimals)
      .toFixed();
    if (this.bridgeAsset.symbol === 'GAS') {
      this.gasBalance = this.bridgeAsset.balance;
    }
  }
  //#endregion

  showAssetList() {
    if (this.showAssetListTimeout) {
      clearTimeout(this.showAssetListTimeout);
    }
    this.isShowAssetList = true;
  }
  hideAssetList() {
    if (this.showAssetListTimeout) {
      clearTimeout(this.showAssetListTimeout);
    }
    this.showAssetListTimeout = setTimeout(() => {
      this.isShowAssetList = false;
    }, 300);
  }

  async selectBridgeAsset(asset: Asset) {
    this.bridgeAsset = asset;
    this.bridgeAmount = '';
    this.isShowAssetList = false;
    this.getMinBridgeAmount();
    this.checkShowApprove();
    await this.getBridgeAssetBalance();
  }

  private getMinBridgeAmount() {
    if (this.bridgeAsset.symbol === 'GAS') {
      this.minBridgeAmount = new BigNumber(this.bridgeFee)
        .plus(MIN_BRIDGE_AMOUNT)
        .toFixed();
    } else {
      this.minBridgeAmount = MIN_BRIDGE_AMOUNT.toString();
    }
  }

  checkBridgeAmount(event) {
    const value = event.target.value;
    let regex = new RegExp(
      `^\\D*(\\d*(?:\\.\\d{0,${this.bridgeAsset.bridgeDecimals}})?).*`,
      'g'
    );
    if (this.bridgeAsset.bridgeDecimals === 0) {
      regex = new RegExp(`^\\D*(\\d*).*`, 'g');
    }
    event.target.value = value.replace(regex, '$1');
    this.bridgeAmount = event.target.value;
    this.getAssetRate();
    this.checkShowApprove();
  }

  private checkShowApprove() {
    if (
      this.chainType === 'NeoX' &&
      this.bridgeAmount &&
      this.bridgeAsset.asset_id !== ETH_SOURCE_ASSET_HASH
    ) {
      this.bridgeState
        .getAllowance(
          this.bridgeAsset,
          this.currentWallet.accounts[0].address,
          this.currentBridgeNetwork
        )
        .then((res) => {
          if (new BigNumber(this.bridgeAmount).comparedTo(res) > 0) {
            this.isApproveBtn = true;
          } else {
            this.isApproveBtn = false;
          }
        });
    } else {
      this.isApproveBtn = false;
    }
  }

  showApprove() {
    if (this.isApproving) return;
    this.dialog
      .open(PopupApproveDialogComponent, {
        data: {
          asset: this.bridgeAsset,
          encryptWallet: this.currentWallet,
          spender:
            this.bridgeState.BridgeParams[this.currentBridgeNetwork]
              .neoXBridgeContract,
          amount: this.bridgeAmount,
          lang: this.lang,
          rateCurrency: this.rateCurrency,
          neoXNetwork: this.neoXNetwork,
        },
        panelClass: 'custom-dialog-panel-full',
      })
      .afterClosed()
      .subscribe((res) => {
        if (res) {
          this.isApproving = true;
          this.assetEVMState.waitForTx(res).then((txInfo) => {
            this.isApproving = false;
            this.isApproveBtn = false;
            if (txInfo.status) {
              this.checkShowApprove();
              const tx: ApproveTransactionOnBridge = {
                type: 'approval',
                txId: res,
                asset: this.bridgeAsset,
                network: this.currentBridgeNetwork,
                neoXExplorer: this.neoXNetwork.explorer,
              };
              this.getSourceTxReceiptInterval?.unsubscribe();
              this.getTargetTxReceiptInterval?.unsubscribe();
              this.updateSessionBridgeTx(tx);
            }
          });
        }
      });
  }
}
