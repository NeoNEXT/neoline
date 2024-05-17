import { Component, OnDestroy, OnInit } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { ChromeService, AssetEVMState, DappEVMState } from '@/app/core';
import {
  EvmTransactionParams,
  EvmTransactionType,
  RpcNetwork,
  STORAGE_NAME,
} from '../../_lib';
import { ETH_SOURCE_ASSET_HASH, EvmWalletJSON } from '../../_lib/evm';
import BigNumber from 'bignumber.js';
import { NeoXFeeInfoProp } from '../../transfer/create/interface';
import { ERRORS } from '@/models/dapi';
import { requestTargetEVM } from '@/models/evm';
import { Unsubscribable } from 'rxjs';
import { Store } from '@ngrx/store';
import { AppState } from '@/app/reduers';
import { ethers } from 'ethers';

@Component({
  templateUrl: './evm-send-tx.component.html',
})
export class PopupNoticeEvmSendTxComponent implements OnInit, OnDestroy {
  EvmTransactionType = EvmTransactionType;
  invokeArgsArray = {};
  txParams: EvmTransactionParams;
  messageID: string;
  locationOrigin: string;
  loading = false;

  methodName: string;
  amount: string;
  neoXFeeInfo: NeoXFeeInfoProp;
  signAddressGasBalance: string;
  estimateGasError = false;
  insufficientFunds = false;

  private accountSub: Unsubscribable;
  neoXWalletArr: EvmWalletJSON[];
  neoXNetwork: RpcNetwork;
  constructor(
    private aRoute: ActivatedRoute,
    private chrome: ChromeService,
    private assetEVMState: AssetEVMState,
    private dappEVMState: DappEVMState,
    private store: Store<AppState>
  ) {
    const account$ = this.store.select('account');
    this.accountSub = account$.subscribe((state) => {
      this.neoXWalletArr = state.neoXWalletArr;
      this.neoXNetwork = state.neoXNetworks[state.neoXNetworkIndex];
    });
  }

  ngOnInit(): void {
    this.aRoute.queryParams.subscribe(({ messageID, origin }) => {
      this.messageID = messageID;
      this.locationOrigin = origin;
      this.chrome
        .getStorage(STORAGE_NAME.InvokeArgsArray)
        .subscribe(async (invokeArgsArray) => {
          this.invokeArgsArray = invokeArgsArray;
          this.txParams = this.invokeArgsArray[this.messageID];
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

  updateEvmFee($event) {
    this.neoXFeeInfo = $event;
    this.checkBalance();
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

  async confirm() {
    this.loading = true;
    const { maxFeePerGas, maxPriorityFeePerGas, gasLimit, gasPrice } =
      this.neoXFeeInfo;

    const newParams = {
      ...this.txParams,
      maxFeePerGas: maxFeePerGas
        ? BigInt(new BigNumber(maxFeePerGas).shiftedBy(18).toFixed(0, 1))
        : undefined,
      maxPriorityFeePerGas: maxPriorityFeePerGas
        ? BigInt(
            new BigNumber(maxPriorityFeePerGas).shiftedBy(18).toFixed(0, 1)
          )
        : undefined,
      gasPrice: gasPrice
        ? BigInt(new BigNumber(gasPrice).shiftedBy(18).toFixed(0, 1))
        : undefined,
      gasLimit: BigInt(new BigNumber(gasLimit).toFixed(0, 1)),
      value: this.txParams.value
        ? BigInt(new BigNumber(this.txParams.value).toFixed(0, 1))
        : undefined,
    };
    const PreExecutionParams = {
      ...this.txParams,
      maxFeePerGas: maxFeePerGas
        ? '0x' + new BigNumber(maxFeePerGas).shiftedBy(18).toString(16)
        : undefined,
      maxPriorityFeePerGas: maxPriorityFeePerGas
        ? '0x' + new BigNumber(maxPriorityFeePerGas).shiftedBy(18).toString(16)
        : undefined,
      gasPrice: gasPrice
        ? '0x' + new BigNumber(gasPrice).shiftedBy(18).toString(16)
        : undefined,
      gas: '0x' + new BigNumber(gasLimit).toString(16),
      value: this.txParams.value,
    };

    const pwd = await this.chrome.getPassword();
    const encryptWallet = this.neoXWalletArr.find(
      (item) => item.accounts[0].address === this.txParams.from
    );
    const wallet = await ethers.Wallet.fromEncryptedJson(
      JSON.stringify(encryptWallet),
      pwd
    );

    this.assetEVMState
      .sendDappTransaction(PreExecutionParams, newParams, wallet.privateKey)
      .then((res) => {
        console.log(res);
        this.loading = false;
      });
  }

  private async initData() {
    // method
    const { type } = await this.dappEVMState.determineTransactionType(
      this.txParams
    );
    this.methodName = type;
    console.log(type);

    const { from, value } = this.txParams;
    // send amount
    if (this.txParams.value) {
      this.amount = new BigNumber(value).shiftedBy(-18).toFixed();
    }

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
      networkGasLimit = await this.assetEVMState.estimateGas(this.txParams);
    } catch (error) {
      this.estimateGasError = true;
      networkGasLimit = BigInt(42750000);
    }

    const {
      gasPrice: networkGasPrice,
      maxFeePerGas: networkMaxFeePerGas,
      maxPriorityFeePerGas: networkMaxPriorityFeePerGas,
    } = await this.assetEVMState.getGasInfo(networkGasLimit).toPromise();
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
  }
}
