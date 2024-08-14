import { Component, OnDestroy, OnInit } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import {
  ChromeService,
  AssetEVMState,
  DappEVMState,
  GlobalService,
  LedgerService,
  SettingState,
  AssetState,
} from '@/app/core';
import {
  AddressNonceInfo,
  EvmTransactionParams,
  EvmTransactionType,
  LedgerStatuses,
  RpcNetwork,
  STORAGE_NAME,
} from '../../_lib';
import { ETH_SOURCE_ASSET_HASH, EvmWalletJSON } from '../../_lib/evm';
import BigNumber from 'bignumber.js';
import { NeoXFeeInfoProp } from '../../transfer/create/interface';
import { ERRORS } from '@/models/dapi';
import { requestTargetEVM } from '@/models/evm';
import { Unsubscribable, interval } from 'rxjs';
import { Store } from '@ngrx/store';
import { AppState } from '@/app/reduers';
import { ethers } from 'ethers';
import { PopupTransferSuccessDialogComponent } from '../../_dialogs';
import { MatDialog } from '@angular/material/dialog';
import { Transaction } from '@/models/models';

export interface RateType {
  fee: string;
  amount: string;
  total: string;
  rateCurrency: string;
}

@Component({
  templateUrl: './evm-send-tx.component.html',
})
export class PopupNoticeEvmSendTxComponent implements OnInit, OnDestroy {
  EvmTransactionType = EvmTransactionType;
  invokeArgsArray = {};
  txParams: EvmTransactionParams;
  messageID: string;
  locationOrigin: string;
  iconSrc = '';
  lang = 'en';
  nonceInfo: AddressNonceInfo;
  customNonce: number;
  rate: RateType = { fee: '', amount: '', total: '', rateCurrency: '' };

  sendAssetDetail;

  loading = false;
  loadingMsg: string;
  getStatusInterval;
  encryptWallet: EvmWalletJSON;

  methodName: string;
  amount: string;
  neoXFeeInfo: NeoXFeeInfoProp;
  signAddressGasBalance: string;
  estimateGasError = false;
  insufficientFunds = false;
  approveNewTxParams: EvmTransactionParams;

  private accountSub: Unsubscribable;
  neoXWalletArr: EvmWalletJSON[];
  neoXNetwork: RpcNetwork;
  constructor(
    private aRoute: ActivatedRoute,
    private chrome: ChromeService,
    private assetEVMState: AssetEVMState,
    private dappEVMState: DappEVMState,
    private dialog: MatDialog,
    private globalService: GlobalService,
    private ledger: LedgerService,
    private settingState: SettingState,
    private assetState: AssetState,
    private store: Store<AppState>
  ) {
    const account$ = this.store.select('account');
    this.accountSub = account$.subscribe((state) => {
      this.neoXWalletArr = state.neoXWalletArr;
      this.neoXNetwork = state.neoXNetworks[state.neoXNetworkIndex];
    });
    this.settingState.langSub.subscribe((lang) => {
      this.lang = lang;
    });
  }

  ngOnInit(): void {
    this.settingState.rateCurrencySub.subscribe((res) => {
      this.rate.rateCurrency = res;
    });
    this.aRoute.queryParams.subscribe(({ messageID, origin, icon }) => {
      this.messageID = messageID;
      this.locationOrigin = origin;
      this.iconSrc =
        this.locationOrigin.indexOf('flamingo') >= 0
          ? '/assets/images/flamingo.ico'
          : icon;
      this.chrome
        .getStorage(STORAGE_NAME.InvokeArgsArray)
        .subscribe(async (invokeArgsArray) => {
          this.invokeArgsArray = invokeArgsArray;
          this.txParams = this.invokeArgsArray[this.messageID];
          if (!this.txParams) {
            return;
          }
          this.initData();
        });
    });
    window.onbeforeunload = () => {
      if (this.chrome.check) {
        delete this.invokeArgsArray[this.messageID];
        this.chrome.setStorage(
          STORAGE_NAME.InvokeArgsArray,
          this.invokeArgsArray
        );
      }
    };
  }

  ngOnDestroy(): void {
    this.accountSub?.unsubscribe();
  }

  setAssetDetail(event) {
    this.sendAssetDetail = event;
  }

  updateEvmFee($event) {
    this.neoXFeeInfo = $event;
    this.getAllRate();
    this.checkBalance();
  }

  async updateApproveAmount($event: EvmTransactionParams) {
    this.approveNewTxParams = $event;
    await this.getGasFee();

    this.checkBalance();
  }

  getTxType(): 'sendEther' | 'sendToken' | 'contractInteraction' | 'approve' {
    switch (this.methodName) {
      case EvmTransactionType.simpleSend:
        return 'sendEther';
      case EvmTransactionType.tokenMethodTransfer:
      case EvmTransactionType.tokenMethodTransferFrom:
      case EvmTransactionType.tokenMethodSafeTransferFrom:
        return 'sendToken';
      case EvmTransactionType.contractInteraction:
        return 'contractInteraction';
      case EvmTransactionType.swapApproval:
      case EvmTransactionType.tokenMethodApprove:
      case EvmTransactionType.tokenMethodSetApprovalForAll:
        return 'approve';
    }
  }

