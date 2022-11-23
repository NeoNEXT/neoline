import { Component, OnInit, Inject, OnDestroy } from '@angular/core';
import {
  MatDialogRef,
  MAT_DIALOG_DATA,
  MatDialog,
} from '@angular/material/dialog';

import { UtilServiceState, AssetState } from '@app/core';
import { NEO, GAS } from '@/models/models';
import { PopupEditFeeDialogComponent } from '../../_dialogs';
import { bignumber } from 'mathjs';
import { GAS3_CONTRACT, RpcNetwork, ChainType } from '../../_lib';
import BigNumber from 'bignumber.js';
import { Store } from '@ngrx/store';
import { AppState } from '@/app/reduers';
import { Unsubscribable } from 'rxjs';
import { Wallet as Wallet2 } from '@cityofzion/neon-core/lib/wallet';
import { Wallet as Wallet3 } from '@cityofzion/neon-core-neo3/lib/wallet';

@Component({
  templateUrl: 'confirm.component.html',
  styleUrls: ['confirm.component.scss'],
})
export class PopupTransferConfirmComponent implements OnInit, OnDestroy {
  public logoUrlArr = [];
  public network: RpcNetwork;
  public datajson: any = {};
  public symbol = '';
  public money;
  public feeMoney;
  public totalMoney;
  public systemFeeMoney;
  public networkFeeMoney;
  public totalFee;
  public rateCurrency = '';

  private accountSub: Unsubscribable;
  isNeo3 = false;
  currentWallet: Wallet2 | Wallet3;
  private chainType: ChainType;
  constructor(
    private dialog: MatDialog,
    private dialogRef: MatDialogRef<PopupTransferConfirmComponent>,
    private assetState: AssetState,
    private util: UtilServiceState,
    @Inject(MAT_DIALOG_DATA)
    public data: {
      fromAddress: string;
      toAddress: string;
      symbol: string;
      asset: string;
      amount: string;
      remark: string;
      fee: string;
      networkFee?: any;
      systemFee?: any;
      networkId: number;
      broadcastOverride: boolean;
      txSerialize: string;
    } = {
      fromAddress: '',
      toAddress: '',
      symbol: '',
      asset: '',
      amount: '0',
      remark: '',
      fee: '0',
      networkId: undefined,
      broadcastOverride: false,
      txSerialize: '',
      networkFee: 0,
      systemFee: 0,
    },
    private store: Store<AppState>
  ) {
    const account$ = this.store.select('account');
    this.accountSub = account$.subscribe((state) => {
      this.chainType = state.currentChainType;
      this.currentWallet = state.currentWallet;
      this.isNeo3 = this.chainType === 'Neo3' ? true : false;
      this.network = this.isNeo3
        ? state.n3Networks[state.n3NetworkIndex]
        : state.n2Networks[state.n2NetworkIndex];
    });
  }

  async ngOnInit() {
    this.rateCurrency = this.assetState.rateCurrency;
    for (const key in this.data) {
      if (this.data[key] !== '' && key !== 'txSerialize') {
        this.datajson[key] = this.data[key];
      }
    }
    this.getSymbol();
    this.getAssetRate();
  }

  ngOnDestroy(): void {
    this.accountSub?.unsubscribe();
  }

  private async getSymbol() {
    if (this.data.asset === NEO) {
      this.symbol = 'NEO';
      return;
    }
    if (this.data.asset === GAS) {
      this.symbol = 'GAS';
      return;
    }
    if (this.data.symbol === '') {
      const symbols = await this.util.getAssetSymbols(
        [this.data.asset],
        this.chainType
      );
      this.symbol = symbols[0];
    } else {
      this.symbol = this.data.symbol;
    }
  }

  public async getAssetRate() {
    const assetId = this.isNeo3 ? GAS3_CONTRACT : GAS;
    this.totalFee = bignumber(this.data.fee)
      .add(this.data.systemFee || 0)
      .add(this.data.networkFee || 0);
    this.assetState.getAssetRate('GAS', assetId).then((rate) => {
      const gasPrice = rate || 0;
      this.feeMoney = new BigNumber(this.data.fee).times(gasPrice).toFixed();
      this.systemFeeMoney = new BigNumber(this.data.systemFee)
        .times(gasPrice)
        .toFixed();
      this.networkFeeMoney = new BigNumber(this.data.networkFee)
        .times(gasPrice)
        .toFixed();
      if (this.symbol === 'GAS') {
        this.money = new BigNumber(this.data.amount).times(gasPrice).toFixed();
        this.totalMoney = bignumber(this.feeMoney)
          .add(this.systemFeeMoney)
          .add(this.networkFeeMoney)
          .add(this.money);
      } else {
        this.assetState
          .getAssetRate(this.symbol, this.data.asset)
          .then((assetRate) => {
            this.money = new BigNumber(this.data.amount)
              .times(assetRate || 0)
              .toFixed();
            this.totalMoney = bignumber(this.feeMoney)
              .add(this.systemFeeMoney)
              .add(this.networkFeeMoney)
              .add(this.money);
          });
      }
    });
  }

  public editFee() {
    this.dialog
      .open(PopupEditFeeDialogComponent, {
        panelClass: 'custom-dialog-panel',
        data: {
          fee: this.data.fee,
        },
      })
      .afterClosed()
      .subscribe((res) => {
        if (res !== false) {
          this.data.fee = res;
          this.datajson.fee = res;
          const assetId = this.isNeo3 ? GAS3_CONTRACT : GAS;
          this.assetState.getAssetRate('GAS', assetId).then((rate) => {
            this.feeMoney = new BigNumber(this.data.fee)
              .times(rate || 0)
              .toFixed();
            this.totalFee = bignumber(this.data.fee)
              .add(this.data.systemFee || 0)
              .add(this.data.networkFee || 0);
            this.totalMoney = bignumber(this.feeMoney)
              .add(this.systemFeeMoney)
              .add(this.networkFeeMoney)
              .add(this.money);
          });
        }
      });
  }

  public confirm() {
    this.dialogRef.close(this.data.fee);
  }

  public exit() {
    this.dialogRef.close(false);
  }

  public getAddressSub(address: string) {
    return `${address.substr(0, 3)}...${address.substr(
      address.length - 4,
      address.length - 1
    )} `;
  }
}
