import { Component, OnInit } from '@angular/core';
import { NftAsset } from '@/models/models';
import {
    ChromeService,
    NeonService,
    NftState,
    GlobalService,
} from '@/app/core';

import { forkJoin } from 'rxjs';

@Component({
    templateUrl: 'my-nfts.component.html',
    styleUrls: ['my-nfts.component.scss'],
})
export class PopupMyNftsComponent implements OnInit {
    nfts: NftAsset[];
    watchNfts: NftAsset[];
    public isLoading = false;

    constructor(
        private chrome: ChromeService,
        private neon: NeonService,
        private nftState: NftState,
        private global: GlobalService
    ) {}

    ngOnInit(): void {
        this.getNfts();
    }

    getNfts() {
        this.isLoading = true;
        const getWatch = this.chrome.getNftWatch(
            this.neon.address,
            this.neon.currentWalletChainType,
            this.global.n3Network.network
        );
        const getNfts = this.nftState.getNfts(this.neon.address);
        forkJoin([getNfts, getWatch]).subscribe((res) => {
            this.watchNfts = res[1];
            const target = [...res[0]];
            res[1].forEach((item) => {
                const index = target.findIndex((m) => m.contract === item.contract)
                if (index >= 0) {
                    if (item.watching === false) {
                        target[index].watching = false;
                    }
                } else {
                    if (item.watching === true) {
                        target.push(item);
                    }
                }
            });
            this.nfts = target;
            this.isLoading = false;
        });
    }

    addAsset(index: number) {
        const asset = { ...this.nfts[index], watching: true };
        const i = this.watchNfts.findIndex((m) => m.contract === asset.contract);
        if (i >= 0) {
            this.watchNfts[i].watching = true;
        } else {
            this.watchNfts.push(asset);
        }
        this.chrome.setNftWatch(
            this.neon.address,
            this.watchNfts,
            this.neon.currentWalletChainType,
            this.global.n3Network.network
        );
        this.nfts[index].watching = true;
        this.global.snackBarTip('addSucc');
    }

    removeAsset(index: number) {
        const asset = { ...this.nfts[index], watching: false };
        const i = this.watchNfts.findIndex((m) => m.contract === asset.contract);
        if (i >= 0) {
            this.watchNfts[i].watching = false;
        } else {
            this.watchNfts.push(asset);
        }
        this.chrome.setNftWatch(
            this.neon.address,
            this.watchNfts,
            this.neon.currentWalletChainType,
            this.global.n3Network.network
        );
        this.nfts[index].watching = false;
        this.global.snackBarTip('hiddenSucc');
    }
}
