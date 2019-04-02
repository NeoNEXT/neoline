import {
    Component,
    OnInit,
    Input,
    Output,
    EventEmitter,
    AfterViewInit
} from '@angular/core';
import {
    Balance,
    NEO,
    GAS,
    EXT,
    EDS
} from '@/models/models';
import { Router, NavigationEnd } from '@angular/router';
import {
    GlobalService,
    AssetState,
} from '@/app/core';

@Component({
    selector: 'balance',
    templateUrl: './balance.component.html',
    styleUrls: ['./balance.component.scss']
})
export class BalanceComponent implements OnInit {
    imageUrl = '';
    isDel: boolean = false;

    @Input() public asset: any;
    @Input() public index: number;
    @Input() public rateCurrency: string;
    @Output() onDelAsset = new EventEmitter < any > ();

    constructor(
        public global: GlobalService,
        private router: Router,
        private assetState: AssetState,
    ) {}

    ngOnInit(): void {
        this.asset.balance = Number(this.asset.balance);
        const assetId = this.asset.asset_id;
        const imageObj = this.assetState.assetFile.get(assetId);
        let lastModified = '';
        if (imageObj) {
            lastModified = imageObj['last-modified'];
            this.imageUrl = imageObj['image-src'];
        }
        this.assetState.getAssetSrc(assetId, lastModified).subscribe(assetRes => {
            if (assetRes && assetRes['status'] === 200) {
                this.assetState.setAssetFile(assetRes, assetId).then(src => {
                    this.imageUrl = src;
                });
            } else if (assetRes && assetRes['status'] === 404) {
                this.imageUrl = '';
            }
        });
        if (!this.asset.balance || this.asset.balance === 0) {
            this.asset.rateBalance = 0;
        }
    }
    public delAsset() {
        this.isDel = true;
        this.onDelAsset.emit(this.index);
    }
    public fixed(assetId: string) {
        return [NEO, GAS].includes(assetId);
    }

    public toDetail() {
        if (this.isDel) {
            this.isDel = false;
        } else {
            this.router.navigate([`/asset/detail/${this.asset.asset_id}`]);
        }
    }
}
