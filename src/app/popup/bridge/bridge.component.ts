import {
  AssetEVMState,
  AssetState,
  GlobalService,
  NotificationService,
  BridgeState,
  TransactionState,
} from '@/app/core';
import { Asset } from '@/models/models';
import { Component, OnDestroy } from '@angular/core';
import {
  ChainType,
  EvmTransactionParams,
  GAS3_CONTRACT,
  RpcNetwork,
} from '../_lib';
import { ETH_SOURCE_ASSET_HASH, EvmWalletJSON } from '../_lib/evm';
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
import { MatDialog } from '@angular/material/dialog';
import { PopupSelectAddressDialogComponent } from '../_dialogs';

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

@Component({
  templateUrl: 'bridge.component.html',
  styleUrls: ['bridge.component.scss'],
})
export class PopupBridgeComponent implements OnDestroy {
  showConfirmPage = false;
  keepDecimals = 8;

  bridgeAsset: Asset;
  bridgeAmount: string;
  fromChain: string;
  toChain: string;
  toAddress: string;

  getSourceTxReceiptInterval;
  getTargetTxReceiptInterval;
  sourceTxID: string;
  targetTxID: string;
  sourceTxLoading = false;
  targetTxLoading = false;
  loading = false;

  // neo3
  networkFee: string;
  sourceNetworkFee: string;
  systemFee: string;
  unSignedTx: Transaction;
  priorityFee = '0.0001';
  invokeArgs: ContractCall[];
  signers: SignerLike[];

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
    }
    if (this.chainType === 'NeoX') {
      this.fromChain = 'Neo X';
      this.toChain = 'Neo N3';
      this.bridgeAsset = NeoXGasAsset;
    }
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
      !isNaN(Number(this.bridgeAmount)) &&
      new BigNumber(this.bridgeAmount).comparedTo(1.1) >= 0
    ) {
      return new BigNumber(this.bridgeAmount).minus(0.1).dp(8, 1).toFixed();
    }
    return '-';
  }

  private async calculateNeoXFee() {
    let value: string;
    if (!isNaN(Number(this.bridgeAmount))) {
      value = new BigNumber(this.bridgeAmount)
        .shiftedBy(this.bridgeAsset.decimals)
        .toFixed(0, 1);
    } else {
      value = new BigNumber(this.bridgeAsset.balance)
        .shiftedBy(this.bridgeAsset.decimals)
        .toFixed(0, 1);
    }

    const data = this.bridgeState.getWithdrawData({
      asset: NeoXGasAsset,
      toScriptHash: wallet.getScriptHashFromAddress(this.toAddress),
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

    let amount: string;
    if (!isNaN(Number(this.bridgeAmount))) {
      amount = new BigNumber(this.bridgeAmount)
        .shiftedBy(this.bridgeAsset.decimals)
        .toFixed(0, 1);
    } else {
      amount = new BigNumber(this.bridgeAsset.balance)
        .shiftedBy(this.bridgeAsset.decimals)
        .toFixed(0, 1);
    }

    this.invokeArgs = [
      {
        operation: 'transfer',
        scriptHash: GAS3_CONTRACT,
        args: [
          sc.ContractParam.hash160(fromAddress),
          sc.ContractParam.hash160(
            this.bridgeState.neo3ReceiveAddressOnNeo3BridgeNeoX
          ),
          sc.ContractParam.integer(amount),
          sc.ContractParam.fromJson({ type: 'Hash160', value: this.toAddress }),
        ],
      },
    ];
    this.signers = [
      { account: wallet.getScriptHashFromAddress(fromAddress), scopes: 1 },
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
          this.sourceNetworkFee = new BigNumber(this.networkFee)
            .minus(this.priorityFee)
            .toFixed();
          return { networkFee: this.networkFee, systemFee: this.systemFee };
        })
      );
  }

  async bridgeAll() {
    if (this.chainType === 'Neo3') {
      this.calculateNeoN3Fee().subscribe((res) => {
        const tAmount = new BigNumber(this.bridgeAsset.balance)
          .minus(res.systemFee)
          .minus(res.networkFee);
        if (tAmount.comparedTo(0) > 0) {
          this.bridgeAmount = tAmount
            .dp(this.bridgeAsset.decimals, 1)
            .toFixed();
        } else {
          this.globalService.snackBarTip('balanceLack');
        }
      });
    } else {
      await this.calculateNeoXFee();
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

  async confirm() {
    if (this.getActualReceive() === '-') {
      this.globalService.snackBarTip(
        `Deposit amount shouldn't be less than 1.1 GAS`
      );
      return;
    }
    if (
      new BigNumber(this.bridgeAmount).comparedTo(this.bridgeAsset.balance) > 0
    ) {
      this.globalService.snackBarTip('balanceLack');
      return;
    }

    this.loading = true;
    if (this.chainType === 'Neo3') {
      this.calculateNeoN3Fee().subscribe((res) => {
        const tAmount = new BigNumber(this.bridgeAsset.balance)
          .minus(this.bridgeAmount)
          .minus(res.systemFee)
          .minus(res.networkFee);
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
      this.resetData();
      if (event.chain === 'Neo3') {
        this.waitNeo3SourceTxComplete(event.hash);
      }
      if (event.chain === 'NeoX') {
        this.waitNeoXSourceTxComplete(event.hash);
      }
    }
  }

  selectToAddress() {
    const chain: ChainType = this.chainType === 'Neo3' ? 'NeoX' : 'Neo3';
    this.dialog
      .open(PopupSelectAddressDialogComponent, {
        panelClass: 'custom-dialog-panel',
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

  //#region neo3
  private waitNeo3SourceTxComplete(hash: string) {
    this.sourceTxLoading = true;
    this.getSourceTxReceiptInterval?.unsubscribe();
    this.getSourceTxReceiptInterval = interval(3000).subscribe(() => {
      this.transactionState.getApplicationLog(hash).subscribe((res) => {
        console.log(res);
        this.sourceTxID = hash;
        this.sourceTxLoading = false;
        this.getSourceTxReceiptInterval.unsubscribe();
        const notifications = res.executions[0].notifications;
        const notifi = notifications.find(
          (item) => item.eventname === 'Deposit'
        );
        const depositId = notifi.state.value[0].value;
        console.log(depositId);
        this.waitNeo3TargetTxComplete(depositId);
      });
    });
  }

  private waitNeo3TargetTxComplete(depositId: number) {
    this.targetTxLoading = true;
    this.getTargetTxReceiptInterval?.unsubscribe();
    this.getTargetTxReceiptInterval = interval(5000).subscribe(() => {
      this.bridgeState
        .getBridgeTxOnNeo3BridgeNeoX(depositId)
        .subscribe((res: any) => {
          console.log(res);
          if (res.txid) {
            this.targetTxID = res.txid;
            this.targetTxLoading = false;
            this.getTargetTxReceiptInterval.unsubscribe();
          }
        });
    });
  }
  //#endregion

  //#region neox
  private waitNeoXSourceTxComplete(hash: string) {
    this.sourceTxLoading = true;
    this.getSourceTxReceiptInterval?.unsubscribe();
    this.getSourceTxReceiptInterval = interval(3000).subscribe(() => {
      this.bridgeState.getTransactionReceipt(hash).then((res) => {
        if (res) {
          console.log(res);
          this.sourceTxID = hash;
          this.sourceTxLoading = false;
          this.getSourceTxReceiptInterval.unsubscribe();
          const nonce = this.bridgeState.getWithdrawNonce({
            asset: this.bridgeAsset,
            data: res.logs[0].data,
            topics: res.logs[0].topics,
          });
          console.log(nonce);
          this.waitNeoXTargetTxComplete(nonce);
        }
      });
    });
  }

  private waitNeoXTargetTxComplete(nonce: number) {
    this.targetTxLoading = true;
    this.getTargetTxReceiptInterval?.unsubscribe();
    this.getTargetTxReceiptInterval = interval(3000).subscribe(() => {
      this.bridgeState
        .getBridgeTxOnNeoXBridgeNeo3(nonce)
        .subscribe((res: any) => {
          console.log(res);
          if (res.result) {
            this.targetTxID = res.result.txid;
            this.targetTxLoading = false;
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
