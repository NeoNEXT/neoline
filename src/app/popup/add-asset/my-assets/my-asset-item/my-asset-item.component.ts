import { Component, OnInit, Input, Output, EventEmitter } from '@angular/core';
import { NEO, GAS, Asset } from '@/models/models';
import { GlobalService } from '@/app/core';
import { NEO3_CONTRACT, GAS3_CONTRACT } from '@popup/_lib';

@Component({
    selector: 'app-my-asset-item',
    templateUrl: './my-asset-item.component.html',
    styleUrls: ['./my-asset-item.component.scss'],
})
export class PopupMyAssetItemComponent implements OnInit {
    @Input() asset: Asset;
    @Input() index: number;

    // tslint:disable-next-line:no-output-on-prefix
    @Output() onAddAsset = new EventEmitter<any>();
    @Output() removeAssetOutput = new EventEmitter<any>();

    constructor(public global: GlobalService) {}

    ngOnInit(): void {}

    public showOperate(): boolean {
        return [NEO, GAS, NEO3_CONTRACT, GAS3_CONTRACT].indexOf(
            this.asset.asset_id
        ) >= 0
            ? false
            : true;
    }

    public addAsset(index: number) {
        this.onAddAsset.emit(index);
    }

    public removeAsset(index: number) {
        this.removeAssetOutput.emit(index);
    }
}
