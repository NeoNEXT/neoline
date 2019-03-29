import {
    Component,
    OnInit,
    Input,
    Output,
    EventEmitter,
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
    selector: 'app-asset',
    templateUrl: 'asset.component.html',
    styleUrls: ['asset.component.scss']
})
export class PopupAssetComponent implements OnInit {
    imageUrl: any;

    @Input() asset: Balance;
    @Input() index: number;
    @Input() public rateCurrency: string;

    // tslint:disable-next-line:no-output-on-prefix
    @Output() onDelAsset = new EventEmitter < any > ();

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
        if (!this.asset.balance || this.asset.balance === 0) {
            this.asset.rateBalance = 0;
        }
    }

    public fixed(assetId: string) {
        return [NEO, GAS].includes(assetId);
    }

    public delAsset(index: number) {
        this.onDelAsset.emit(index);
    }
}
