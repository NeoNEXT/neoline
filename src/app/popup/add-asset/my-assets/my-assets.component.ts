import { Component, OnInit } from '@angular/core';
import { Asset } from '@/models/models';
import {
    AssetState,
    ChromeService,
    NeonService,
    GlobalService,
} from '@/app/core';
import { MatDialog } from '@angular/material/dialog';
import { forkJoin } from 'rxjs';

@Component({
    templateUrl: 'my-assets.component.html',
    styleUrls: ['my-assets.component.scss'],
})
export class PopupMyAssetsComponent implements OnInit {
    public myAssets: Array<Asset> = []; // 所有的资产
    public watch: Asset[] = []; // 用户添加的资产
    public moneyAssets: Asset[] = []; // 有钱的资产
    public isLoading = false;
    public searchValue: string = '';

    sourceScrollHeight = 0;

    private network;

    constructor(
        private asset: AssetState,
        private chrome: ChromeService,
        private neon: NeonService,
        private dialog: MatDialog,
        private global: GlobalService
    ) {
        this.network =
            this.neon.currentWalletChainType === 'Neo2'
                ? this.global.n2Network.network
                : this.global.n3Network.network;
    }

    ngOnInit(): void {
        const getMoneyBalance = this.asset.getAddressBalances(
            this.neon.address
        );
        const getWatch = this.chrome.getWatch(
            this.neon.address,
            this.neon.currentWalletChainType,
            this.network
        );
        forkJoin([getMoneyBalance, getWatch]).subscribe((res) => {
            [this.moneyAssets, this.watch] = [...res];
            let showAssets = [...this.moneyAssets];
            this.watch.forEach((item) => {
                const index = showAssets.findIndex(
                    (m) => m.asset_id === item.asset_id
                );
                if (index >= 0) {
                    if (item.watching === false) {
                        showAssets[index].watching = false;
                    }
                } else {
                    if (item.watching === true) {
                        showAssets.push(item);
                    }
                }
            });
            console.log(showAssets);
            this.myAssets = showAssets;
        });
    }

    public addAsset(index: number) {
        const asset = { ...this.myAssets[index], watching: true };
        const i = this.watch.findIndex((m) => m.asset_id === asset.asset_id);
        if (i >= 0) {
            this.watch[i].watching = true;
        } else {
            this.watch.push(asset);
        }
        this.chrome.setWatch(
            this.neon.address,
            this.watch,
            this.neon.currentWalletChainType,
            this.network
        );
        this.myAssets[index].watching = true;
        this.global.snackBarTip('addSucc');
    }

    public removeAsset(index: number) {
        const asset = { ...this.myAssets[index], watching: false };
        const i = this.watch.findIndex((m) => m.asset_id === asset.asset_id);
        if (i >= 0) {
            this.watch[i].watching = false;
        } else {
            this.watch.push(asset);
        }
        this.chrome.setWatch(
            this.neon.address,
            this.watch,
            this.neon.currentWalletChainType,
            this.network
        );
        this.myAssets[index].watching = false;
        this.global.snackBarTip('hiddenSucc');
    }
}
