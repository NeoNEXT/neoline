import { Component, OnInit, Input } from '@angular/core';
import { Asset } from '@/models/models';
import { GlobalService } from '@/app/core';
import { bignumber } from 'mathjs';

@Component({
    selector: 'app-assets',
    templateUrl: 'assets.component.html',
    styleUrls: ['assets.component.scss']
})
export class PopupAssetsComponent implements OnInit {
    @Input() asset: Asset;
    @Input() public rateCurrency: string;

    // tslint:disable-next-line:no-output-on-prefix

    constructor(public global: GlobalService) {}

    ngOnInit(): void {
        this.asset.balance = this.asset.balance;
        if (!this.asset.balance || bignumber(this.asset.balance).comparedTo(0) === 0) {
            this.asset.rateBalance = 0;
        }
    }
}
