import { Component, OnInit } from '@angular/core';
import { MatDialog } from '@angular/material/dialog';
import { NeonService, ChromeService, GlobalService } from '@/app/core';
import { STORAGE_NAME, RpcNetwork } from '@popup/_lib';
import { PopupAddNetworkDialogComponent } from '../add-network/add-network.dialog';

@Component({
    templateUrl: 'n3-network.dialog.html',
    styleUrls: ['n3-network.dialog.scss'],
})
export class PopupN3NetworkDialogComponent implements OnInit {
    public networks: RpcNetwork[];
    public selectedNetworkIndex: number;
    showAddNetwork = false;

    constructor(
        private global: GlobalService,
        private dialog: MatDialog,
        private neon: NeonService,
        private chromeSer: ChromeService
    ) {
        this.networks =
            this.neon.currentWalletChainType === 'Neo2'
                ? this.global.n2Networks
                : this.global.n3Networks;
        this.selectedNetworkIndex =
            this.neon.currentWalletChainType === 'Neo2'
                ? this.global.n2SelectedNetworkIndex
                : this.global.n3SelectedNetworkIndex;
    }
    ngOnInit(): void {
        this.showAddNetwork = this.neon.currentWalletChainType === 'Neo3';
    }

    public changeNetwork(index: number) {
        if (index === this.selectedNetworkIndex) {
            return;
        }
        this.selectedNetworkIndex = index;
        if (this.neon.currentWalletChainType === 'Neo2') {
            this.chromeSer.setStorage(
                STORAGE_NAME.n2SelectedNetworkIndex,
                index
            );
            this.chromeSer.networkChangeEvent(this.global.n2Networks[index]);
        } else {
            this.chromeSer.setStorage(
                STORAGE_NAME.n3SelectedNetworkIndex,
                index
            );
            this.chromeSer.networkChangeEvent(this.global.n3Networks[index]);
        }
        location.reload();
    }

    addNetwork() {
        this.dialog.open(PopupAddNetworkDialogComponent, {
            panelClass: 'custom-dialog-panel',
        });
    }

    deleteNetwork(index: number) {
        if (this.selectedNetworkIndex > index) {
            this.selectedNetworkIndex--;
            this.global.n3SelectedNetworkIndex--;
            this.chromeSer.setStorage(
                STORAGE_NAME.n3SelectedNetworkIndex,
                this.selectedNetworkIndex
            );
        }
        this.global.n3Networks.splice(index, 1);
        this.chromeSer.setStorage(
            STORAGE_NAME.n3Networks,
            this.global.n3Networks
        );
    }
}
