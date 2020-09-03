import { Component, OnInit, ViewChild } from '@angular/core';
import { AssetState, NeonService, ChromeService } from '@/app/core';
import { ActivatedRoute } from '@angular/router';
import { NEO, Balance } from '@/models/models';
import { PopupTxPageComponent } from '@share/components/tx-page/tx-page.component';

@Component({
    templateUrl: 'asset-detail.component.html',
    styleUrls: ['asset-detail.component.scss']
})
export class PopupAssetDetailComponent implements OnInit {
    balance: Balance;
    assetId: string;
    imageUrl = '';
    rateCurrency: string;
    // 交易记录
    @ViewChild('txPage') txPageComponent: PopupTxPageComponent;
    sourceScrollHeight = 0;
    currentTxPage = 1;

    constructor(
        private assetState: AssetState,
        private aRouter: ActivatedRoute,
        private chrome: ChromeService,
        private neon: NeonService
    ) {
        this.rateCurrency = this.assetState.rateCurrency;
    }

    ngOnInit(): void {
        this.aRouter.params.subscribe(async (params: any) => {
            this.assetId = params.assetId || NEO;
            this.imageUrl = await this.assetState.getAssetImage(this.assetId);
            // 获取资产信息
            this.assetState
                .fetchBalance(this.neon.address)
                .subscribe(balanceArr => {
                    this.handlerBalance(balanceArr);
                });
        });
    }
    handlerBalance(balanceRes: Balance[]) {
        this.chrome.getWatch().subscribe(watching => {
            this.findBalance(balanceRes, watching);
            // 获取资产汇率
            this.getAssetRate();
        });
    }

    findBalance(balanceRes, watching) {
        const balance =
            balanceRes.find(b => b.asset_id === this.assetId) ||
            watching.find(w => w.asset_id === this.assetId);
        balance.balance = Number(balance.balance);
        this.balance = balance;
    }

    getAssetRate() {
        if (this.balance.balance && this.balance.balance > 0) {
            this.assetState
                .getAssetRate(this.balance.symbol)
                .subscribe(rateBalance => {
                    if (this.balance.symbol.toLowerCase() in rateBalance) {
                        this.balance.rateBalance =
                            rateBalance[this.balance.symbol.toLowerCase()] *
                            this.balance.balance;
                    }
                });
        } else {
            this.balance.rateBalance = 0;
        }
    }

    public onScrolltaChange(el: Element) {
        const clientHeight = el.clientHeight;
        const scrollHeight = el.scrollHeight;
        const scrollTop = el.scrollTop;
        if (
            scrollHeight - clientHeight < scrollTop + 100 &&
            this.sourceScrollHeight < scrollHeight
        ) {
            this.txPageComponent.getInTransactions(++this.currentTxPage);
            this.sourceScrollHeight = scrollHeight;
        }
    }
}
