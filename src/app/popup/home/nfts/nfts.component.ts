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
    nfts: NftAsset[];

    constructor(
        public global: GlobalService,
        private nftState: NftState,
        private neonService: NeonService,
        private chrome: ChromeService,
    ) {}

    ngOnInit(): void {
        const getWatch = this.chrome.getNftWatch(this.neonService.address, this.neonService.currentWalletChainType);
        const getNfts = this.nftState.getNfts(this.neonService.address)
        forkJoin([getNfts, getWatch]).subscribe(res => {
            const target = res[0];
            res[1].forEach(item => {
                if (res[0].find(m => m.contract === item.contract)) {
                    return;
                } else {
                    target.push(item);
                }
            })
            this.nfts = target;
        });
    }
}
