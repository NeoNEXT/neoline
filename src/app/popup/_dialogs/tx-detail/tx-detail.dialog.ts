import { Component, Inject, OnInit } from '@angular/core';
import { MAT_DIALOG_DATA } from '@angular/material/dialog';
import { TransactionState } from '@/app/core';
import { NEO, GAS } from '@/models/models';

@Component({
  templateUrl: 'tx-detail.dialog.html',
  styleUrls: ['tx-detail.dialog.scss'],
})
export class PopupTxDetailDialogComponent implements OnInit {
  constructor(
    private txState: TransactionState,
    @Inject(MAT_DIALOG_DATA)
    public data: {
      tx: any;
      symbol: string;
      isNFT: boolean;
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
}
