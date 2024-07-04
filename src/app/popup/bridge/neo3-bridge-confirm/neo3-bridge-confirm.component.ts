import {
  Component,
  Input,
  Output,
  EventEmitter,
  OnDestroy,
  OnInit,
} from '@angular/core';
import { GlobalService, LedgerService, ChromeService } from '@/app/core';
import { BigNumber } from 'bignumber.js';
import { PopupEditFeeDialogComponent } from '@/app/popup/_dialogs';
import { MatDialog } from '@angular/material/dialog';
import { SignerLike, Transaction } from '@cityofzion/neon-core-neo3/lib/tx';
import { Asset } from '@/models/models';
import { ChainType, LedgerStatuses, RpcNetwork } from '../../_lib';
import { Wallet as Wallet3 } from '@cityofzion/neon-core-neo3/lib/wallet';
import { Wallet as Wallet2 } from '@cityofzion/neon-core/lib/wallet';
import { EvmWalletJSON } from '@/app/popup/_lib/evm';
import { ContractCall } from '@cityofzion/neon-core-neo3/lib/sc';
import { Neo3InvokeService } from '../../transfer/neo3-invoke.service';
import { u } from '@cityofzion/neon-core-neo3';
import { interval } from 'rxjs';

export type TabType = 'details' | 'data';

@Component({
  selector: 'neo3-bridge-confirm',
  templateUrl: 'neo3-bridge-confirm.component.html',
  styleUrls: ['../bridge-confirm.scss'],
})
export class Neo3BridgeConfirmComponent implements OnInit, OnDestroy {
  @Input() bridgeAsset: Asset;
  @Input() bridgeAmount: string;
  @Input() toAddress: string;
  @Input() currentWallet: Wallet2 | Wallet3 | EvmWalletJSON;
  @Input() n3Network: RpcNetwork;

  @Input() unSignedTx: Transaction;
  @Input() networkFee: string;
  @Input() networkFeeWithoutPriorityFee: string;
  @Input() systemFee: string;
  @Input() priorityFee: string;
  @Input() invokeArgs: ContractCall[];
  @Input() signers: SignerLike[];

  @Output() backAmount = new EventEmitter<{ hash: string; chain: ChainType }>();

  totalFee: string;
  rate = { priorityFee: '', networkFee: '', systemFee: '', totalFee: '' };
  rateCurrency: string;

  tabType: TabType = 'details';
  txSerialize: string;

  loading = false;
  loadingMsg: string;
  getStatusInterval;

  constructor(
    private dialog: MatDialog,
    private global: GlobalService,
    private ledger: LedgerService,
    private chrome: ChromeService,
    private neo3Invoke: Neo3InvokeService
  ) {}

  ngOnInit(): void {
    this.txSerialize = this.unSignedTx.serialize(false);
    this.calculateNeo3TotalFee();
  }

  ngOnDestroy(): void {
    this.getStatusInterval?.unsubscribe();
  }

  private calculateNeo3TotalFee() {
    this.totalFee = new BigNumber(this.networkFee)
      .plus(this.systemFee)
      .toFixed();
  }

  editFee() {
    this.dialog
      .open(PopupEditFeeDialogComponent, {
        panelClass: 'custom-dialog-panel',
        data: { fee: this.priorityFee },
      })
      .afterClosed()
      .subscribe(async (res) => {
        if (res !== false) {
          this.priorityFee = res;
          this.networkFee = new BigNumber(this.networkFeeWithoutPriorityFee)
            .plus(this.priorityFee)
            .toFixed();
          this.unSignedTx.networkFee = u.BigInteger.fromDecimal(
            this.networkFee,
            8
          );
          this.txSerialize = this.unSignedTx.serialize(false);
          this.calculateNeo3TotalFee();
        }
      });
  }

  back() {
    this.backAmount.emit();
  }

  cancel() {
    history.go(-1);
  }

  async confirm() {
    if (this.currentWallet.accounts[0]?.extra?.ledgerSLIP44) {
      this.loading = true;
      this.loadingMsg = LedgerStatuses.DISCONNECTED.msg;
      this.getLedgerStatus();
      this.getStatusInterval = interval(5000).subscribe(() => {
        this.getLedgerStatus();
      });
      return;
    }
    this.loading = true;
    this.loadingMsg = 'Wait';
    const pwd = await this.chrome.getPassword();
    const wallet = await (this.currentWallet.accounts[0] as any).decrypt(pwd);
    this.unSignedTx.sign(wallet.WIF, this.n3Network.magicNumber);
    this.resolveSend(this.unSignedTx);
  }

  private resolveSend(signedTx: Transaction) {
    this.neo3Invoke
      .sendNeo3Tx(this.neo3Invoke.hexToBase64(signedTx.serialize(true)))
      .then((txHash) => {
        if (!txHash || !txHash.startsWith('0x')) {
          throw {
            msg: 'Transaction rejected by RPC node.',
          };
        }
        console.log(txHash);

        this.backAmount.emit({ hash: txHash, chain: 'Neo3' });
        this.loading = false;
        this.loadingMsg = '';
      })
      .catch((err) => {
        this.loading = false;
        this.loadingMsg = '';
        this.global.snackBarTip('transferFailed', err.msg || err);
      });
  }

  private getLedgerStatus() {
    this.ledger.getDeviceStatus('Neo3').then(async (res) => {
      this.loadingMsg = LedgerStatuses[res].msgNeo3 || LedgerStatuses[res].msg;
      if (LedgerStatuses[res] === LedgerStatuses.READY) {
        this.getStatusInterval.unsubscribe();
        this.loadingMsg = 'signTheTransaction';
        this.ledger
          .getLedgerSignedTx(
            this.unSignedTx,
            this.currentWallet,
            'Neo3',
            this.n3Network.magicNumber
          )
          .then((tx) => {
            this.loading = false;
            this.loadingMsg = '';
            this.resolveSend(tx);
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