  exit() {
    this.chrome.windowCallback(
      {
        error: ERRORS.CANCELLED,
        return: requestTargetEVM.request,
        ID: this.messageID,
      },
      true
    );
  }

  private getTxParams() {
    const currentTxParams =
      this.getTxType() === 'approve' && this.approveNewTxParams
        ? this.approveNewTxParams
        : this.txParams;

    return this.assetEVMState.getTxParams(
      currentTxParams,
      this.neoXFeeInfo,
      this.customNonce ?? this.nonceInfo.nonce,
      this.txParams.from
    );
  }

  async confirm(nonce: number) {
    this.customNonce = nonce;
    this.loading = true;

    const { newParams, PreExecutionParams } = this.getTxParams();
    if (this.encryptWallet.accounts[0].extra.ledgerSLIP44) {
      this.loadingMsg = LedgerStatuses.DISCONNECTED.msg;
      this.getLedgerStatus(PreExecutionParams, newParams);
      this.getStatusInterval = interval(5000).subscribe(() => {
        this.getLedgerStatus(PreExecutionParams, newParams);
      });
      return;
    }

    const pwd = await this.chrome.getPassword();
    const wallet = await ethers.Wallet.fromEncryptedJson(
      JSON.stringify(this.encryptWallet),
      pwd
    );

    this.assetEVMState
      .sendDappTransaction(PreExecutionParams, newParams, wallet.privateKey)
      .then((tx) => {
        this.loading = false;
        this.updateLocalTx(tx.hash, newParams);
        this.chrome.windowCallback({
          data: tx,
          return: requestTargetEVM.request,
          ID: this.messageID,
        });
        this.dialog.open(PopupTransferSuccessDialogComponent, {
          panelClass: 'custom-dialog-panel',
          backdropClass: 'custom-dialog-backdrop',
        });
      })
      .catch((error) => {
        this.loading = false;
        this.globalService.snackBarTip(error);
      });
  }

  updateLocalTx(txId: string, newParams) {
    const networkName = `NeoX-${this.neoXNetwork.id}`;
    const address = this.encryptWallet.accounts[0].address;
    this.chrome.getStorage(STORAGE_NAME.transaction).subscribe(async (res) => {
      if (res === null || res === undefined) {
        res = {};
      }
      if (res[networkName] === undefined) {
        res[networkName] = {};
      }
      if (res[networkName][address] === undefined) {
        res[networkName][address] = {};
      }
      const type = this.getTxType();
      const assetId =
        type === 'sendEther' ? ETH_SOURCE_ASSET_HASH : this.txParams.to;

      if (res[networkName][address][assetId] === undefined) {
        res[networkName][address][assetId] = [];
      }
      let symbol = '';
      let value = '';
      switch (type) {
        case 'approve':
          symbol = this.sendAssetDetail?.symbol;
          break;
        case 'sendEther':
          symbol = this.neoXNetwork.symbol;
          value = this.amount;
          break;
        case 'sendToken':
          symbol = this.sendAssetDetail?.symbol;
          value = this.sendAssetDetail?.tokenAmount;
          break;
      }
      let newTx: Transaction = {
        txid: txId,
        block_time: Math.floor(new Date().getTime() / 1000),
        from: [this.txParams.from],
        to: [this.txParams.to],
        type,
        asset_id: assetId,
        value,
        symbol,
        nonce: newParams.nonce,
        txParams: {
          from: newParams.from,
          to: newParams.to,
          data: newParams.data,
          value: newParams.value ? newParams.value.toString() : newParams.value,
        },
        history: [
          {
            txId,
            time: Math.floor(new Date().getTime() / 1000),
            estimateGas: this.neoXFeeInfo.estimateGas,
            type: 'create',
          },
        ],
      };
      res[networkName][address][assetId].unshift(newTx);
      this.chrome.setStorage(STORAGE_NAME.transaction, res);
    });
  }

  private ledgerSendTx(signedTx, PreExecutionParams, newParams) {
    this.assetEVMState
      .sendTransactionByRPC(signedTx, PreExecutionParams)
      .then((txHash) => {
        this.loading = false;
        this.updateLocalTx(txHash, newParams);
        this.chrome.windowCallback({
          data: txHash,
          return: requestTargetEVM.request,
          ID: this.messageID,
        });
        this.dialog.open(PopupTransferSuccessDialogComponent, {
          panelClass: 'custom-dialog-panel',
          backdropClass: 'custom-dialog-backdrop',
        });
      })
      .catch((error) => {
        this.loading = false;
        this.globalService.snackBarTip(error);
      });
  }

