import { Component, OnInit, Input } from '@angular/core';
import { Balance } from '@/models/models';
import { GlobalService } from '@/app/core';

@Component({
    selector: 'app-assets',
    templateUrl: 'assets.component.html',
    styleUrls: ['assets.component.scss']
})
export class PopupAssetsComponent implements OnInit {
    @Input() asset: Balance;
    @Input() public rateCurrency: string;

    // tslint:disable-next-line:no-output-on-prefix

    constructor(public global: GlobalService) {}

    ngOnInit(): void {
        this.asset.balance = Number(this.asset.balance);
        if (!this.asset.balance || this.asset.balance === 0) {
            this.asset.rateBalance = 0;
        }
    }
}
