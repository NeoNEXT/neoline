import { Component, OnInit, Input, OnDestroy } from '@angular/core';
import { GlobalService, NeonService, NftState } from '@/app/core';
import { Transaction } from '@/models/models';
import { MatDialog } from '@angular/material/dialog';
import { PopupNftTxDetailDialogComponent } from '@/app/popup/_dialogs';

@Component({
    selector: 'app-nft-tx-page',
    templateUrl: 'nft-tx-page.component.html',
    styleUrls: ['nft-tx-page.component.scss'],
})
export class PopupNftTxPageComponent implements OnInit, OnDestroy {
    @Input() nftContract: string;
    @Input() symbol = '';

    public show = false;
    public net: string;
    public address: string;
    public inTransaction: Array<Transaction>;
    public txData: Array<any> = [];
    public currentPage = 0;
    public loading = false;
    public noMoreData: boolean = false;
    constructor(
        private global: GlobalService,
        private neon: NeonService,
        private dialog: MatDialog,
        private nftState: NftState
    ) {}
    ngOnInit(): void {
        this.net = this.global.net;
        this.address = this.neon.address;
        this.txData = [];
        this.getInTransactions(1);
    }

    ngOnDestroy(): void {
        this.txData = [];
    }

    public getInTransactions(page: number) {
        if (this.currentPage === page) {
            return;
        } else {
            this.currentPage = page;
        }
        this.loading = true;
        let maxId = -1;
        maxId = page > 1 ? this.txData[this.txData.length - 1].id - 1 : -1;
        this.nftState
            .getNftTransactions(this.neon.address, this.nftContract, maxId)
            .subscribe((res) => {
                const resultData = res || [];
                this.txData = this.txData.concat(resultData);
                if (resultData.length === 0) {
                    this.noMoreData = true;
                }
                this.loading = false;
            });
    }

    showDetail(tx) {
        this.dialog.open(PopupNftTxDetailDialogComponent, {
            panelClass: 'custom-dialog-panel',
            data: {
                tx,
                address: this.address,
            },
        });
    }
}
