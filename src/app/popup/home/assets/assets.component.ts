import { Component, OnInit, Input } from '@angular/core';
import { Asset } from '@/models/models';
import {
    GlobalService,
    AssetState,
    ChromeService,
    NeonService,
} from '@/app/core';
import { forkJoin } from 'rxjs';
import BigNumber from 'bignumber.js';

@Component({
    selector: 'app-assets',
    templateUrl: 'assets.component.html',
    styleUrls: ['assets.component.scss'],
})
export class PopupAssetsComponent implements OnInit {
    @Input() public rateCurrency: string;
    myAssets: Asset[];
    private networkId: number;
    isLoading = false;

    constructor(
        private asset: AssetState,
        private chrome: ChromeService,
        private neon: NeonService,
        private global: GlobalService
    ) {}

    ngOnInit(): void {
        this.networkId =
            this.neon.currentWalletChainType === 'Neo2'
                ? this.global.n2Network.id
                : this.global.n3Network.id;
        this.getAssets();
    }

    getAssets() {
        this.isLoading = true;
        const getMoneyBalance = this.asset.getAddressBalances(
            this.neon.address
        );
        const getWatch = this.chrome.getWatch(
            this.networkId,
            this.neon.address
        );
        forkJoin([getMoneyBalance, getWatch]).subscribe((res) => {
            const [moneyAssets, watch] = [...res];
            let showAssets = [...moneyAssets];
            watch.forEach((item) => {
                const index = showAssets.findIndex(
                    (m) => m.asset_id === item.asset_id
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
            this.myAssets = showAssets;
            this.getAssetsRate();
            this.isLoading = false;
        });
    }
    async getAssetsRate() {
        for (let i = 0; i < this.myAssets.length; i++) {
            const item = this.myAssets[i];
            if (new BigNumber(item.balance).comparedTo(0) > 0) {
                const rate = await this.asset.getAssetRate(
                    item.symbol,
                    item.asset_id
                );
                if (rate) {
                    item.rateBalance = new BigNumber(item.balance)
                        .times(rate)
                        .toFixed();
                }
            }
        }
    }
}
