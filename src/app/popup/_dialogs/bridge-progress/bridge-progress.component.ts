import { Component, Inject } from '@angular/core';
import { MatDialogRef, MAT_DIALOG_DATA } from '@angular/material/dialog';
import { BridgeTransactionOnBridge } from '../../_lib';

@Component({
  templateUrl: 'bridge-progress.component.html',
  styleUrls: ['bridge-progress.component.scss'],
})
export class PopupBridgeProgressDialogComponent {
  constructor(
    private dialogRef: MatDialogRef<PopupBridgeProgressDialogComponent>,
    @Inject(MAT_DIALOG_DATA)
    public data: BridgeTransactionOnBridge
  ) {}

  public close() {
    this.dialogRef.close();
  }

  toViewTx(isSourceTx = true) {
    let url: string;
    if (isSourceTx) {
      if (this.data.sourceChainType === 'Neo3') {
        url = `${this.data.sourceExplorer}transaction/${this.data.sourceTxID}`;
      } else {
        url = `${this.data.sourceExplorer}/tx/${this.data.sourceTxID}`;
      }
    } else {
      if (this.data.targetChainType === 'Neo3') {
        url = `${this.data.targetExplorer}transaction/${this.data.targetTxID}`;
      } else {
        url = `${this.data.targetExplorer}/tx/${this.data.targetTxID}`;
      }
    }
    window.open(url);
  }
}
