import { Component, OnInit, Input, Output, EventEmitter } from '@angular/core';
import { NEO, GAS, EXT, EDS, Asset } from '@/models/models';
import { GlobalService } from '@/app/core';
import { bignumber } from 'mathjs';

@Component({
    selector: 'app-my-asset-item',
    templateUrl: './my-asset-item.component.html',
    styleUrls: ['./my-asset-item.component.scss']
})
export class PopupMyAssetItemComponent implements OnInit {

    @Input() asset: Asset;
    @Input() index: number;

    // tslint:disable-next-line:no-output-on-prefix
    @Output() onAddAsset = new EventEmitter<any>();
    @Output() removeAssetOutput = new EventEmitter<any>();

    constructor(public global: GlobalService) { }

    ngOnInit(): void { }

    public fixed() {
        return [NEO, GAS].indexOf(this.asset.asset_id) >= 0
            || (bignumber(this.asset.balance || 0).comparedTo(0) === 1 && this.asset.is_risk !== true);
    }

    public shouldAdd() {
        return bignumber(this.asset.balance || '0').comparedTo(bignumber('0')) === 1
            && this.asset.is_risk !== true
            && !this.asset.watching
    }

    public addAsset(index: number) {
        this.onAddAsset.emit(index);
    }

    public removeAsset(index: number) {
        this.removeAssetOutput.emit(index);
    }
}
