import { Component, OnInit } from '@angular/core';
import { Asset } from '@/models/models';
import {
    AssetState,
    ChromeService,
    NeonService,
    GlobalService,
} from '@/app/core';
import { MatDialog } from '@angular/material/dialog';
import { NetworkType } from '../_lib';

@Component({
    templateUrl: 'add-asset.component.html',
    styleUrls: ['add-asset.component.scss'],
})
export class PopupAddAssetComponent implements OnInit {
    public searchAsset: Asset; // Searched asset
    public watch: Asset[] = []; // User-added assets
    public isLoading = false;
    public searchValue: string = '';

    sourceScrollHeight = 0;

    network: NetworkType;

    constructor(
        private asset: AssetState,
        private chrome: ChromeService,
        private neon: NeonService,
        private dialog: MatDialog,
        private global: GlobalService
    ) {}

    ngOnInit(): void {
        this.network =
            this.neon.currentWalletChainType === 'Neo2'
                ? this.global.n2Network.network
                : this.global.n3Network.network;
        this.chrome
            .getWatch(
                this.neon.address,
                this.neon.currentWalletChainType,
                this.network
            )
            .subscribe((res) => (this.watch = res));
    }

    public addAsset() {
        this.searchAsset.watching = true;
        const index = this.watch.findIndex(
            (w) => w.asset_id === this.searchAsset.asset_id
        );
        if (index >= 0) {
            this.watch[index].watching = true;
        } else {
            this.watch.push(this.searchAsset);
        }
        this.chrome.setWatch(
            this.neon.address,
            this.watch,
            this.neon.currentWalletChainType,
            this.network
        );
        this.global.snackBarTip('addSucc');
    }

    public searchCurrency() {
        if (!this.searchValue) {
            return;
        }
        this.isLoading = true;
        this.searchAsset = undefined;
        this.asset
            .searchAsset(this.searchValue)
            .then((res) => {
                this.searchAsset = res;
                const index = this.watch.findIndex(
                    (w) => w.asset_id === res.asset_id
                );
                if (index >= 0) {
                    this.searchAsset.watching = this.watch[index].watching;
                } else {
                    this.searchAsset.watching = false;
                }
                this.isLoading = false;
            })
            .catch(() => {
                this.isLoading = false;
            });
    }
}
