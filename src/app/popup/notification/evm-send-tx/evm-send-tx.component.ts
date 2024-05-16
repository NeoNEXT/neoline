import { Component, OnInit } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { ChromeService, AssetEVMState, DappEVMState } from '@/app/core';
import {
  EvmTransactionParams,
  EvmTransactionType,
  STORAGE_NAME,
} from '../../_lib';
import { ETH_SOURCE_ASSET_HASH } from '../../_lib/evm';
import BigNumber from 'bignumber.js';
import { NeoXFeeInfoProp } from '../../transfer/create/interface';

@Component({
  templateUrl: './evm-send-tx.component.html',
})
export class PopupNoticeEvmSendTxComponent implements OnInit {
  EvmTransactionType = EvmTransactionType;
  invokeArgsArray = {};
  txParams: EvmTransactionParams;
  messageID: string;
  locationOrigin: string;

  methodName: string;
  amount: string;
  neoXFeeInfo: NeoXFeeInfoProp;
  signAddressGasBalance: string;
  constructor(
    private aRoute: ActivatedRoute,
    private chrome: ChromeService,
    private assetEVMState: AssetEVMState,
    private dappEVMState: DappEVMState
  ) {}

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

  private async initData() {
    // method
    const { type } = await this.dappEVMState.determineTransactionType(
      this.txParams
    );
    this.methodName = type;
    console.log(type);

    const { from, value, gas, gasPrice, maxFeePerGas, maxPriorityFeePerGas } =
      this.txParams;
    // send amount
    if (this.txParams.value) {
      this.amount = new BigNumber(value).shiftedBy(-18).toFixed();
    }

    // from address SOURCE_ASSET balance
    this.signAddressGasBalance =
      await this.assetEVMState.getNeoXAddressAssetBalance(
        from,
        ETH_SOURCE_ASSET_HASH
      );
    this.signAddressGasBalance = new BigNumber(this.signAddressGasBalance)
      .shiftedBy(-18)
      .toFixed();

    // fee info
    const {
      gasLimit: networkGasLimit,
      gasPrice: networkGasPrice,
      maxFeePerGas: networkMaxFeePerGas,
      maxPriorityFeePerGas: networkMaxPriorityFeePerGas,
    } = await this.assetEVMState.getDappTXInfo(this.txParams);
    const newGasLimit = gas
      ? new BigNumber(gas, 16).toFixed()
      : networkGasLimit;

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
