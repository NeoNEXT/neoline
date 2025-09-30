import { Component, OnDestroy, OnInit } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import {
  ChromeService,
  DappEVMState,
  GlobalService,
  SettingState,
  AssetState,
  EvmAssetService,
  EvmTxService,
  EvmGasService,
} from '@/app/core';
import {
  AddressNonceInfo,
  EvmTransactionParams,
  EvmTransactionType,
  RpcNetwork,
  STORAGE_NAME,
} from '../../_lib';
import { ETH_SOURCE_ASSET_HASH, EvmWalletJSON } from '../../_lib/evm';
import BigNumber from 'bignumber.js';
import { NeoXFeeInfoProp } from '../../transfer/create/interface';
import { requestTargetEVM } from '@/models/evm';
import { Unsubscribable } from 'rxjs';
import { Store } from '@ngrx/store';
import { AppState } from '@/app/reduers';
import { ethers } from 'ethers';
import { PopupTransferSuccessDialogComponent } from '../../_dialogs';
import { MatDialog } from '@angular/material/dialog';
import { Transaction } from '@/models/models';
import { ethErrors } from 'eth-rpc-errors';

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
  confirmNewParams;
  private confirmPreExecutionParams;
  showHardwareSign = false;
  encryptWallet: EvmWalletJSON;

  methodName: string;
  amount: string;
  neoXFeeInfo: NeoXFeeInfoProp;
  siteNeoXFeeInfo: NeoXFeeInfoProp;
  signAddressGasBalance: string;
  estimateGasError = false;
  insufficientFunds = false;
  approveNewTxParams: EvmTransactionParams;
  sendNeoXFeeInfo: NeoXFeeInfoProp;

  private accountSub: Unsubscribable;
  neoXWalletArr: EvmWalletJSON[];
  neoXNetwork: RpcNetwork;
  constructor(
    private aRoute: ActivatedRoute,
    private chrome: ChromeService,
    private dappEVMState: DappEVMState,
    private dialog: MatDialog,
    private globalService: GlobalService,
    private settingState: SettingState,
    private assetState: AssetState,
    private store: Store<AppState>,
    private evmTxService: EvmTxService,
    private evmAssetService: EvmAssetService,
    private evmGasService: EvmGasService
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
        error: ethErrors.provider.userRejectedRequest().serialize(),
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

    this.sendNeoXFeeInfo = Object.assign({}, this.neoXFeeInfo);

    return this.evmTxService.getTxParams(
      currentTxParams,
      this.sendNeoXFeeInfo,
      this.customNonce ?? this.nonceInfo.nonce,
      this.txParams.from
    );
  }

  async confirm(nonce: number) {
    this.customNonce = nonce;

    const { newParams, PreExecutionParams } = this.getTxParams();
    this.confirmNewParams = newParams;
    this.confirmPreExecutionParams = PreExecutionParams;
    delete this.confirmNewParams.from;
    if (this.encryptWallet.accounts[0].extra.ledgerSLIP44) {
      this.showHardwareSign = true;
      return;
    }

    this.loading = true;
    const pwd = await this.chrome.getPassword();
    const wallet = await ethers.Wallet.fromEncryptedJson(
      JSON.stringify(this.encryptWallet),
      pwd
    );

    this.evmTxService
      .sendDappTransaction(PreExecutionParams, newParams, wallet.privateKey)
      .then((tx) => {
        this.loading = false;
        this.updateLocalTx(tx.hash, newParams);
        this.chrome.windowCallback(
          {
            data: tx.hash,
            return: requestTargetEVM.request,
            ID: this.messageID,
          },
          true
        );
        this.dialog.open(PopupTransferSuccessDialogComponent, {
          panelClass: 'custom-dialog-panel',
          backdropClass: 'custom-dialog-backdrop',
        });
      })
      .catch((error) => {
        this.loading = false;
        this.globalService.snackBarTip(error);
        this.chrome.windowCallback(
          {
            data: null,
            return: requestTargetEVM.request,
            ID: this.messageID,
            error: ethErrors.rpc.internal({ message: error }).serialize(),
          },
          true
        );
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
            neoXFeeInfo: this.sendNeoXFeeInfo,
            type: 'create',
          },
        ],
      };
      res[networkName][address][assetId].unshift(newTx);
      this.chrome.setStorage(STORAGE_NAME.transaction, res);
    });
  }

  private ledgerSendTx(signedTx, PreExecutionParams, newParams) {
    this.evmTxService
      .sendTransactionByRPC(signedTx, PreExecutionParams)
      .then((txHash) => {
        this.loading = false;
        this.updateLocalTx(txHash, newParams);
        this.chrome.windowCallback(
          {
            data: txHash,
            return: requestTargetEVM.request,
            ID: this.messageID,
          },
          true
        );
        this.dialog.open(PopupTransferSuccessDialogComponent, {
          panelClass: 'custom-dialog-panel',
          backdropClass: 'custom-dialog-backdrop',
        });
      })
      .catch((error) => {
        this.loading = false;
        this.globalService.snackBarTip(error);
        this.chrome.windowCallback(
          {
            data: null,
            return: requestTargetEVM.request,
            ID: this.messageID,
            error: ethErrors.rpc.internal({ message: error }).serialize(),
          },
          true
        );
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
    this.evmTxService.getNonceInfo(from).then((res) => {
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
    const balance = await this.evmAssetService.getNeoXAddressAssetBalance(
      from,
      ETH_SOURCE_ASSET_HASH
    );
    this.signAddressGasBalance = new BigNumber(balance)
      .shiftedBy(-18)
      .toFixed();

    // fee info
    await this.getSiteGasFee();
  }

  private checkBalance() {
    if (!this.neoXFeeInfo) return;
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

  private async getSiteGasFee() {
    const { gas, gasPrice, maxFeePerGas, maxPriorityFeePerGas } = this.txParams;

    let newGasLimit: string;
    if (gas) {
      newGasLimit = new BigNumber(gas, 16).toFixed();
    } else {
      let networkGasLimit: bigint;
      try {
        networkGasLimit = await this.evmGasService.estimateGas(
          this.getTxType() === 'approve' && this.approveNewTxParams
            ? this.approveNewTxParams
            : this.txParams
        );
      } catch (error) {
        this.estimateGasError = true;
        networkGasLimit = BigInt(42750000);
      }
      newGasLimit = networkGasLimit.toString();
    }
    if (gasPrice) {
      const newGasPrice = new BigNumber(gasPrice, 16).shiftedBy(-18).toFixed();
      const estimateGas = new BigNumber(newGasLimit)
        .times(newGasPrice)
        .toFixed();
      this.siteNeoXFeeInfo = {
        gasLimit: newGasLimit,
        gasPrice: newGasPrice,
        estimateGas,
        custom: true,
      };
      this.updateEvmFee(JSON.parse(JSON.stringify(this.siteNeoXFeeInfo)));
    }
    if (maxFeePerGas) {
      const newMaxFeePerGas = new BigNumber(maxFeePerGas, 16)
        .shiftedBy(-18)
        .toFixed();
      const newMaxPriorityFeePerGas = maxPriorityFeePerGas
        ? new BigNumber(maxPriorityFeePerGas, 16).shiftedBy(-18).toFixed()
        : '0';
      const estimateGas = new BigNumber(newMaxFeePerGas)
        .times(newGasLimit)
        .toFixed();
      this.siteNeoXFeeInfo = {
        gasLimit: newGasLimit,
        maxFeePerGas: newMaxFeePerGas,
        maxPriorityFeePerGas: newMaxPriorityFeePerGas,
        estimateGas,
        custom: true,
      };
      this.updateEvmFee(JSON.parse(JSON.stringify(this.siteNeoXFeeInfo)));
    }
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

  handleHardwareSignedTx(tx) {
    this.showHardwareSign = false;
    if (tx) {
      this.ledgerSendTx(
        tx,
        this.confirmPreExecutionParams,
        this.confirmNewParams
      );
    }
  }
}