  private async initData() {
    // method
    const { type } = await this.dappEVMState.determineTransactionType(
      this.txParams
    );
    this.methodName = type;

    const { from, value } = this.txParams;

    // get nonce info
    this.assetEVMState.getNonceInfo(from).then((res) => {
      this.nonceInfo = res;
    });

    // send amount
    if (this.txParams.value) {
      this.amount = new BigNumber(value).shiftedBy(-18).toFixed();
      this.assetState
        .getAssetAmountRate({
          chainType: 'NeoX',
          assetId: ETH_SOURCE_ASSET_HASH,
          chainId: this.neoXNetwork.chainId,
          amount: this.amount,
        })
        .then((res) => {
          this.rate.amount = res;
        });
    }

    // from wallet
    this.encryptWallet = this.neoXWalletArr.find(
      (item) =>
        item.accounts[0].address === ethers.getAddress(this.txParams.from)
    );

    // from address SOURCE_ASSET balance
    const balance = await this.assetEVMState.getNeoXAddressAssetBalance(
      from,
      ETH_SOURCE_ASSET_HASH
    );
    this.signAddressGasBalance = new BigNumber(balance)
      .shiftedBy(-18)
      .toFixed();

    // fee info
    await this.getGasFee();

    this.checkBalance();
  }

  private checkBalance() {
    if (
      new BigNumber(this.amount ?? 0)
        .plus(this.neoXFeeInfo.estimateGas)
        .comparedTo(this.signAddressGasBalance) > 0
    ) {
      this.insufficientFunds = true;
    } else {
      this.insufficientFunds = false;
    }
  }

  private async getGasFee() {
    const { gas, gasPrice, maxFeePerGas, maxPriorityFeePerGas } = this.txParams;

    let networkGasLimit: bigint;
    try {
      networkGasLimit = await this.assetEVMState.estimateGas(
        this.getTxType() === 'approve' && this.approveNewTxParams
          ? this.approveNewTxParams
          : this.txParams
      );
    } catch (error) {
      this.estimateGasError = true;
      networkGasLimit = BigInt(42750000);
    }

    const {
      gasPrice: networkGasPrice,
      maxFeePerGas: networkMaxFeePerGas,
      maxPriorityFeePerGas: networkMaxPriorityFeePerGas,
    } = await this.assetEVMState.getGasInfo(networkGasLimit);
    const newGasLimit: string = gas
      ? new BigNumber(gas, 16).toFixed()
      : networkGasLimit.toString();

    const newGasPrice = gasPrice
      ? new BigNumber(gasPrice, 16).shiftedBy(-18).toFixed()
      : networkGasPrice;

    const newMaxFeePerGas = maxFeePerGas
      ? new BigNumber(maxFeePerGas, 16).shiftedBy(-18).toFixed()
      : networkMaxFeePerGas;

    const newMaxPriorityFeePerGas = maxPriorityFeePerGas
      ? new BigNumber(maxPriorityFeePerGas, 16).shiftedBy(-18).toFixed()
      : networkMaxPriorityFeePerGas;
    const calculateLegacyFee = () => {
      const estimateGas = new BigNumber(newGasLimit)
        .times(newGasPrice)
        .toFixed();
      this.neoXFeeInfo = {
        gasLimit: newGasLimit,
        gasPrice: newGasPrice,
        estimateGas,
      };
    };

    const calculateEIP1559Fee = () => {
      const bigMaxFeePerGas =
        new BigNumber(newMaxFeePerGas).comparedTo(newMaxPriorityFeePerGas) > 0
          ? newMaxFeePerGas
          : newMaxPriorityFeePerGas;
      const estimateGas = new BigNumber(bigMaxFeePerGas)
        .times(newGasLimit)
        .toFixed();
      this.neoXFeeInfo = {
        gasLimit: newGasLimit,
        maxFeePerGas: bigMaxFeePerGas,
        maxPriorityFeePerGas: newMaxPriorityFeePerGas,
        estimateGas,
      };
    };

    if (gasPrice) {
      calculateLegacyFee();
    } else if (networkMaxFeePerGas) {
      calculateEIP1559Fee();
    } else {
      calculateLegacyFee();
    }
    this.getAllRate();
  }

  getAllRate() {
    this.assetState
      .getAssetRateV2('NeoX', ETH_SOURCE_ASSET_HASH, this.neoXNetwork.chainId)
      .then((res) => {
        if (res) {
          this.rate.fee = res.times(this.neoXFeeInfo.estimateGas).toFixed(2);
          const total = new BigNumber(this.neoXFeeInfo.estimateGas).plus(
            this.amount
          );
          this.rate.total = res.times(total).toFixed(2);
        }
      });
  }

  private getLedgerStatus(PreExecutionParams, newParams) {
    this.ledger.getDeviceStatus('NeoX').then(async (res) => {
      this.loadingMsg = LedgerStatuses[res].msgNeoX || LedgerStatuses[res].msg;
      if (LedgerStatuses[res] === LedgerStatuses.READY) {
        this.getStatusInterval.unsubscribe();
        this.loadingMsg = 'signTheTransaction';

        delete newParams.from;
        this.ledger
          .getLedgerSignedTx(newParams as any, this.encryptWallet, 'NeoX')
          .then((tx) => {
            this.loading = false;
            this.ledgerSendTx(tx, PreExecutionParams, newParams);
          })
          .catch((error) => {
            this.loading = false;
            this.loadingMsg = '';
            this.ledger.handleLedgerError(error);
          });
      }
    });
  }
}
