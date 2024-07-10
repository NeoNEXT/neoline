import { Component, Inject } from '@angular/core';
import { MatDialogRef, MAT_DIALOG_DATA } from '@angular/material/dialog';
import {
  ChainType,
  DEFAULT_N3_RPC_NETWORK,
  DEFAULT_NEOX_RPC_NETWORK,
  RpcNetwork,
} from '../../_lib';

@Component({
  templateUrl: 'bridge-progress.component.html',
  styleUrls: ['bridge-progress.component.scss'],
})
export class PopupBridgeProgressDialogComponent {
  constructor(
    private dialogRef: MatDialogRef<PopupBridgeProgressDialogComponent>,
    @Inject(MAT_DIALOG_DATA)
    public data: {
      sourceTxLoading: boolean;
      sourceTxID: string;
      targetTxLoading: boolean;
      targetTxID: string;
      chainType: ChainType;
      n3Network: RpcNetwork;
      neoXNetwork: RpcNetwork;
    }
  ) {
    console.log(this.data);
    console.log(this.data.sourceTxID);
  }

  public close() {
    this.dialogRef.close();
  }

  toViewTx(isSourceTx = true) {
    let url: string;
    if (this.data.chainType === 'Neo3') {
      if (isSourceTx) {
        url = `${this.data.n3Network.explorer}transaction/${this.data.sourceTxID}`;
      } else {
        if (this.data.n3Network.chainId === 6) {
          url = `${DEFAULT_NEOX_RPC_NETWORK[0].explorer}/tx/${this.data.targetTxID}`;
        }
      }
    } else {
      if (isSourceTx) {
        url = `${this.data.neoXNetwork.explorer}/tx/${this.data.sourceTxID}`;
      } else {
        if (this.data.neoXNetwork.chainId === 12227331) {
          url = `${DEFAULT_N3_RPC_NETWORK[1].explorer}transaction/${this.data.targetTxID}`;
        }
      }
    }
    window.open(url);
  }
}
