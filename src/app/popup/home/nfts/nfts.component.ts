import { Component, OnInit } from '@angular/core';
import { GlobalService, NftState, NeonService } from '@/app/core';

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
        private neonService: NeonService
    ) {}

    ngOnInit(): void {
        this.nftState.getNfts(this.neonService.address).subscribe((res) => {
            this.nfts = res;
        });
    }
}
