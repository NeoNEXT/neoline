import { Component, OnInit, Input } from '@angular/core';
import { GlobalService } from '@/app/core';
import { PopupNftTokenDetailDialogComponent } from '../../../_dialogs';
import { MatDialog } from '@angular/material/dialog';
import { NftToken } from '@/models/models';
import { ChainType, RpcNetwork } from '@/app/popup/_lib';

@Component({
  selector: 'app-nft-tokens',
  templateUrl: 'nft-tokens.component.html',
  styleUrls: ['nft-tokens.component.scss'],
})
export class PopupNftTokensComponent {
  @Input() nftTokens: NftToken[];
  @Input() nftContract: string;
  @Input() chainType: ChainType;
  @Input() neoXNetwork: RpcNetwork;

  // eslint-disable-next-line @angular-eslint/no-output-on-prefix

  constructor(public global: GlobalService, private dialog: MatDialog) {}

  showDetail(token) {
    this.dialog.open(PopupNftTokenDetailDialogComponent, {
      panelClass: 'custom-dialog-panel',
      backdropClass: 'custom-dialog-backdrop',
      data: {
        nftToken: token,
        nftContract: this.nftContract,
        chainType: this.chainType,
        neoXNetwork: this.neoXNetwork,
      },
    });
  }
}
