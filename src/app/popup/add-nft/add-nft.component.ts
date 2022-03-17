import { Component, OnInit } from '@angular/core';
import {
    NftState,
    ChromeService,
    NeonService,
    GlobalService,
} from '@/app/core';
import { NftAsset } from '@/models/models';

@Component({
    templateUrl: 'add-nft.component.html',
    styleUrls: ['add-nft.component.scss'],
})
export class PopupAddNftComponent implements OnInit {
    public watch: NftAsset[] = []; // 用户添加的资产

    public isLoading = false;
    public searchValue: string = '';
    public searchNft;

    constructor(
        private nftState: NftState,
        private chrome: ChromeService,
        private neon: NeonService,
        private global: GlobalService
    ) {}

    ngOnInit(): void {
        this.chrome
            .getNftWatch(this.neon.address, this.neon.currentWalletChainType, this.global.n3Network.network)
            .subscribe((res) => {
                this.watch = res;
            });
    }

    public searchCurrency() {
        this.isLoading = true;
        this.nftState.searchNft(this.searchValue).then(
            (res) => {
                this.searchNft = res;
                const index = this.watch.findIndex(
                    (item) => item.assethash === res.assethash
                );
                if (index >= 0) {
                    this.searchNft.watching = this.watch[index].watching;
                } else {
                    this.searchNft.watching = false;
                }
                this.isLoading = false;
            },
            () => {
                this.searchNft = {};
                this.isLoading = false;
            }
        );
    }

    addNft() {
        this.searchNft.watching = true;
        const index = this.watch.findIndex(
            (w) => w.assethash === this.searchNft.contract
        );
        if (index >= 0) {
            this.watch[index].watching = true;
        } else {
            this.watch.push(this.searchNft);
        }
        this.chrome.setNftWatch(
            this.neon.address,
            this.watch,
            this.neon.currentWalletChainType,
            this.global.n3Network.network
        );
        this.global.snackBarTip('addSucc');
    }
}
