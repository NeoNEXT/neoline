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
export class PopupNftTokensComponent implements OnInit {
  @Input() nftTokens: NftToken[];

  // tslint:disable-next-line:no-output-on-prefix

  constructor(public global: GlobalService, private dialog: MatDialog) {}

  ngOnInit(): void {}

  showDetail(token) {
    this.dialog.open(PopupNftTokenDetailDialogComponent, {
      panelClass: 'custom-dialog-panel',
      data: {
        nftToken: token,
      },
    });
  }
}
