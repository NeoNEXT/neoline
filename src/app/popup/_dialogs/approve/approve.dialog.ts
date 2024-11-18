import { Asset } from '@/models/models';
import { Component, Inject, OnInit } from '@angular/core';
import { MatDialogRef, MAT_DIALOG_DATA } from '@angular/material/dialog';
import BigNumber from 'bignumber.js';
import { NeoXFeeInfoProp } from '../../transfer/create/interface';
import {
  AddressNonceInfo,
  ETH_SOURCE_ASSET_HASH,
  EvmTransactionParams,
  EvmWalletJSON,
  LedgerStatuses,
  RpcNetwork,
} from '../../_lib';
import { Unsubscribable, timer, interval } from 'rxjs';
import {
  AssetEVMState,
  AssetState,
  ChromeService,
  GlobalService,
  LedgerService,
} from '@/app/core';
import { ethers } from 'ethers';

@Component({
  templateUrl: './approve.dialog.html',
  styleUrls: ['./approve.dialog.scss'],
})
export class PopupApproveDialogComponent implements OnInit {
  inputAmount = '';
  inputAmountIsBig = false;
  initTip = true;
  private inputAmountSub: Unsubscribable;
  neoXFeeInfo: NeoXFeeInfoProp;
  showDetail = false;
  nonceInfo: AddressNonceInfo;
  customNonce: number;
  txParams: EvmTransactionParams;
  rate: string;
  estimateGasError = false;
  insufficientFunds = false;
  private fromAddress: string;

  loading = false;
  loadingMsg: string;
  getStatusInterval;

  constructor(
    private assetEVMState: AssetEVMState,
    private assetState: AssetState,
    private chrome: ChromeService,
    private ledger: LedgerService,
    private globalService: GlobalService,
    private dialogRef: MatDialogRef<PopupApproveDialogComponent>,
    @Inject(MAT_DIALOG_DATA)
    public data: {
      asset: Asset;
      encryptWallet: EvmWalletJSON;
      spender: string;
      amount: string;
      lang: string;
      rateCurrency: string;
      neoXNetwork: RpcNetwork;
    }
  ) {}
  ngOnInit(): void {
    this.fromAddress = this.data.encryptWallet.accounts[0].address;
    this.inputAmount = this.data.amount;
    this.assetEVMState.getNonceInfo(this.fromAddress).then((res) => {
      this.nonceInfo = res;
    });
    this.getTxParams();
  }

  private getTxParams() {
    if (!this.inputAmount) return;
    const amount = new BigNumber(this.inputAmount).toFixed();
    const approveData = this.assetEVMState.getApproveERC20Data({
      assetAddress: this.data.asset.asset_id,
      toAddress: this.data.spender,
      approveAmount: ethers.parseUnits(amount, this.data.asset.decimals),
    });
    this.txParams = {
      from: this.fromAddress,
      to: this.data.asset.asset_id,
      data: approveData,
    };
  }

  useDappApproveAmount() {
    this.inputAmount = this.data.amount;
    this.checkInputAmountIsBig();
    this.initTip = false;
  }

  useMaxApproveAmount() {
    this.inputAmount = this.data.asset.balance;
    this.inputAmountIsBig = false;
    this.initTip = false;
  }

  handleInputAmountChange(event) {
    const value = event.target.value;
    let regex = new RegExp(
      `^\\D*(\\d*(?:\\.\\d{0,${this.data.asset.decimals}})?).*`,
      'g'
    );
    if (this.data.asset.decimals === 0) {
      regex = new RegExp(`^\\D*(\\d*).*`, 'g');
    }
    event.target.value = value.replace(regex, '$1');
    this.inputAmount = event.target.value;

    this.inputAmountSub?.unsubscribe();
    this.inputAmountSub = timer(500).subscribe(() => {
      this.checkInputAmountIsBig();
      this.getTxParams();
      this.initTip = false;
    });
  }

  toExplorer() {
    window.open(
      `${this.data.neoXNetwork.explorer}/address/${this.data.asset.asset_id}`
    );
  }

  updateEvmFee($event) {
    this.neoXFeeInfo = $event;
    this.getGasRate();
    this.checkBalance();
  }

  private getGasRate() {
    this.assetState
      .getAssetRateV2(
        'NeoX',
        ETH_SOURCE_ASSET_HASH,
        this.data.neoXNetwork.chainId
      )
      .then((res) => {
        if (res) {
          this.rate = res.times(this.neoXFeeInfo.estimateGas).toFixed(2);
        }
      });
  }

  private checkBalance() {
    if (!this.neoXFeeInfo) return;
    if (
      new BigNumber(this.neoXFeeInfo.estimateGas).comparedTo(
        this.data.asset.balance
      ) > 0
    ) {
      this.insufficientFunds = true;
    } else {
      this.insufficientFunds = false;
    }
  }

  changeNonce($event) {
    this.customNonce = $event;
  }

  async confirm() {
    this.loading = true;
    const sendTxParams = this.assetEVMState.getTxParams(
      this.txParams,
      this.neoXFeeInfo,
      this.customNonce ?? this.nonceInfo.nonce,
      this.fromAddress
    );
    const { newParams, PreExecutionParams } = sendTxParams;
    if (this.data.encryptWallet.accounts[0].extra.ledgerSLIP44) {
      this.loadingMsg = LedgerStatuses.DISCONNECTED.msg;
      this.getLedgerStatus(PreExecutionParams, newParams);
      this.getStatusInterval = interval(5000).subscribe(() => {
        this.getLedgerStatus(PreExecutionParams, newParams);
      });
      return;
    }

    const pwd = await this.chrome.getPassword();
    const wallet = await ethers.Wallet.fromEncryptedJson(
      JSON.stringify(this.data.encryptWallet),
      pwd
    );

    this.assetEVMState
      .sendDappTransaction(PreExecutionParams, newParams, wallet.privateKey)
      .then((tx) => {
        this.loading = false;
        this.dialogRef.close(tx.hash);
      })
      .catch((error) => {
        this.loading = false;
        this.globalService.snackBarTip(error);
      });
  }

  private checkInputAmountIsBig() {
    this.inputAmountIsBig =
      new BigNumber(this.inputAmount).comparedTo(this.data.asset.balance) > 0
        ? true
        : false;
  }

  private getLedgerStatus(PreExecutionParams, newParams) {
    this.ledger.getDeviceStatus('NeoX').then(async (res) => {
      this.loadingMsg = LedgerStatuses[res].msgNeoX || LedgerStatuses[res].msg;
      if (LedgerStatuses[res] === LedgerStatuses.READY) {
        this.getStatusInterval.unsubscribe();
        this.loadingMsg = 'signTheTransaction';

        delete newParams.from;
        this.ledger
          .getLedgerSignedTx(newParams as any, this.data.encryptWallet, 'NeoX')
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

  private ledgerSendTx(signedTx, PreExecutionParams, newParams) {
    this.assetEVMState
      .sendTransactionByRPC(signedTx, PreExecutionParams)
      .then((txHash) => {
        this.loading = false;
        this.dialogRef.close(txHash);
      })
      .catch((error) => {
        this.loading = false;
        this.globalService.snackBarTip(error);
      });
  }
}
