import {
  RateState,
  GlobalService,
  NotificationService,
  NeoTxService,
  ChromeService,
  SettingState,
  EvmTxService,
  EvmGasService,
  NeoAssetService,
  BridgeService,
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
  getErrorMessage,
  isScriptFaultError,
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
import { Wallet3 } from '@popup/_lib';
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
import { BRIDGE_FEE_PROBE_ADDRESS, BridgeParams } from '../_lib/bridge';
import {
  getMaxBridgeAmount,
  hasEnoughGasForBridgeFees,
  isValidBridgeBalance,
} from './bridge-fee';

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
  bridgeInfo: {
    bridgeFee: string;
    minBridge: string;
    maxBridge: string;
  };
  private gasBalance: string;
  private bridgeAssetBalancePromise: Promise<void>;
  private isMaxBridgeAmount = false;

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

  // neoX
  neoXFeeInfo: NeoXFeeInfoProp;
  neoXTxParams: EvmTransactionParams;
  isApproveBtn = false;
  isApproving = false;

  private accountSub: Unsubscribable;
  private bridgeContextKey: string;
  private currentWallet: Wallet2 | Wallet3 | EvmWalletJSON;
  chainType: ChainType;
  n3Network: RpcNetwork;
  neoXNetwork: RpcNetwork;
  neo3WalletArr: Wallet3[];
  neoXWalletArr: EvmWalletJSON[];
  currentBridgeNetwork: BridgeNetwork;
  constructor(
    private rateState: RateState,
    private neo3Invoke: Neo3InvokeService,
    private globalService: GlobalService,
    public notification: NotificationService,
    private bridgeService: BridgeService,
    private neoTxService: NeoTxService,
    private settingState: SettingState,
    private dialog: MatDialog,
    private chrome: ChromeService,
    private store: Store<AppState>,
    private evmTxService: EvmTxService,
    private evmGasService: EvmGasService,
    private neoAssetService: NeoAssetService
  ) {
    const account$ = this.store.select('account');
    this.accountSub = account$.subscribe((state) => {
      this.currentWallet = state.currentWallet;
      this.chainType = state.currentChainType;
      this.n3Network = state.n3Networks[state.n3NetworkIndex];
      this.neoXNetwork = state.neoXNetworks[state.neoXNetworkIndex];
      this.neo3WalletArr = state.neo3WalletArr;
      this.neoXWalletArr = state.neoXWalletArr;
      // Every action on the account slice emits a new reference, including
      // wallet edits this page does not care about. Reinitialising on those
      // would reset bridgeAsset to the first one while the amount the user
      // typed for the old asset stays in the field.
      const contextKey = [
        this.chainType,
        this.currentWallet?.accounts[0]?.address,
        this.n3Network?.chainId,
        this.neoXNetwork?.chainId,
      ].join('/');
      if (contextKey !== this.bridgeContextKey) {
        this.bridgeContextKey = contextKey;
        this.initData();
      }
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
        if (tx?.length > 0) {
          this.sessionFirstTx = tx[0];
          if (tx[0].type === 'bridge') {
            this.sessionTx = tx[0];
            // A failed source tx has no target tx to wait for.
            if (
              !tx[0].sourceTxFailed &&
              (!tx[0].sourceTxID || !tx[0].targetTxID)
            ) {
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

  private initData() {
    this.resetFeeEstimates();
    if (this.chainType === 'Neo3') {
      this.currentBridgeNetwork =
        this.n3Network.chainId === N3MainnetNetwork.chainId
          ? BridgeNetwork.MainNet
          : BridgeNetwork.TestNet;
    }
    if (this.chainType === 'NeoX') {
      this.currentBridgeNetwork =
        this.neoXNetwork.chainId === NeoXMainnetNetwork.chainId
          ? BridgeNetwork.MainNet
          : BridgeNetwork.TestNet;
    }
    this.bridgeService
      .getBridgeAssetList(this.currentBridgeNetwork)
      .subscribe(async (res) => {
        this.bridgeAssetList = this.chainType === 'Neo3' ? res.neo3 : res.neox;
        this.bridgeAsset = this.bridgeAssetList[0];
        this.loadBridgeInfo();
        // balance
        this.bridgeAssetBalancePromise = this.getBridgeAssetBalance();
        await this.bridgeAssetBalancePromise;
      });
  }

  /**
   * The fee and the deposit limits gate every amount check on this page, so a
   * failed lookup has to be visible rather than leaving bridgeInfo undefined
   * and the page silently half-working.
   */
  private loadBridgeInfo() {
    this.bridgeService
      .getBridgeInfo(this.chainType, this.currentBridgeNetwork, this.bridgeAsset)
      .subscribe(
        (res) => {
          this.bridgeInfo = res;
        },
        () => {
          this.bridgeInfo = undefined;
          this.globalService.snackBarTip('getBridgeInfoFailed');
        }
      );
  }

  private getAssetRate() {
    this.handleInputSub?.unsubscribe();
    this.handleInputSub = timer(500).subscribe(async () => {
      this.bridgeAsset.rateBalance = await this.rateState.getAssetAmountRate({
        chainType: this.chainType,
        assetId: this.bridgeAsset.asset_id,
        chainId:
          this.chainType === 'NeoX' ? this.neoXNetwork.chainId : undefined,
        amount: this.bridgeAmount,
      });
    });
  }

  getActualReceive() {
    if (this.chainType === 'Neo3') {
      if (
        this.bridgeAmount &&
        new BigNumber(this.bridgeAmount).comparedTo(
          this.bridgeInfo.minBridge
        ) >= 0
      ) {
        return new BigNumber(this.bridgeAmount)
          .dp(this.bridgeAsset.decimals, 1)
          .toFixed();
      }
      return '-';
    } else {
      if (
        this.bridgeAmount &&
        new BigNumber(this.bridgeAmount).comparedTo(
          this.bridgeInfo.minBridge
        ) >= 0
      ) {
        if (this.bridgeAsset.symbol === 'GAS') {
          return new BigNumber(this.bridgeAmount)
            .minus(this.bridgeInfo.bridgeFee)
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
  }

  private async calculateNeoXFee() {
    this.neoXFeeInfo = undefined;
    const txParams = this.bridgeService.getNeoXTxParams({
      bridgeAsset: this.bridgeAsset,
      // resetData clears the field to '', which ?? would let through as an amount.
      bridgeAmount: this.bridgeAmount || this.bridgeInfo.minBridge,
      fromAddress: this.currentWallet.accounts[0].address,
      toAddress: this.toAddress || BRIDGE_FEE_PROBE_ADDRESS.Neo3,
      bridgeFee: this.bridgeInfo.bridgeFee,
      currentBridgeNetwork: this.currentBridgeNetwork,
    });
    let estimate;
    try {
      estimate = await this.evmGasService.estimateGas(txParams);
    } catch {
      // RPC failure: can't fetch the block to estimate. Surface a network error.
      this.globalService.snackBarTip('EstimateFeeNetworkError');
      return;
    }
    this.neoXFeeInfo = await this.evmGasService.getGasInfo(
      estimate.gasLimit,
      estimate.block
    );
    this.neoXFeeInfo.estimateGasError = estimate.simulationFailed;
  }

  private calculateNeoN3Fee() {
    const { invokeArgs, signers } = this.bridgeService.getNeoN3TxParams({
      bridgeAsset: this.bridgeAsset,
      // resetData clears the field to '', which ?? would let through as an amount.
      bridgeAmount: this.bridgeAmount || this.bridgeInfo.minBridge,
      fromAddress: this.currentWallet.accounts[0].address,
      toAddress: this.toAddress || BRIDGE_FEE_PROBE_ADDRESS.NeoX,
      bridgeFee: this.bridgeInfo.bridgeFee,
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
    try {
      await this.bridgeAssetBalancePromise;
    } catch {
      this.globalService.snackBarTip('balanceLack');
      return;
    }
    if (!isValidBridgeBalance(this.bridgeAsset.balance)) {
      this.globalService.snackBarTip('balanceLack');
      return;
    }

    if (this.bridgeAsset.symbol !== 'GAS') {
      this.bridgeAmount = this.bridgeAsset.balance;
    } else if (this.chainType === 'Neo3') {
      const getAllAmount = () => {
        // depositNative charges maxFee on top of amount, so reserve it as well.
        const tAmount = new BigNumber(this.bridgeAsset.balance)
          .minus(this.bridgeInfo?.bridgeFee || 0)
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
      if (!this.systemFee) {
        // The fee probe deposits minBridge, so a balance that cannot even cover
        // the fees already known here would only come back as a VM FAULT.
        if (
          !hasEnoughGasForBridgeFees(
            this.bridgeAsset.balance,
            this.bridgeInfo.bridgeFee,
            this.priorityFee
          )
        ) {
          this.globalService.snackBarTip('balanceLack');
          return;
        }
        try {
          await this.calculateNeoN3Fee().toPromise();
        } catch (error) {
          // FAULT means the node answered and the deposit script itself aborted
          // — here the balance falling short — not that the network is down.
          this.globalService.snackBarTip(
            isScriptFaultError(error) ? 'balanceLack' : 'EstimateFeeNetworkError'
          );
          return;
        }
      }
      getAllAmount();
    } else {
      await this.calculateNeoXFee();
      if (!this.neoXFeeInfo) return;
      const tAmount = getMaxBridgeAmount(
        this.bridgeAsset.balance,
        this.neoXFeeInfo.estimateGas,
        this.bridgeAsset.bridgeDecimals
      );
      if (new BigNumber(tAmount).comparedTo(0) > 0) {
        this.bridgeAmount = tAmount;
      } else {
        this.bridgeAmount = '0';
        this.globalService.snackBarTip('balanceLack');
      }
    }
    this.bridgeAmount = new BigNumber(this.bridgeAmount)
      .dp(this.bridgeAsset.bridgeDecimals, 1)
      .toFixed();
    this.isMaxBridgeAmount = true;
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
      let message;
      switch (this.lang) {
        case 'zh_CN':
          message = `存入数额不能少于 ${this.bridgeInfo.minBridge} ${this.bridgeAsset.symbol}`;
          break;
        case 'ja':
          message = `入金額は${this.bridgeInfo.minBridge} ${this.bridgeAsset.symbol}未満であってはなりません`;
          break;
        case 'ko':
          message = `입금 수량은 ${this.bridgeInfo.minBridge} ${this.bridgeAsset.symbol}보다 적을 수 없습니다`;
          break;
        default:
          message = `Deposit amount shouldn't be less than ${this.bridgeInfo.minBridge} ${this.bridgeAsset.symbol}`;
          break;
      }
      if (this.chainType === 'NeoX') {
        switch (this.lang) {
          case 'zh_CN':
            message = `提取数额不能少于 ${this.bridgeInfo.minBridge} ${this.bridgeAsset.symbol}`;
            break;
          case 'ja':
            message = `出金額は${this.bridgeInfo.minBridge} ${this.bridgeAsset.symbol}未満であってはなりません`;
            break;
          case 'ko':
            message = `출금 수량은 ${this.bridgeInfo.minBridge} ${this.bridgeAsset.symbol}보다 적을 수 없습니다`;
            break;
          default:
            message = `Withdraw amount shouldn't be less than ${this.bridgeInfo.minBridge} ${this.bridgeAsset.symbol}`;
            break;
        }
      }
      this.globalService.snackBarTip(message || '');
      return;
    }
    if (
      new BigNumber(this.bridgeAmount).comparedTo(this.bridgeAsset.balance) > 0
    ) {
      this.globalService.snackBarTip('balanceLack');
      return;
    }

    if (
      new BigNumber(this.bridgeAmount).comparedTo(this.bridgeInfo.maxBridge) > 0
    ) {
      this.globalService.snackBarTip(
        this.chainType === 'Neo3'
          ? 'exceedDepositLimit'
          : 'exceedWithdrawalLimit',
        `${this.bridgeInfo.maxBridge} ${this.bridgeAsset.symbol}`
      );
      return;
    }

    if (!this.hasEnoughGasBeforeFeeEstimation()) {
      this.globalService.snackBarTip(
        `${this.notification.content.InsufficientGas}`
      );
      return;
    }

    this.loading = true;
    if (
      this.chainType === 'Neo3' &&
      this.bridgeAsset.asset_id === GAS3_CONTRACT
    ) {
      // The native bridge holds a cap on the total deposited amount; going over
      // it aborts the deposit on chain. Read it fresh, other deposits move it.
      const remaining = await this.bridgeService
        .getNativeDepositCapacity(this.currentBridgeNetwork)
        .toPromise();
      if (
        remaining !== undefined &&
        new BigNumber(this.bridgeAmount).comparedTo(remaining) > 0
      ) {
        this.globalService.snackBarTip(
          'exceedBridgeCapacity',
          `${remaining} ${this.bridgeAsset.symbol}`
        );
        this.loading = false;
        return;
      }
    }
    if (this.chainType === 'Neo3') {
      const { invokeArgs, signers } = this.bridgeService.getNeoN3TxParams({
        bridgeAsset: this.bridgeAsset,
        bridgeAmount: this.bridgeAmount,
        fromAddress: this.currentWallet.accounts[0].address,
        toAddress: this.toAddress,
        bridgeFee: this.bridgeInfo.bridgeFee,
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
                .minus(this.bridgeInfo.bridgeFee)
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
              // depositToken pays maxFee in GAS as well.
              if (
                !hasEnoughGasForBridgeFees(
                  this.gasBalance,
                  this.bridgeInfo.bridgeFee,
                  this.systemFee,
                  this.networkFee
                )
              ) {
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
      const txParams = this.bridgeService.getNeoXTxParams({
        bridgeAsset: this.bridgeAsset,
        bridgeAmount: this.bridgeAmount,
        fromAddress: this.currentWallet.accounts[0].address,
        toAddress: this.toAddress,
        bridgeFee: this.bridgeInfo.bridgeFee,
        currentBridgeNetwork: this.currentBridgeNetwork,
      });
      this.neoXTxParams = txParams;
      let estimate;
      try {
        estimate = await this.evmGasService.estimateGas(txParams);
      } catch {
        // RPC failure: can't fetch the block to estimate. Surface a network error.
        this.globalService.snackBarTip('EstimateFeeNetworkError');
        this.loading = false;
        return;
      }
      this.neoXFeeInfo = await this.evmGasService.getGasInfo(
        estimate.gasLimit,
        estimate.block
      );
      this.neoXFeeInfo.estimateGasError = estimate.simulationFailed;
      if (this.bridgeAsset.asset_id === ETH_SOURCE_ASSET_HASH) {
        const tAmount = new BigNumber(this.bridgeAsset.balance)
          .minus(this.bridgeAmount)
          .minus(this.neoXFeeInfo.estimateGas);
        if (tAmount.comparedTo(0) < 0) {
          if (this.isMaxBridgeAmount) {
            const maxAmount = getMaxBridgeAmount(
              this.bridgeAsset.balance,
              this.neoXFeeInfo.estimateGas,
              this.bridgeAsset.bridgeDecimals
            );
            if (
              new BigNumber(maxAmount).comparedTo(this.bridgeInfo.minBridge) < 0
            ) {
              this.globalService.snackBarTip(
                `${this.notification.content.insufficientSystemFee} ${this.bridgeAmount}`
              );
              this.loading = false;
              return;
            }
            this.bridgeAmount = maxAmount;
            this.neoXTxParams = this.bridgeService.getNeoXTxParams({
              bridgeAsset: this.bridgeAsset,
              bridgeAmount: this.bridgeAmount,
              fromAddress: this.currentWallet.accounts[0].address,
              toAddress: this.toAddress,
              bridgeFee: this.bridgeInfo.bridgeFee,
              currentBridgeNetwork: this.currentBridgeNetwork,
            });
            this.showConfirmPage = true;
          } else {
            this.globalService.snackBarTip(
              `${this.notification.content.insufficientSystemFee} ${this.bridgeAmount}`
            );
          }
        } else {
          this.showConfirmPage = true;
        }
      } else {
        if (
          !hasEnoughGasForBridgeFees(
            this.gasBalance,
            this.bridgeInfo.bridgeFee,
            this.neoXFeeInfo.estimateGas
          )
        ) {
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

  private markSourceTxComplete(hash: string) {
    this.sessionTx.sourceTxID = hash;
    this.updateSessionBridgeTx(this.sessionTx);
    if (this.bridgeProgressDialogRef?.componentInstance) {
      this.bridgeProgressDialogRef.componentInstance.data.sourceTxID = hash;
    }
  }

  private markSourceTxFailed(hash: string) {
    this.getSourceTxReceiptInterval?.unsubscribe();
    this.getTargetTxReceiptInterval?.unsubscribe();
    this.sessionTx.sourceTxID = hash;
    this.sessionTx.sourceTxFailed = true;
    this.updateSessionBridgeTx(this.sessionTx);
    if (this.bridgeProgressDialogRef?.componentInstance) {
      this.bridgeProgressDialogRef.componentInstance.data.sourceTxID = hash;
      this.bridgeProgressDialogRef.componentInstance.data.sourceTxFailed = true;
    }
  }

  //#region neo3
  private waitNeo3SourceTxComplete(hash: string) {
    this.getSourceTxReceiptInterval?.unsubscribe();
    this.getSourceTxReceiptInterval = interval(3000).subscribe(() => {
      this.neoTxService
        .getApplicationLog(hash, this.sessionTx.sourceRpcUrl)
        .subscribe((res) => {
          this.getSourceTxReceiptInterval.unsubscribe();
          const execution = res?.executions?.[0];
          // FAULT means the deposit never happened, so no tx will show up on NeoX.
          if (execution?.vmstate !== 'HALT') {
            this.markSourceTxFailed(hash);
            return;
          }
          const notifications = execution.notifications || [];
          let depositId;
          if (this.sessionTx.asset.asset_id === GAS3_CONTRACT) {
            const notifi = notifications.find(
              (item) => item.eventname === 'NativeDeposit'
            );
            depositId = notifi?.state.value[0].value;
          } else {
            const notifi = notifications.find(
              (item) => item.eventname === 'TokenDeposit'
            );
            depositId = notifi?.state.value[2].value;
          }
          // No deposit event means the bridge contract never accepted the deposit.
          if (depositId === undefined) {
            this.markSourceTxFailed(hash);
            return;
          }
          this.markSourceTxComplete(hash);
          this.waitNeo3TargetTxComplete(depositId);
        });
    });
  }

  private waitNeo3TargetTxComplete(depositId: number) {
    this.getTargetTxReceiptInterval?.unsubscribe();
    this.getTargetTxReceiptInterval = interval(5000).subscribe(() => {
      this.bridgeService
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
      this.bridgeService
        .getTransactionReceipt(hash, this.sessionTx.sourceRpcUrl)
        .then((res) => {
          if (res) {
            this.getSourceTxReceiptInterval.unsubscribe();
            // status 0 means the withdrawal reverted, so no tx will show up on Neo3.
            if (res.status === 0) {
              this.markSourceTxFailed(hash);
              return;
            }
            const nonce = this.bridgeService.getNonceFromTransactionReceipt(
              res,
              this.sessionTx.asset
            );
            // No withdrawal event means the bridge contract never took the funds.
            // nonce 0 is valid, so only a null/undefined nonce counts as failure.
            if (nonce === null || nonce === undefined) {
              this.markSourceTxFailed(hash);
              return;
            }
            this.markSourceTxComplete(hash);
            this.waitNeoXTargetTxComplete(nonce);
          }
        });
    });
  }

  private waitNeoXTargetTxComplete(nonce: number) {
    this.getTargetTxReceiptInterval?.unsubscribe();
    this.getTargetTxReceiptInterval = interval(3000).subscribe(() => {
      this.bridgeService
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
    this.isMaxBridgeAmount = false;
  }

  /**
   * A fee estimate only holds for one asset on one network, and bridgeAll()
   * reuses it for the MAX amount as long as systemFee is set, so it has to go
   * whenever either of those changes.
   */
  private resetFeeEstimates() {
    this.systemFee = undefined;
    this.networkFee = undefined;
    this.networkFeeWithoutPriorityFee = undefined;
    this.neoXFeeInfo = undefined;
  }

  private handleCreateNeo3TxError(error) {
    this.loading = false;
    this.globalService.snackBarTip('txFailed', getErrorMessage(error));
  }

  /**
   * Reject balances that cannot cover the fees already known locally before
   * invokescript/estimateGas is called. The full fee is checked again after the
   * RPC returns the system and network fee estimates.
   */
  private hasEnoughGasBeforeFeeEstimation(): boolean {
    if (this.chainType === 'Neo3') {
      const availableGas =
        this.bridgeAsset.asset_id === GAS3_CONTRACT
          ? new BigNumber(this.bridgeAsset.balance)
              .minus(this.bridgeAmount)
              .toFixed()
          : this.gasBalance;
      return hasEnoughGasForBridgeFees(
        availableGas,
        this.bridgeInfo.bridgeFee,
        this.priorityFee
      );
    }

    if (this.bridgeAsset.asset_id !== ETH_SOURCE_ASSET_HASH) {
      return hasEnoughGasForBridgeFees(
        this.gasBalance,
        this.bridgeInfo.bridgeFee
      );
    }

    return true;
  }

  private async getBridgeAssetBalance() {
    const address = this.currentWallet.accounts[0].address;
    const gasAssetId =
      this.chainType === 'Neo3' ? GAS3_CONTRACT : ETH_SOURCE_ASSET_HASH;
    const isGasAsset = this.bridgeAsset.asset_id === gasAssetId;
    const [balance, gasBalance] = await Promise.all([
      this.neoAssetService.getAddressAssetBalance(
        address,
        this.bridgeAsset.asset_id,
        this.chainType
      ),
      isGasAsset
        ? Promise.resolve(undefined)
        : this.neoAssetService.getAddressAssetBalance(
            address,
            gasAssetId,
            this.chainType
          ),
    ]);
    this.bridgeAsset.balance = new BigNumber(balance)
      .shiftedBy(-this.bridgeAsset.decimals)
      .toFixed();
    this.gasBalance = isGasAsset
      ? this.bridgeAsset.balance
      : new BigNumber(gasBalance)
          .shiftedBy(this.chainType === 'NeoX' ? -18 : -8)
          .toFixed();
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
    this.isMaxBridgeAmount = false;
    this.isShowAssetList = false;
    this.resetFeeEstimates();
    this.loadBridgeInfo();
    this.checkShowApprove();
    this.bridgeAssetBalancePromise = this.getBridgeAssetBalance();
    await this.bridgeAssetBalancePromise;
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
    this.isMaxBridgeAmount = false;
    this.getAssetRate();
    this.checkShowApprove();
  }

  private checkShowApprove() {
    if (
      this.chainType === 'NeoX' &&
      this.bridgeAmount &&
      this.bridgeAsset.asset_id !== ETH_SOURCE_ASSET_HASH
    ) {
      this.bridgeService
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
          spender: BridgeParams[this.currentBridgeNetwork].neoXBridgeContract,
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
          this.evmTxService.waitForTx(res).then((txInfo) => {
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
