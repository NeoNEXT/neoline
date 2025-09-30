import { Component, Inject, OnInit } from '@angular/core';
import { MatDialogRef, MAT_DIALOG_DATA } from '@angular/material/dialog';
import { GlobalService, NeoTxService } from '@/app/core';
import { NEO, GAS, TransactionStatus } from '@/models/models';
import { ChainType, RpcNetwork, ETH_SOURCE_ASSET_HASH } from '../../_lib';
import BigNumber from 'bignumber.js';

@Component({
  templateUrl: 'tx-detail.dialog.html',
  styleUrls: ['tx-detail.dialog.scss'],
})
export class PopupTxDetailDialogComponent implements OnInit {
  TransactionStatus = TransactionStatus;
  ETH_SOURCE_ASSET_HASH = ETH_SOURCE_ASSET_HASH;
  showActivityLog = false;
  constructor(
    private global: GlobalService,
    private dialogRef: MatDialogRef<PopupTxDetailDialogComponent>,
    private neoTxService: NeoTxService,
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
        this.neoTxService
          .getNeo2TxDetail(this.data.tx.txid)
          .subscribe((res) => {
            this.data.tx.from = res.vin;
            this.data.tx.to = res.vout;
          });
      }
    }
  }

  speedUpTx(isSpeedUp: boolean) {
    this.dialogRef.close({ isSpeedUp });
  }

  getShowGas(value: string) {
    const newAmount = new BigNumber(value).dp(8).toFixed();
    if (newAmount === '0') {
      return '< 0.0000001';
    }
    return newAmount;
  }

  toWeb(txId: string) {
    this.global.toExplorer({
      chain: this.data.chainType,
      network: this.data.network,
      networkIndex: this.data.networkIndex,
      type: 'tx',
      value: txId,
    });
  }
}
