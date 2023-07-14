import { Component, OnInit, Input } from '@angular/core';
import { GlobalService } from '@/app/core';
import { PopupNftTokenDetailDialogComponent } from '../../../_dialogs';
import { MatDialog } from '@angular/material/dialog';
import { NftToken } from '@/models/models';

@Component({
  selector: 'app-nft-tokens',
  templateUrl: 'nft-tokens.component.html',
  styleUrls: ['nft-tokens.component.scss'],
})
export class PopupNftTokensComponent {
  @Input() nftTokens: NftToken[];

  // eslint-disable-next-line @angular-eslint/no-output-on-prefix

  constructor(public global: GlobalService, private dialog: MatDialog) {}

  showDetail(token) {
    this.dialog.open(PopupNftTokenDetailDialogComponent, {
      panelClass: 'custom-dialog-panel',
      data: {
        nftToken: token,
      },
    });
  }
}
