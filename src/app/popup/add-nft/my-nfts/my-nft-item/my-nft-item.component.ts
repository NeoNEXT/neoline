import { Component, OnInit, Input, Output, EventEmitter } from '@angular/core';
import { NftAsset } from '@/models/models';
import { GlobalService } from '@/app/core';

@Component({
    selector: 'app-my-nft-item',
    templateUrl: './my-nft-item.component.html',
    styleUrls: ['./my-nft-item.component.scss'],
})
export class PopupMyNftItemComponent implements OnInit {
    @Input() asset: NftAsset;
    @Input() index: number;

    // tslint:disable-next-line:no-output-on-prefix
    @Output() onAddAsset = new EventEmitter<any>();
    @Output() removeAssetOutput = new EventEmitter<any>();

    constructor(public global: GlobalService) {}

    ngOnInit(): void {}

    public addAsset(index: number) {
        this.onAddAsset.emit(index);
    }

    public removeAsset(index: number) {
        this.removeAssetOutput.emit(index);
    }
}
