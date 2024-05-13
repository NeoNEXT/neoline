import { Component, OnDestroy, OnInit } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import {
  ChromeService,
  LedgerService,
  AssetEVMState,
  DappEVMState,
} from '@/app/core';
import { MatDialog } from '@angular/material/dialog';
import { RpcNetwork } from '../../_lib/type';
import { EvmTransactionParams, STORAGE_NAME } from '../../_lib';
import { Store } from '@ngrx/store';
import { AppState } from '@/app/reduers';
import { Unsubscribable } from 'rxjs';
import { ETH_SOURCE_ASSET_HASH, EvmWalletJSON } from '../../_lib/evm';
import { ERRORS } from '@/models/dapi';
import { requestTargetEVM } from '@/models/evm';
import BigNumber from 'bignumber.js';
import { NeoXFeeInfoProp } from '../../transfer/create/interface';

type TabType = 'details' | 'data';

@Component({
  templateUrl: './evm-send-tx.component.html',
  styleUrls: ['./evm-send-tx.component.scss'],
})
export class PopupNoticeEvmSendTxComponent implements OnInit, OnDestroy {
  ETH_SOURCE_ASSET_HASH = ETH_SOURCE_ASSET_HASH;
  tabType: TabType = 'details';
  invokeArgsArray = {};
  txParams: EvmTransactionParams;
  messageID: string;
  loading = false;
  canSend = false;

  methodName: string;
  amount: string;
  neoXFeeInfo: NeoXFeeInfoProp;
  signAddressGasBalance: string;

  private accountSub: Unsubscribable;
  neoXWalletArr: EvmWalletJSON[];
  neoXNetwork: RpcNetwork;
  constructor(
    private aRoute: ActivatedRoute,
    private chrome: ChromeService,
    private dialog: MatDialog,
    private ledger: LedgerService,
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
    this.aRoute.queryParams.subscribe(({ messageID }) => {
      this.messageID = messageID;
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
      this.exit();
    };
  }

  ngOnDestroy(): void {
    this.accountSub?.unsubscribe();
  }

  updateEvmFee($event) {
    this.neoXFeeInfo = $event;
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

  confirm() {}

  private async initData() {
    // method
    const { type } = await this.dappEVMState.determineTransactionType(
      this.txParams
    );
    this.methodName = type;

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
      baseFeePerGas: networkBaseFeePerGas,
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

    if (gasPrice) {
      const estimateGas = new BigNumber(newGasLimit)
        .times(newGasPrice)
        .toFixed();
      this.neoXFeeInfo = {
        gasLimit: newGasLimit,
        gasPrice: newGasPrice,
        estimateGas,
      };
    } else if (maxFeePerGas) {
      const estimateGas = new BigNumber(newMaxFeePerGas)
        .times(newGasLimit)
        .toFixed();
      const newBaseFeePerGas = new BigNumber(newMaxFeePerGas)
        .minus(newMaxPriorityFeePerGas)
        .dividedBy(2)
        .dp(18)
        .toFixed();
      this.neoXFeeInfo = {
        gasLimit: newGasLimit,
        maxFeePerGas: newMaxFeePerGas,
        maxPriorityFeePerGas: newMaxPriorityFeePerGas,
        baseFeePerGas: newBaseFeePerGas,
        estimateGas,
      };
    } else {
      const maxFeePerGasBN = new BigNumber(networkBaseFeePerGas)
        .times(2)
        .plus(newMaxPriorityFeePerGas)
        .toFixed();
      const estimateGas = new BigNumber(maxFeePerGasBN)
        .times(newGasLimit)
        .toFixed();
      this.neoXFeeInfo = {
        gasLimit: newGasLimit,
        maxPriorityFeePerGas: newMaxPriorityFeePerGas,
        baseFeePerGas: networkBaseFeePerGas,
        maxFeePerGas: maxFeePerGasBN,
        estimateGas,
      };
    }
  }
}
