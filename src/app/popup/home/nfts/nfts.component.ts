import { Component, OnInit } from '@angular/core';
import {
    GlobalService,
    NftState,
    NeonService,
    ChromeService,
} from '@/app/core';
import { NftAsset } from '@/models/models';

@Component({
    selector: 'app-nfts',
    templateUrl: 'nfts.component.html',
    styleUrls: ['nfts.component.scss'],
})
export class PopupNftsComponent implements OnInit {
    nfts: NftAsset[];

    constructor(
        public global: GlobalService,
        private nftState: NftState,
        private neonService: NeonService,
        private chrome: ChromeService
    ) {}

    ngOnInit(): void {
        const getWatch = this.chrome
            .getNftWatch(this.global.n3Network.id, this.neonService.address)
            .toPromise();
        const getNfts = this.nftState.getAddressNfts(this.neonService.address);
        Promise.all([getNfts, getWatch]).then(([moneyAssets, watch]) => {
            let showAssets = [...moneyAssets];
            watch.forEach((item) => {
                const index = showAssets.findIndex(
                    (m) => m.assethash === item.assethash
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
