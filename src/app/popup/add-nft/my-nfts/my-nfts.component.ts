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
            this.neon.currentWalletChainType
        );
        const getNfts = this.nftState.getNfts(this.neon.address);
        forkJoin([getNfts, getWatch]).subscribe((res) => {
            this.watchNfts = res[1];
            const target = res[0];
            res[1].forEach((item) => {
                const index = res[0].findIndex((m) => m.contract === item.contract)
                if (index >= 0) {
                    target[index].watching = true;
                    return;
                } else {
                    target.push(item);
                }
            });
            this.nfts = target;
            this.isLoading = false;
        });
    }

    addAssetCheck(index: number) {
        this.nfts[index].watching = true;
        this.watchNfts.push(this.nfts[index]);
        this.chrome.setNftWatch(
            this.neon.address,
            this.watchNfts,
            this.neon.currentWalletChainType
        );
        this.global.snackBarTip('addSucc');
    }

    removeAsset(index: number) {
        this.nfts[index].watching = false;
        this.watchNfts = this.watchNfts.filter(
            (w) => w.contract !== this.nfts[index].contract
        );
        this.chrome.setNftWatch(
            this.neon.address,
            this.watchNfts,
            this.neon.currentWalletChainType
        );
        this.global.snackBarTip('hiddenSucc');
    }
}
