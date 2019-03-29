import {
    Component,
    OnInit,
    Input,
    Output,
    EventEmitter
} from '@angular/core';
import {
    Balance,
    NEO,
    GAS,
    EXT,
    EDS
} from '@/models/models';
import {
    GlobalService,
    AssetState,
} from '@/app/core';

@Component({
    selector: 'app-asset-search',
    templateUrl: './asset-search.component.html',
    styleUrls: ['./asset-search.component.scss']
})
export class PopupAssetSearchComponent implements OnInit {
    imageUrl: any;

    @Input() asset: Balance;
    @Input() index: number;

    // tslint:disable-next-line:no-output-on-prefix
    @Output() onAddAsset = new EventEmitter < any > ();

    constructor(
        public global: GlobalService,
        private assetState: AssetState,
    ) {}

    ngOnInit(): void {
        // 获取资产 logo 图片
        const assetId = this.asset.asset_id;
        this.assetState.getAssetSrc(assetId).subscribe(assetRes => {
            if (typeof assetRes === 'string') {
                this.imageUrl = assetRes;
            } else {
                this.assetState.setAssetFile(assetRes, assetId).then(src => {
                    this.imageUrl = src;
                });
            }
        });
    }

    public fixed(assetId: string) {
        return [NEO, GAS, EXT, EDS].includes(assetId);
    }

    public addAsset(index: number) {
        this.onAddAsset.emit(index);
    }


}
