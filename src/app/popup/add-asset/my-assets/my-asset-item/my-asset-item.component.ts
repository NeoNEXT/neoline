import { Component, OnInit, Input, Output, EventEmitter } from '@angular/core';
import { Balance, NEO, GAS, EXT, EDS } from '@/models/models';
import { GlobalService } from '@/app/core';

@Component({
    selector: 'app-my-asset-item',
    templateUrl: './my-asset-item.component.html',
    styleUrls: ['./my-asset-item.component.scss']
})
export class PopupMyAssetItemComponent implements OnInit {
    @Input() asset: Balance;
    @Input() index: number;
    @Input() isSearchAssets: boolean;

    // tslint:disable-next-line:no-output-on-prefix
    @Output() onAddAsset = new EventEmitter<any>();

    constructor(public global: GlobalService) {}

    ngOnInit(): void {}

    public fixed(assetId: string) {
        return [NEO, GAS, EXT, EDS].includes(assetId);
    }

    public addAsset(index: number) {
        this.onAddAsset.emit(index);
    }
}
