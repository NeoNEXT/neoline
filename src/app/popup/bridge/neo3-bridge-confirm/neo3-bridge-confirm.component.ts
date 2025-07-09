import { Component, Input, Output, EventEmitter, OnInit } from '@angular/core';
import { GlobalService, ChromeService, AssetState } from '@/app/core';
import { BigNumber } from 'bignumber.js';
import { PopupEditFeeDialogComponent } from '@/app/popup/_dialogs';
import { MatDialog } from '@angular/material/dialog';
import { SignerLike, Transaction } from '@cityofzion/neon-core-neo3/lib/tx';
import { Asset } from '@/models/models';
import { ChainType, GAS3_CONTRACT, RpcNetwork } from '../../_lib';
import { Wallet3 } from '@popup/_lib';
import { Wallet as Wallet2 } from '@cityofzion/neon-core/lib/wallet';
import { EvmWalletJSON } from '@/app/popup/_lib/evm';
import { ContractCall } from '@cityofzion/neon-core-neo3/lib/sc';
import { Neo3InvokeService } from '../../transfer/neo3-invoke.service';
import { u } from '@cityofzion/neon-core-neo3';
import { ethers } from 'ethers';

export type TabType = 'details' | 'data';

@Component({
  selector: 'neo3-bridge-confirm',
  templateUrl: 'neo3-bridge-confirm.component.html',
  styleUrls: ['../bridge-confirm.scss'],
})
export class Neo3BridgeConfirmComponent implements OnInit {
  GAS3_CONTRACT = GAS3_CONTRACT;
  @Input() bridgeAsset: Asset;
  @Input() bridgeAmount: string;
  @Input() toAddress: string;
  @Input() currentWallet: Wallet2 | Wallet3 | EvmWalletJSON;
  @Input() n3Network: RpcNetwork;
  @Input() rateCurrency: string;

  @Input() unSignedTx: Transaction;
  @Input() networkFee: string;
  @Input() networkFeeWithoutPriorityFee: string;
  @Input() systemFee: string;
  @Input() priorityFee: string;
  @Input() invokeArgs: ContractCall[];
  @Input() signers: SignerLike[];

  @Output() backAmount = new EventEmitter<{ hash: string; chain: ChainType }>();

  totalFee: string;
  rate = { priorityFee: '', total: '', networkFee: '', systemFee: '' };

  tabType: TabType = 'details';
  txSerialize: string;

  loading = false;
  loadingMsg: string;
  showHardwareSign = false;
  expandTotalFee = false;

  constructor(
    private dialog: MatDialog,
    private global: GlobalService,
    private chrome: ChromeService,
    private assetState: AssetState,
    private neo3Invoke: Neo3InvokeService
  ) {}

  ngOnInit(): void {
    this.txSerialize = this.unSignedTx.serialize(false);
    this.calculateNeo3TotalFee();
  }

  private calculateNeo3TotalFee() {
    if (this.bridgeAsset.asset_id === GAS3_CONTRACT) {
      this.totalFee = new BigNumber(this.networkFee)
        .plus(this.systemFee)
        .plus(this.bridgeAmount)
        .toFixed();
      this.assetState.getAssetRateV2('Neo3', GAS3_CONTRACT).then((gasRate) => {
        if (gasRate) {
          this.rate.priorityFee = gasRate.times(this.priorityFee).toFixed(2);
          this.rate.networkFee = gasRate.times(this.networkFee).toFixed(2);
          this.rate.systemFee = gasRate.times(this.systemFee).toFixed(2);
          this.rate.total = gasRate.times(this.totalFee).toFixed(2);
        }
      });
    } else {
      this.totalFee = new BigNumber(this.networkFee)
        .plus(this.systemFee)
        .toFixed();
      ethers
        .resolveProperties({
          bridgeAssetRate: this.assetState.getAssetRateV2(
            'Neo3',
            this.bridgeAsset.asset_id
          ),
          gasRate: this.assetState.getAssetRateV2('Neo3', GAS3_CONTRACT),
        })
        .then(({ bridgeAssetRate, gasRate }) => {
          if (gasRate) {
            this.rate.priorityFee = gasRate.times(this.priorityFee).toFixed(2);
            this.rate.networkFee = gasRate.times(this.networkFee).toFixed(2);
            this.rate.systemFee = gasRate.times(this.systemFee).toFixed(2);
          }
          if (gasRate && bridgeAssetRate) {
            const totalAmountValue = bridgeAssetRate.times(this.bridgeAmount);
            const totalFeeValue = gasRate.times(this.totalFee);
            this.rate.total = totalAmountValue.plus(totalFeeValue).toFixed(2);
          }
        });
    }
  }

  editFee() {
    this.dialog
      .open(PopupEditFeeDialogComponent, {
        panelClass: 'custom-dialog-panel',
        backdropClass: 'custom-dialog-backdrop',
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
      this.showHardwareSign = true;
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

        this.backAmount.emit({ hash: txHash, chain: 'Neo3' });
        this.loading = false;
        this.loadingMsg = '';
      })
      .catch((err) => {
        this.loading = false;
        this.loadingMsg = '';
        this.global.snackBarTip('txFailed', err.msg || err);
      });
  }

  handleHardwareSignedTx(tx) {
    this.showHardwareSign = false;
    if (tx) {
      this.resolveSend(tx);
    }
  }
}
