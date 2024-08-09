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
  BridgeTransactionItem,
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
import { ethers } from 'ethers';

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
  settingStateSub: Unsubscribable;
  lang: string;
  rateCurrency = '';

  bridgeAsset: Asset;
  bridgeAmount: string;
  handleInputSub: Unsubscribable;
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
    this.chrome.getStorage(STORAGE_NAME.rateCurrency).subscribe((res) => {
      this.rateCurrency = res;
    });
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
    this.settingStateSub?.unsubscribe();
  }

  private async initData() {
    if (this.chainType === 'Neo3') {
      this.currentBridgeNetwork =
        this.n3Network.chainId === N3MainnetNetwork.chainId
          ? BridgeNetwork.MainNet
          : BridgeNetwork.TestNet;
      this.fromChain = 'Neo N3';
      this.toChain = 'Neo X';
      this.bridgeAsset = NeoN3GasAsset;
      // bridge fee
      this.bridgeState
        .getGasDepositFee(this.currentBridgeNetwork)
        .subscribe((res) => {
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
      this.bridgeState
        .getMaxGasDeposit(this.currentBridgeNetwork)
        .subscribe((res) => {
          if (res) {
            this.maxGasDeposit = new BigNumber(res)
              .shiftedBy(-NeoN3GasAsset.decimals)
              .toFixed();
          }
        });

      this.calculateNeoN3Fee().subscribe(() => {});
    }
    if (this.chainType === 'NeoX') {
      this.currentBridgeNetwork =
        this.neoXNetwork.chainId === NeoXMainnetNetwork.chainId
          ? BridgeNetwork.MainNet
          : BridgeNetwork.TestNet;
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
      maxFee: ethers.parseUnits(this.bridgeFee, this.bridgeAsset.decimals),
    });

    let networkGasLimit: bigint;
    this.txParams = {
      from: this.currentWallet.accounts[0].address,
      to: this.bridgeState.BridgeParams[this.currentBridgeNetwork]
        .neoXBridgeContract,
      value,
      data,
    };
    try {
      networkGasLimit = await this.assetEVMState.estimateGas(this.txParams);
    } catch {
      networkGasLimit = BigInt(42750000);
    }
    this.neoXFeeInfo = await this.assetEVMState.getGasInfo(networkGasLimit);
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
        scriptHash:
          this.bridgeState.BridgeParams[this.currentBridgeNetwork]
            .n3BridgeContract,
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
          this.bridgeState.BridgeParams[this.currentBridgeNetwork]
            .n3BridgeContract,
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
        this.bridgeAmount = tAmount.dp(this.keepDecimals, 1).toFixed();
      } else {
        this.globalService.snackBarTip('balanceLack');
      }
    }
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

  async confirm() {
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
      this.calculateNeoN3Fee().subscribe(
        () => {
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
        },
        (error) => {
          this.handleCreateNeo3TxError(error);
        }
      );
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

  handleBack(event?: { hash: string; chain: ChainType }) {
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
        txId: event.hash,
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
          this.waitNeo3TargetTxComplete(depositId);
        });
    });
  }

  private waitNeo3TargetTxComplete(depositId: number) {
    this.getTargetTxReceiptInterval?.unsubscribe();
    this.getTargetTxReceiptInterval = interval(5000).subscribe(() => {
      this.bridgeState
        .getBridgeTxOnNeo3BridgeNeoX(depositId, this.sessionTx.network)
        .subscribe((res: any) => {
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
            this.sessionTx.sourceTxID = hash;
            this.updateSessionBridgeTx();
            if (this.bridgeProgressDialogRef?.componentInstance) {
              this.bridgeProgressDialogRef.componentInstance.data.sourceTxID =
                hash;
            }
            this.getSourceTxReceiptInterval.unsubscribe();
            const nonce = new BigNumber(res.logs[0].topics[1]).toNumber();
            this.waitNeoXTargetTxComplete(nonce);
          }
        });
    });
  }

  private waitNeoXTargetTxComplete(nonce: number) {
    this.getTargetTxReceiptInterval?.unsubscribe();
    this.getTargetTxReceiptInterval = interval(3000).subscribe(() => {
      this.bridgeState
        .getBridgeTxOnNeoXBridgeNeo3(nonce, this.sessionTx.network)
        .subscribe((res: any) => {
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
