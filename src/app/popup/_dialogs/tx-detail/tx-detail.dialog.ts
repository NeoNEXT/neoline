import { Component, Inject, OnInit } from '@angular/core';
import { MatDialog, MAT_DIALOG_DATA } from '@angular/material/dialog';
import { TransactionState } from '@/app/core';
import { NEO, GAS } from '@/models/models';
import { ChainType, RpcNetwork } from '../../_lib';
import { PopupAddNetworkDialogComponent } from '../add-network/add-network.dialog';
import BigNumber from 'bignumber.js';

@Component({
  templateUrl: 'tx-detail.dialog.html',
  styleUrls: ['tx-detail.dialog.scss'],
})
export class PopupTxDetailDialogComponent implements OnInit {
  showActivityLog = false;
  constructor(
    private dialog: MatDialog,
    private txState: TransactionState,
    @Inject(MAT_DIALOG_DATA)
    public data: {
      tx: any;
      symbol: string;
      isNFT: boolean;
      chainType: ChainType;
      network: RpcNetwork;
      networkIndex: number;
    }
  ) {}

  ngOnInit(): void {
    if (this.data.isNFT === false) {
      if (this.data.tx.assetId === NEO || this.data.tx.assetId === GAS) {
        this.txState.getNeo2TxDetail(this.data.tx.txid).subscribe((res) => {
          this.data.tx.from = res.vin;
          this.data.tx.to = res.vout;
        });
      }
    }
  }

  getShowGas(value: string) {
    const newAmount = new BigNumber(value).dp(8).toFixed();
    if (newAmount === '0') {
      return '< 0.0000001';
    }
    return newAmount;
  }

  toWeb(txId: string) {
    const explorer = this.data.network.explorer;
    switch (this.data.chainType) {
      case 'Neo2':
      case 'Neo3':
        if (explorer) {
          window.open(`${explorer}transaction/${txId}`);
        }
        break;
      case 'NeoX':
        if (explorer) {
          window.open(`${explorer}/tx/${txId}`);
        }
        break;
    }
    if (!explorer && this.data.chainType !== 'Neo2') {
      this.dialog.open(PopupAddNetworkDialogComponent, {
        panelClass: 'custom-dialog-panel',
        backdropClass: 'custom-dialog-backdrop',
        data: {
          addChainType: this.data.chainType,
          index: this.data.networkIndex,
          editNetwork: this.data.network,
          addExplorer: true,
        },
      });
    }
  }
}
