import { Component, OnInit, ViewChild } from '@angular/core';
import { GlobalService, NftState, NeonService, ChromeService } from '@/app/core';
import { ActivatedRoute } from '@angular/router';
import { PopupNftTxPageComponent } from './nft-tx-page/nft-tx-page.component';

@Component({
    templateUrl: 'nft-detail.component.html',
    styleUrls: ['nft-detail.component.scss'],
})
export class PopupNftDetailComponent implements OnInit {
    @ViewChild('txPage') txPageComponent: PopupNftTxPageComponent;
    currentTxPage = 1;
    nftContract: string;
    nft;
    selectedIndex = 0;
    // 菜单
    showMenu = false;

    constructor(
        private aRouter: ActivatedRoute,
        private global: GlobalService,
        private nftState: NftState,
        private neonService: NeonService,
        private chrome: ChromeService,
    ) {}

    ngOnInit(): void {
        this.aRouter.params.subscribe(async (params: any) => {
            this.nftContract = params.contract;
            this.getNfts();
        });
    }

    getNfts() {
        this.nftState.getNfts(this.neonService.address).subscribe((res: any[]) => {
            this.nft = res.find((item) => item.contract === this.nftContract);
            if (!this.nft) {
                this.chrome.getNftWatch(this.neonService.address, this.neonService.currentWalletChainType, this.global.n3Network.network).subscribe(res2 => {
                    this.nft = res2.find(m => m.contract === this.nftContract);
                })
            }
        });
    }

    toWeb() {
        this.showMenu = false;
        if (this.global.n3Network.explorer) {
            window.open(`${this.global.n3Network.explorer}tokens/nft/${this.nftContract}`);
        }
    }
    onScrolltaChange(el: Element) {
        const tabGroup = el.children[el.children.length - 1];
        if (
            tabGroup.clientHeight - el.scrollTop < 350 &&
            !this.txPageComponent.loading && !this.txPageComponent.noMoreData
        ) {
            this.txPageComponent.getInTransactions(++this.currentTxPage);
        }
    }
}
