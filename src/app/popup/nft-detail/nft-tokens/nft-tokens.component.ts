import { Component, OnInit, Input } from '@angular/core';
import { GlobalService, NftState, NeonService } from '@/app/core';
import { PopupNftTokenDetailDialogComponent } from '../../_dialogs';
import { MatDialog } from '@angular/material/dialog';

@Component({
    selector: 'app-nft-tokens',
    templateUrl: 'nft-tokens.component.html',
    styleUrls: ['nft-tokens.component.scss'],
})
export class PopupNftTokensComponent implements OnInit {
    @Input() nftContract: string;
    @Input() nftName: string;

    nftTokens: any[];

    // tslint:disable-next-line:no-output-on-prefix

    constructor(
        public global: GlobalService,
        private nftState: NftState,
        private dialog: MatDialog,
        private neonService: NeonService
    ) {}

    ngOnInit(): void {
        this.getNftTokens();
    }
    getNftTokens() {
        this.nftState
            .getNftTokens(this.neonService.address, this.nftContract)
            .subscribe((res) => {
                this.nftTokens = res;
            });
    }

    showDetail(token) {
        this.dialog.open(PopupNftTokenDetailDialogComponent, {
            panelClass: 'custom-dialog-panel',
            data: {
                nftToken: token
            },
        });
    }
}
