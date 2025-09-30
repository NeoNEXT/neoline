import { Component, Inject, OnInit } from '@angular/core';
import {
  MatDialog,
  MatDialogRef,
  MAT_DIALOG_DATA,
} from '@angular/material/dialog';
import { Transaction, TransactionStatus } from '@/models/models';
import {
  ETH_SOURCE_ASSET_HASH,
  EvmWalletJSON,
  RpcNetwork,
  STORAGE_NAME,
} from '../../_lib';
import { NeoXFeeInfoProp } from '../../transfer/create/interface';
import { ChromeService, EvmTxService, GlobalService } from '@/app/core';
import { ethers } from 'ethers';
import { PopupTransferSuccessDialogComponent } from '../transfer-success/transfer-success.component';
import BigNumber from 'bignumber.js';

@Component({
  templateUrl: 'speed-up-fee.dialog.html',
  styleUrls: ['speed-up-fee.dialog.scss'],
})
export class PopupSpeedUpFeeDialogComponent implements OnInit {
  loading = false;
  confirmNewParams;
  private confirmPreExecutionParams;
  showHardwareSign = false;
  neoXFeeInfo: NeoXFeeInfoProp;
  sendNeoXFeeInfo: NeoXFeeInfoProp;

  createTxParams;
  customNeoXFeeInfo: NeoXFeeInfoProp;
  constructor(
    private dialogRef: MatDialogRef<PopupSpeedUpFeeDialogComponent>,
    private chrome: ChromeService,
    private globalService: GlobalService,
    private dialog: MatDialog,
    private evmTxService: EvmTxService,
    @Inject(MAT_DIALOG_DATA)
    public data: {
      tx: Transaction;
      isSpeedUp: boolean;
      network: RpcNetwork;
      currentWallet: EvmWalletJSON;
    }
  ) {}

  ngOnInit(): void {
    if (this.data.isSpeedUp) {
      this.createTxParams = this.data.tx.txParams;
    } else {
      this.createTxParams = {
        from: this.data.currentWallet.accounts[0].address,
        to: this.data.currentWallet.accounts[0].address,
        value: '0',
      };
    }
  }

  updateEvmFee($event) {
    this.neoXFeeInfo = $event;
    this.getGasFee();
  }

  private getGasFee() {
    const latestTx = this.data.tx.history[this.data.tx.history.length - 1];
    let newFeeInfo = Object.assign({}, this.neoXFeeInfo);
    if (
      new BigNumber(latestTx.neoXFeeInfo.maxFeePerGas)
        .times(1.1)
        .comparedTo(this.neoXFeeInfo.maxFeePerGas) > 0
    ) {
      newFeeInfo.maxFeePerGas = new BigNumber(latestTx.neoXFeeInfo.maxFeePerGas)
        .times(1.1)
        .toFixed(18, 0);
    }
    if (
      new BigNumber(latestTx.neoXFeeInfo.maxPriorityFeePerGas)
        .times(1.1)
        .comparedTo(this.neoXFeeInfo.maxPriorityFeePerGas) > 0
    ) {
      newFeeInfo.maxPriorityFeePerGas = new BigNumber(
        latestTx.neoXFeeInfo.maxPriorityFeePerGas
      )
        .times(1.1)
        .toFixed(18, 0);
    }
    if (
      new BigNumber(latestTx.neoXFeeInfo.gasPrice)
        .times(1.1)
        .comparedTo(this.neoXFeeInfo.gasPrice) > 0
    ) {
      newFeeInfo.gasPrice = new BigNumber(latestTx.neoXFeeInfo.gasPrice)
        .times(1.1)
        .toFixed(18, 0);
    }
    this.customNeoXFeeInfo = newFeeInfo;
  }

  async confirm() {
    this.sendNeoXFeeInfo = Object.assign({}, this.neoXFeeInfo);
    const { newParams, PreExecutionParams } = this.evmTxService.getTxParams(
      this.createTxParams,
      this.sendNeoXFeeInfo,
      this.data.tx.nonce,
      this.data.currentWallet.accounts[0].address
    );

    this.confirmNewParams = newParams;
    this.confirmPreExecutionParams = PreExecutionParams;
    delete this.confirmNewParams.from;
    if (this.data.currentWallet.accounts[0].extra.ledgerSLIP44) {
      this.showHardwareSign = true;
      return;
    }

    this.loading = true;
    const pwd = await this.chrome.getPassword();
    const wallet = await ethers.Wallet.fromEncryptedJson(
      JSON.stringify(this.data.currentWallet),
      pwd
    );
    this.evmTxService
      .sendDappTransaction(PreExecutionParams, newParams, wallet.privateKey)
      .then((tx) => {
        this.loading = false;
        this.updateLocalTx(tx.hash);
        this.dialogRef.close(true);
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

  updateLocalTx(txId: string) {
    const networkName = `NeoX-${this.data.network.id}`;
    const address = this.data.currentWallet.accounts[0].address;
    const assetId = this.data.tx.asset_id ?? ETH_SOURCE_ASSET_HASH;
    this.chrome.getStorage(STORAGE_NAME.transaction).subscribe(async (res) => {
      const txs: Transaction[] = res[networkName][address][assetId];
      const index = txs.findIndex((tx) => tx.nonce === this.data.tx.nonce);
      txs[index].txid = txId;
      txs[index].status = this.data.isSpeedUp
        ? TransactionStatus.Accelerating
        : TransactionStatus.Canceling;
      txs[index].history.push({
        txId,
        time: Math.floor(new Date().getTime() / 1000),
        neoXFeeInfo: this.sendNeoXFeeInfo,
        type: this.data.isSpeedUp ? 'speedUp' : 'cancel',
      });
      this.chrome.setStorage(STORAGE_NAME.transaction, res);
    });
  }

  handleHardwareSignedTx(tx) {
    this.showHardwareSign = false;
    if (tx) {
      this.ledgerSendTx(tx, this.confirmPreExecutionParams);
    }
  }

  private ledgerSendTx(signedTx, PreExecutionParams) {
    this.evmTxService
      .sendTransactionByRPC(signedTx, PreExecutionParams)
      .then((txHash) => {
        this.loading = false;
        this.updateLocalTx(txHash);
        this.dialogRef.close(true);
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
}
