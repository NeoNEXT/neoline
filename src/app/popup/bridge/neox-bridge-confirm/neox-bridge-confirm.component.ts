import {
  Component,
  Input,
  Output,
  EventEmitter,
  OnDestroy,
  OnInit,
} from '@angular/core';
import {
  GlobalService,
  LedgerService,
  UtilServiceState,
  ChromeService,
  AssetEVMState,
} from '@/app/core';
import { BigNumber } from 'bignumber.js';
import { Asset } from '@/models/models';
import { ChainType, EvmTransactionParams, LedgerStatuses } from '../../_lib';
import { EvmWalletJSON } from '@/app/popup/_lib/evm';
import { NeoXFeeInfoProp } from '../../transfer/create/interface';
import { ethers } from 'ethers';
import { interval } from 'rxjs';
import { PopupTransferSuccessDialogComponent } from '../../_dialogs';
import { MatDialog } from '@angular/material/dialog';

export type TabType = 'details' | 'data';

@Component({
  selector: 'neox-bridge-confirm',
  templateUrl: 'neox-bridge-confirm.component.html',
  styleUrls: ['../bridge-confirm.scss'],
})
export class NeoXBridgeConfirmComponent implements OnInit, OnDestroy {
  @Input() bridgeAsset: Asset;
  @Input() bridgeAmount: string;
  @Input() toAddress: string;
  @Input() currentWallet: EvmWalletJSON;
  @Input() neoXFeeInfo: NeoXFeeInfoProp;
  @Input() txParams: EvmTransactionParams;

  @Output() backAmount = new EventEmitter<{ hash: string; chain: ChainType }>();

  tabType: TabType = 'details';
  totalAmount: string;
  hexDataLength: number;

  loading = false;
  loadingMsg: string;
  getStatusInterval;

  constructor(
    private global: GlobalService,
    private ledger: LedgerService,
    private dialog: MatDialog,
    private util: UtilServiceState,
    private chrome: ChromeService,
    private assetEVMState: AssetEVMState
  ) {}

  ngOnInit(): void {
    this.calculateTotalAmount();
    this.hexDataLength = this.util.getHexDataLength(this.txParams.data);
  }

  private calculateTotalAmount() {
    this.totalAmount = new BigNumber(this.bridgeAmount)
      .plus(this.neoXFeeInfo.estimateGas)
      .toFixed();
  }

  ngOnDestroy(): void {
    this.getStatusInterval?.unsubscribe();
  }

  back() {
    this.backAmount.emit();
  }

  cancel() {
    history.go(-1);
  }

  updateEvmFee($event) {
    this.neoXFeeInfo = $event;
    this.calculateTotalAmount();
  }

  async confirm() {
    this.loading = true;

    if (this.currentWallet.accounts[0].extra.ledgerSLIP44) {
      this.loadingMsg = LedgerStatuses.DISCONNECTED.msg;
      this.getLedgerStatus();
      this.getStatusInterval = interval(5000).subscribe(() => {
        this.getLedgerStatus();
      });
      return;
    }

    const pwd = await this.chrome.getPassword();
    const wallet = await ethers.Wallet.fromEncryptedJson(
      JSON.stringify(this.currentWallet),
      pwd
    );

    const { newParams, PreExecutionParams } = this.getTxParams();
    this.assetEVMState
      .sendDappTransaction(PreExecutionParams, newParams, wallet.privateKey)
      .then((tx) => {
        this.dialog
          .open(PopupTransferSuccessDialogComponent, {
            panelClass: 'custom-dialog-panel',
          })
          .afterClosed()
          .subscribe(() => {
            this.backAmount.emit({ hash: tx.hash, chain: 'NeoX' });
          });
        this.loading = false;
      })
      .catch((error) => {
        this.loading = false;
        this.global.snackBarTip(error);
      });
  }

  private ledgerSendTx(signedTx) {
    const { PreExecutionParams } = this.getTxParams();
    this.assetEVMState
      .sendTransactionByRPC(signedTx, PreExecutionParams)
      .then((txHash) => {
        this.loading = false;
      })
      .catch((error) => {
        this.loading = false;
        this.global.snackBarTip(error);
      });
  }

  private getLedgerStatus() {
    this.ledger.getDeviceStatus('NeoX').then(async (res) => {
      this.loadingMsg = LedgerStatuses[res].msgNeoX || LedgerStatuses[res].msg;
      if (LedgerStatuses[res] === LedgerStatuses.READY) {
        this.getStatusInterval.unsubscribe();
        this.loadingMsg = 'signTheTransaction';

        const { newParams } = this.getTxParams();
        if (!newParams.nonce) {
          const nonce = await this.assetEVMState.getNonce(
            this.currentWallet.accounts[0].address
          );
          newParams.nonce = nonce;
        }
        delete newParams.from;
        this.ledger
          .getLedgerSignedTx(newParams as any, this.currentWallet, 'NeoX')
          .then((tx) => {
            this.loading = false;
            this.ledgerSendTx(tx);
          })
          .catch((error) => {
            this.loading = false;
            this.loadingMsg = '';
            this.ledger.handleLedgerError(error);
          });
      }
    });
  }
  private getTxParams() {
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
      value: '0x' + new BigNumber(this.txParams.value).toString(16),
    };

    return { PreExecutionParams, newParams };
  }
}
