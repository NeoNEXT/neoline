import { Component, OnInit } from '@angular/core';
import { GlobalService, NftState, NeonService, ChromeService } from '@/app/core';
import { forkJoin } from 'rxjs';
import { NftAsset } from '@/models/models';

@Component({
    selector: 'app-nfts',
    templateUrl: 'nfts.component.html',
    styleUrls: ['nfts.component.scss'],
})
export class PopupNftsComponent implements OnInit {
    nfts;

    constructor(
        public global: GlobalService,
        private nftState: NftState,
        private neonService: NeonService,
        private chrome: ChromeService,
    ) {}

    ngOnInit(): void {
        const getWatch = this.chrome.getNftWatch(this.neonService.address, this.neonService.currentWalletChainType, this.global.n3Network.network);
        const getNfts = this.nftState.getNfts(this.neonService.address)
        forkJoin([getNfts, getWatch]).subscribe(res => {
            const [moneyAssets, watch] = [...res];
            let showAssets = [...moneyAssets];
            watch.forEach((item) => {
                const index = showAssets.findIndex(
                    (m) => m.contract === item.contract
                );
                if (index >= 0) {
                    if (item.watching === false) {
                        showAssets.splice(index, 1);
                    }
                } else {
                    if (item.watching === true) {
                        showAssets.push(item);
                    }
                }
            });
            this.nfts = showAssets;
        });
    }
}
